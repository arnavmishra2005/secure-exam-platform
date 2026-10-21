import { app, session, type BrowserWindow } from 'electron';
import * as path from 'path';
import { installAppProtocol, registerAppScheme } from './appProtocol';
import { API_URL, CLIENT_TYPE_HEADER } from './config';
import { deepLinkFromArgv, pathForDeepLink, PROTOCOL } from './deepLink';
import { installDisplayMonitor } from './displayMonitor';
import { isSecurityActive, setQuitting } from './examState';
import { installFocusMonitor } from './focusMonitor';
import { installInputGuard } from './inputGuard';
import { registerIpcHandlers } from './ipc/channels';
import { installNavigationGuard } from './navigationGuard';
import { emitSecurityEvent } from './securityEvents';
import { appBaseUrl, createKioskWindow } from './windowManager';

// Single-instance lock: a second launch (for example a secure-exam:// link
// clicked in the browser) is handed to the running copy instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

registerAppScheme(); // must run before the app is ready

let mainWindow: BrowserWindow | null = null;
let pendingLink: string | null = deepLinkFromArgv(process.argv);

// Register as the handler of secure-exam:// links. When running from source on
// Windows/Linux the launcher needs the script path; macOS only honours this in a packaged app.
if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

/** Open the exam named by a link. Ignored while an exam is already running. */
function openLink(raw: string): void {
  const target = pathForDeepLink(raw);
  if (!target) return;
  if (!mainWindow) {
    pendingLink = raw;
    return;
  }
  if (isSecurityActive()) return; // never pull the student out of an exam in progress
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  void mainWindow.loadURL(`${appBaseUrl()}${target}`);
}

// macOS delivers links through this event, Linux/Windows through the second instance's argv.
app.on('open-url', (event, url) => {
  event.preventDefault();
  openLink(url);
});
app.on('second-instance', (_event, argv) => {
  const link = deepLinkFromArgv(argv);
  if (link) openLink(link);
  else mainWindow?.focus();
});

// Quit guard. Cmd+Q, the dock menu, "quit" from the OS and app.quit() all arrive here.
// While an exam is running only the PIN-protected exit may quit: it clears the
// exam state first, which is why isSecurityActive() is false on that path.
app.on('before-quit', (event) => {
  if (isSecurityActive()) {
    event.preventDefault();
    emitSecurityEvent(mainWindow, 'BLOCKED_SHORTCUT', 'Quit blocked during the exam');
    return;
  }
  setQuitting(true);
});

app.whenReady().then(() => {
  installAppProtocol();

  // Tell the API this is the exam app, so it refuses administrator sign-ins and
  // lets the exam be started and answered only from here.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${new URL(API_URL).origin}/*`] }, (details, done) => {
    done({ requestHeaders: { ...details.requestHeaders, [CLIENT_TYPE_HEADER]: 'DESKTOP' } });
  });

  const initialPath = (pendingLink && pathForDeepLink(pendingLink)) || '/';
  pendingLink = null;
  const win = createKioskWindow(initialPath);
  mainWindow = win;

  // Alt+F4 / the window's close button during an exam is refused and recorded.
  win.on('close', (event) => {
    if (isSecurityActive()) {
      event.preventDefault();
      emitSecurityEvent(win, 'BLOCKED_SHORTCUT', 'Window close blocked during the exam');
    }
  });

  installNavigationGuard(win);
  installInputGuard(win);
  installFocusMonitor(win);
  installDisplayMonitor(win);
  registerIpcHandlers(win);
});

// ponytail: in a real kiosk deployment the session manager relaunches the app on exit.
app.on('window-all-closed', () => {
  app.quit();
});
