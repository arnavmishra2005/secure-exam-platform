"""Temporary, current-user GNOME shortcut lease. No root or system files.

The parent keeps stdin open. EOF/crash/signals restore the user's exact overrides
(including resetting keys that originally used defaults). A durable journal lets
the next launch recover after a power loss or a killed worker. Import is inert so
the lease can be tested without GI, D-Bus or access to desktop preferences.
"""
import json
import os
from pathlib import Path


class SettingsLease:
    def __init__(self, backend, journal):
        self.backend = backend
        self.journal = Path(journal)

    def flush(self):
        if hasattr(self.backend, 'flush'):
            self.backend.flush()

    def save(self, rows):
        temporary = self.journal.with_suffix('.tmp')
        with temporary.open('w', encoding='utf8') as stream:
            os.chmod(temporary, 0o600)
            json.dump(rows, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, self.journal)

    def restore(self):
        if not self.journal.exists():
            return
        rows = json.loads(self.journal.read_text())
        failed = []
        for row in reversed(rows):
            try:
                # Do not overwrite a preference changed independently meanwhile.
                if self.backend.get(row['schema'], row['key']) == row['disabled']:
                    self.backend.write(row['schema'], row['key'], row['original'])
            except Exception:
                failed.append(row)
        try:
            self.flush()
        except Exception:
            self.save(rows)
            raise
        if failed:
            self.save(failed)
            raise RuntimeError('Some shortcuts could not be restored; restart the exam app to retry recovery')
        self.journal.unlink(missing_ok=True)

    def acquire(self, cancelled=lambda: False):
        self.restore()
        rows = []
        for schema, key, disabled in self.backend.targets():
            current = self.backend.get(schema, key)
            if current == disabled:
                continue
            if not self.backend.writable(schema, key):
                raise RuntimeError(f'The desktop administrator has locked {schema}.{key}')
            rows.append(dict(schema=schema, key=key, disabled=disabled,
                             original=self.backend.user_value(schema, key)))
        self.save(rows)  # Persist every original value before the first change.
        try:
            for row in rows:
                if cancelled():
                    raise RuntimeError('Exam app closed during shortcut setup')
                self.backend.write(row['schema'], row['key'], row['disabled'])
            self.flush()
            for row in rows:
                if self.backend.get(row['schema'], row['key']) != row['disabled']:
                    raise RuntimeError('The desktop did not accept shortcut protection')
        except BaseException:
            self.restore()
            raise


class GioBackend:
    def __init__(self):
        if os.environ.get('GSETTINGS_BACKEND', 'dconf') != 'dconf':
            raise RuntimeError('Shortcut protection requires the GNOME dconf settings backend')
        from gi.repository import Gio, GLib
        self.Gio, self.GLib = Gio, GLib
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.source = Gio.SettingsSchemaSource.get_default()
        self.settings = {}

    def setting(self, schema):
        if schema not in self.settings:
            definition = self.source.lookup(schema, True)
            if definition is None:
                raise RuntimeError(f'GNOME settings schema unavailable: {schema}')
            self.settings[schema] = self.Gio.Settings.new_full(definition, None, None)
            self.settings[schema].delay()
        return self.settings[schema]

    def get(self, schema, key):
        return self.setting(schema).get_value(key).print_(True)

    def user_value(self, schema, key):
        value = self.setting(schema).get_user_value(key)
        return value.print_(True) if value is not None else None

    def writable(self, schema, key):
        return self.setting(schema).is_writable(key)

    def write(self, schema, key, value):
        setting = self.setting(schema)
        if value is None:
            setting.reset(key)
        else:
            variant = self.GLib.Variant.parse(setting.get_value(key).get_type(), value, None, None)
            if not setting.set_value(key, variant):
                raise RuntimeError(f'Unable to change {schema}.{key}')

    def flush(self):
        # Commit one transaction per schema, not one synchronous disk write per
        # key. On slower disks the former per-key sync exceeded the launch timeout.
        for setting in self.settings.values():
            setting.apply()
        self.Gio.Settings.sync()

    def targets(self):
        # These are desktop escape bindings, not text-editing or accessibility keys.
        schemas = ['org.gnome.desktop.wm.keybindings', 'org.gnome.shell.keybindings',
                   'org.gnome.mutter.keybindings', 'org.gnome.mutter.wayland.keybindings']
        self.setting(schemas[0])  # The core schema is required, never silently skipped.
        for schema in schemas:
            definition = self.source.lookup(schema, True)
            if definition is None:
                continue
            for key in definition.list_keys():
                if key.startswith('switch-input-source'):
                    continue
                if self.setting(schema).get_value(key).get_type_string() == 'as':
                    yield schema, key, '@as []'
        schema = 'org.gnome.settings-daemon.plugins.media-keys'
        definition = self.source.lookup(schema, True)
        if definition is not None:
            escapes = {'logout', 'screensaver', 'terminal', 'home', 'www', 'email',
                       'help', 'search', 'calculator', 'control-center', 'custom-keybindings',
                       'screenshot', 'window-screenshot', 'area-screenshot', 'screencast',
                       'screenshot-clip', 'window-screenshot-clip', 'area-screenshot-clip'}
            for key in definition.list_keys():
                if key.removesuffix('-static') in escapes:
                    kind = self.setting(schema).get_value(key).get_type_string()
                    if kind in ('as', 's'):
                        yield schema, key, '@as []' if kind == 'as' else "''"
        for schema, key, value in [
            ('org.gnome.mutter', 'overlay-key', "''"),
            ('org.gnome.desktop.interface', 'enable-hot-corners', 'false'),
            ('org.gnome.shell.extensions.dash-to-dock', 'hot-keys', 'false'),
        ]:
            definition = self.source.lookup(schema, True)
            if definition is not None and definition.has_key(key):
                yield schema, key, value


def main():
    import fcntl
    import signal
    import sys
    import threading
    journal = Path(sys.argv[1])
    journal.parent.mkdir(parents=True, exist_ok=True)
    # Serialise workers across a rapid app restart. Never restore a live lease.
    with journal.with_suffix('.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        backend = GioBackend()
        lease = SettingsLease(backend, journal)
        if '--recover' in sys.argv:
            lease.restore()
            return
        stop = threading.Event()
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
        signal.signal(signal.SIGINT, lambda *_: stop.set())
        threading.Thread(target=lambda: (sys.stdin.read(), stop.set()), daemon=True).start()
        try:
            lease.acquire(stop.is_set)
            if stop.is_set():
                return
            print(json.dumps({'ok': True}), flush=True)
            while not stop.wait(0.25):
                # Drain settings notifications so restoration sees external edits.
                context = backend.GLib.MainContext.default()
                while context.pending():
                    context.iteration(False)
        finally:
            lease.restore()


if __name__ == '__main__':
    import sys
    try:
        main()
    except BaseException as error:
        print(json.dumps({'ok': False, 'reason': str(error)}), flush=True)
        sys.exit(1)
