"""No desktop access: exercise recovery against an in-memory settings backend."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import json
import select
import subprocess
import sys

source = Path(__file__).parents[1] / 'src/main/platform/gnome-shortcut-worker.py'
spec = importlib.util.spec_from_file_location('shortcut_worker', source)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class FakeBackend:
    def __init__(self):
        self.defaults = {'switch-applications': "['<Alt>Tab']", 'show-desktop': "['<Super>d']"}
        self.overrides = {'show-desktop': "['<Super>m']"}
        self.fail_key = None
        self.locked_key = None

    def targets(self):
        return [('wm', key, '@as []') for key in self.defaults]

    def get(self, schema, key):
        return self.overrides.get(key, self.defaults[key])

    def user_value(self, schema, key):
        return self.overrides.get(key)

    def writable(self, schema, key):
        return key != self.locked_key

    def write(self, schema, key, value):
        if key == self.fail_key and value == '@as []':
            raise RuntimeError('Simulated settings write failure')
        if value is None:
            self.overrides.pop(key, None)
        else:
            self.overrides[key] = value


class ShortcutLeaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.journal = Path(self.directory.name) / 'lease.json'
        self.backend = FakeBackend()
        self.original = dict(self.backend.overrides)
        self.lease = worker.SettingsLease(self.backend, self.journal)

    def test_restores_custom_bindings_and_default_inheritance(self):
        self.lease.acquire()
        self.assertTrue(self.journal.exists())
        self.assertTrue(all(self.backend.get('wm', key) == '@as []' for key in self.backend.defaults))
        self.lease.restore()
        self.assertEqual(self.backend.overrides, self.original)
        self.assertFalse(self.journal.exists())

    def test_failed_acquisition_rolls_back_every_changed_key(self):
        self.backend.fail_key = 'show-desktop'
        with self.assertRaises(RuntimeError):
            self.lease.acquire()
        self.assertEqual(self.backend.overrides, self.original)
        self.assertFalse(self.journal.exists())

    def test_locked_preferences_are_detected_before_any_changes(self):
        self.backend.locked_key = 'show-desktop'
        with self.assertRaises(RuntimeError):
            self.lease.acquire()
        self.assertEqual(self.backend.overrides, self.original)
        self.assertFalse(self.journal.exists())

    def test_a_new_process_recovers_the_persisted_journal(self):
        self.lease.acquire()
        worker.SettingsLease(self.backend, self.journal).restore()
        self.assertEqual(self.backend.overrides, self.original)

    def test_independent_changes_are_not_overwritten(self):
        self.lease.acquire()
        self.backend.overrides['show-desktop'] = "['<Super>F9']"
        self.lease.restore()
        self.assertEqual(self.backend.overrides, {'show-desktop': "['<Super>F9']"})

    def test_parent_exit_during_acquisition_restores_the_journal(self):
        checks = iter([False, True])
        with self.assertRaises(RuntimeError):
            self.lease.acquire(lambda: next(checks))
        self.assertEqual(self.backend.overrides, self.original)
        self.assertFalse(self.journal.exists())

    def test_repeated_acquisition_recovers_originals_before_reapplying(self):
        self.lease.acquire()
        self.lease.acquire()
        self.lease.restore()
        self.assertEqual(self.backend.overrides, self.original)

    def test_settings_are_flushed_once_per_batch_not_once_per_key(self):
        flushes = []
        self.backend.flush = lambda: flushes.append(dict(self.backend.overrides))
        self.lease.acquire()
        self.assertEqual(len(flushes), 1)
        self.assertTrue(all(value == '@as []' for value in flushes[0].values()))
        self.lease.restore()
        self.assertEqual(len(flushes), 2)
        self.assertEqual(flushes[1], self.original)

    def test_worker_restores_on_parent_pipe_close_and_termination(self):
        # Run the actual watchdog loop, substituting only the desktop backend.
        # No test imports GI or touches GNOME settings.
        script = r'''
import importlib.util, json, sys
from pathlib import Path
source, journal, state = sys.argv[1:]
spec = importlib.util.spec_from_file_location('worker', source)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Backend:
    values = {}
    class GLib:
        class MainContext:
            @staticmethod
            def default(): return Backend.GLib.MainContext()
            def pending(self): return False
    def targets(self): return [('wm', 'switch', '@as []')]
    def get(self, schema, key): return self.values.get(key, "['<Alt>Tab']")
    def user_value(self, schema, key): return self.values.get(key)
    def writable(self, schema, key): return True
    def write(self, schema, key, value):
        if value is None: self.values.pop(key, None)
        else: self.values[key] = value
        Path(state).write_text(json.dumps(self.values))
m.GioBackend = Backend
sys.argv = ['worker', journal]
m.main()
'''
        for end in ('parent-exit', 'termination'):
            with self.subTest(end=end):
                state = Path(self.directory.name) / 'state.json'
                child = subprocess.Popen([sys.executable, '-B', '-c', script, str(source), str(self.journal), str(state)],
                                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                try:
                    self.assertTrue(select.select([child.stdout], [], [], 5)[0], 'worker did not acknowledge readiness')
                    self.assertEqual(json.loads(child.stdout.readline()), {'ok': True})
                    self.assertEqual(json.loads(state.read_text()), {'switch': '@as []'})
                    if end == 'parent-exit':
                        child.stdin.close()
                        child.stdin = None
                    else:
                        child.terminate()
                    _, stderr = child.communicate(timeout=5)
                    self.assertEqual(child.returncode, 0, stderr)
                    self.assertEqual(json.loads(state.read_text()), {})
                    self.assertFalse(self.journal.exists())
                finally:
                    if child.poll() is None:
                        child.kill()
                        child.communicate()


if __name__ == '__main__':
    unittest.main()
