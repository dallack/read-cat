import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { EventCode } from '../events';
import { createPluginDevtoolsWindow } from './plugin-devtools';
import { PluginDevtoolsEventCode } from '../events/plugin-devtools';
import { useShortcutKey } from './hooks/shortcut-key';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { useCache } from './hooks/cache';
import { useListener } from './hooks/listener';
import { useDialog } from './hooks/dialog';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const portableDataPath = process.env.READCAT_PORTABLE_DATA_DIR ||
  path.join(app.isPackaged ? path.dirname(process.execPath) : process.cwd(), 'data');
const portableDataRootPath = path.resolve(portableDataPath);
const portableRuntimePath = path.join(portableDataRootPath, 'runtime');
app.setPath('userData', portableRuntimePath);

const lowElectronVersion = Number(process.versions.electron.split('.')[0]) <= 22;

app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
lowElectronVersion && app.commandLine.appendSwitch('enable-experimental-web-platform-features');

let win: BrowserWindow | null;
let pluginDevtoolsWin: BrowserWindow | null = null;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const icon = path.join(process.env.VITE_PUBLIC, 'icons/icon.ico');
const windowSizeConfigPath = path.join(app.getPath('userData'), 'window_size');
const windowTransparentPath = path.join(app.getPath('userData'), 'window_transparent');
const isTransparent = existsSync(windowTransparentPath);
const isOverwriteTitleBar = process.platform === 'linux' || lowElectronVersion;

const debugModePath = path.join(app.getPath('userData'), 'debug_mode');
const isDebugMode = existsSync(debugModePath);

type ScrapeDynamicPageOptions = {
  timeout?: number,
  delay?: number,
  waitForSelector?: string,
  userAgent?: string,
  headers?: Record<string, string>
}

const normalizeTimeout = (value?: number) => {
  return Math.max(1000, Math.min(Number(value) || 15000, 60000));
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const waitForSelector = async (target: BrowserWindow, selector: string, timeout: number) => {
  const escapedSelector = JSON.stringify(selector);
  await target.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const selector = ${escapedSelector};
      const deadline = Date.now() + ${timeout};
      const check = () => {
        if (document.querySelector(selector)) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error('waitForSelector timeout: ' + selector));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })
  `);
}

const scrapeDynamicPage = async (url: string, options: ScrapeDynamicPageOptions = {}) => {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Only http/https URLs are supported');
  }

  const timeout = normalizeTimeout(options.timeout);
  const target = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  try {
    if (options.userAgent) {
      target.webContents.setUserAgent(options.userAgent);
    }

    const loadOptions = options.headers ? {
      extraHeaders: Object.entries(options.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    } : void 0;

    const load = target.loadURL(url, loadOptions);
    await Promise.race([
      load,
      sleep(timeout).then(() => {
        throw new Error(`Dynamic page load timeout: ${url}`);
      })
    ]);

    if (options.waitForSelector) {
      await waitForSelector(target, options.waitForSelector, timeout);
    }

    if (options.delay && options.delay > 0) {
      await sleep(Math.min(options.delay, timeout));
    }

    return target.webContents.executeJavaScript('document.documentElement.outerHTML');
  } finally {
    target.destroy();
  }
}

function createWindow(width?: number, height?: number) {
  win = new BrowserWindow({
    title: 'ReadCat',
    width: (width === void 0 || width < 950) ? 950 : width,
    height: (height === void 0 || height < 650) ? 650 : height,
    minWidth: 950,
    minHeight: 650,
    frame: !isOverwriteTitleBar,
    icon,
    titleBarStyle: isOverwriteTitleBar ? void 0 : 'hidden',
    titleBarOverlay: isOverwriteTitleBar ? void 0 : {
      color: lowElectronVersion ? '#E6EAEF' : '#00000000',
      symbolColor: '#2D2D2D',
      height: 35
    },
    backgroundColor: '#E6EAEF',
    transparent: isTransparent,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      nodeIntegrationInWorker: true,
      contextIsolation: false
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win?.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'));
    isDebugMode && win?.webContents.openDevTools();
  }
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url);
    return {
      action: 'deny'
    }
  });
  
  win.webContents.on('will-navigate', (e, url) => {
    if (
      VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)
      || !VITE_DEV_SERVER_URL && url.startsWith(path.join(process.env.DIST, 'index.html'))
    ) {
      return;
    }
    e.preventDefault();
    shell.openExternal(url);
  });

  useListener({
    win,
    pluginDevtoolsWin,
    transparent: isTransparent,
    windowSizeConfigPath,
    isOverwriteTitleBar
  });
  useCache();
  useDialog();

  ipcMain.removeHandler(EventCode.ASYNC_SCRAPE_DYNAMIC_PAGE);
  ipcMain.handle(EventCode.ASYNC_SCRAPE_DYNAMIC_PAGE, (_, url: string, options?: ScrapeDynamicPageOptions) => {
    return scrapeDynamicPage(url, options);
  });

  (process.platform === 'win32') && ipcMain.on(EventCode.ASYNC_SET_TITLE_BAR_STYLE, (_, bgcolor, textcolor) => {
    if (isOverwriteTitleBar) {
      return;
    }
    win?.setTitleBarOverlay({
      color: `${bgcolor.trim()}00`.slice(0, lowElectronVersion ? 7 : 9),
      symbolColor: textcolor.trim()
    });
  });
  if (isOverwriteTitleBar) {
    win.on('close', e => {
      e.preventDefault();
      win?.webContents.send(EventCode.ASYNC_CLOSE_WINDOW);
    });
    ipcMain.on(EventCode.ASYNC_CLOSE_WINDOW, () => {
      app.quit();
      win = null;
      process.exit(0);
    });
  }
  ipcMain.on(EventCode.ASYNC_SET_WINDOW_MINIMIZE, () => {
    win?.minimize();
  });
  ipcMain.on(EventCode.ASYNC_SET_WINDOW_MAXIMIZE_OR_RESTORE, () => {
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on(EventCode.SYNC_IS_DEV, e => {
    e.returnValue = isDebugMode ? true : !!VITE_DEV_SERVER_URL;
  });
  ipcMain.on(EventCode.SYNC_GET_USER_DATA_PATH, e => {
    e.returnValue = app.getPath('userData');
  });
  ipcMain.on(EventCode.SYNC_GET_DATA_PATH, e => {
    e.returnValue = portableDataRootPath;
  });
  ipcMain.on(EventCode.ASYNC_WINDOW_SET_FULLSCREEN, (_, is) => {
    win?.setFullScreen(is);
  });
  ipcMain.on(EventCode.ASYNC_OPEN_DEVTOOLS, () => {
    if (win?.webContents.isDevToolsOpened()) {
      return;
    }
    win?.webContents.openDevTools();
  });
  ipcMain.on(EventCode.ASYNC_ZOOM_WINDOW, (_, val) => {
    if (win?.webContents.getZoomFactor() === val) {
      return;
    }
    win?.webContents.setZoomFactor(val);
  });
  ipcMain.on(EventCode.ASYNC_REBOOT_APPLICATION, () => {
    app.relaunch();
    app.exit();
  });

  const { register, unregister } = useShortcutKey(win);
  ipcMain.on(EventCode.ASYNC_REGISTER_SHORTCUT_KEY, (e, key, skey) => {
    e.sender.send(EventCode.ASYNC_REGISTER_SHORTCUT_KEY, key, skey, register(key, skey));
  });
  ipcMain.on(EventCode.ASYNC_UNREGISTER_SHORTCUT_KEY, (_, skey) => {
    unregister(skey);
  });
  ipcMain.once(EventCode.ASYNC_INIT_GLOBAL_SHORTCUT_KEY, (e, arr: [string, string][]) => {
    const res: [string, string, boolean][] = [];

    for (const [key, skey] of arr) {
      res.push([key, skey, register(key, skey)]);
    }
    e.sender.send(EventCode.ASYNC_INIT_GLOBAL_SHORTCUT_KEY, res);
  });
  ipcMain.on(EventCode.ASYNC_SET_WINDOW_BACKGROUND_COLOR, (_, color) => {
    win?.setBackgroundColor(color);
  });

  ipcMain.on(PluginDevtoolsEventCode.ASYNC_CREATE_PLUGIN_DEVTOOLS_WINDOW, (_, url) => {
    pluginDevtoolsWin = createPluginDevtoolsWindow(url, icon);
    pluginDevtoolsWin.on('closed', () => {
      win?.webContents.send(EventCode.ASYNC_PLUGIN_WINDOW_CLOSED);
    });
  });
  ipcMain.on(PluginDevtoolsEventCode.ASYNC_CLOSE_PLUGIN_DEVTOOLS_WINDOW, () => {
    pluginDevtoolsWin?.destroy();
    pluginDevtoolsWin = null;
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) {
      return;
    }
    win.isMinimized() && win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    try {
      const config = await fs.readFile(windowSizeConfigPath, { encoding: 'utf-8' });
      const { width, height } = JSON.parse(config);
      createWindow(width, height);
    } catch (e) {
      createWindow();
    }
  });
}


