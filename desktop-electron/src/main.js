const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
  shell,
} = require("electron");
const log = require("electron-log/main");
const { autoUpdater } = require("electron-updater");

function parseEnvContent(content) {
  const out = {};
  for (const line of String(content || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function readEnvFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return {};
    return parseEnvContent(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function loadRuntimeFileEnv() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".env"),
    path.join(cwd, "backend", ".env"),
    path.resolve(cwd, "..", "backend", ".env"),
    path.join(process.resourcesPath || "", "bhash.env"),
  ];

  const out = {};
  for (const candidate of candidates) Object.assign(out, readEnvFile(candidate));
  return out;
}

function loadBundledDefaults() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "defaults.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const RUNTIME_FILE_ENV = loadRuntimeFileEnv();
const BUNDLED_DEFAULTS = loadBundledDefaults();

function pickEnvValue(...keys) {
  for (const key of keys) {
    const fromProcess = process.env[key];
    if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  }
  for (const key of keys) {
    const fromFile = RUNTIME_FILE_ENV[key];
    if (typeof fromFile === "string" && fromFile.trim()) return fromFile.trim();
  }
  return "";
}

const DEFAULT_SERVER_URL =
  pickEnvValue("BHASH_DESKTOP_SERVER_URL", "CHAT_WEB_URL", "APP_CHAT_URL") ||
  (typeof BUNDLED_DEFAULTS.serverUrl === "string" ? BUNDLED_DEFAULTS.serverUrl.trim() : "") ||
  "http://localhost:5173";
const DEFAULT_UPDATE_URL =
  pickEnvValue("BHASH_DESKTOP_UPDATE_URL", "DESKTOP_UPDATE_URL") ||
  (typeof BUNDLED_DEFAULTS.updateUrl === "string" ? BUNDLED_DEFAULTS.updateUrl.trim() : "") ||
  "https://updates.bhash.com/desktop/win";

const DEFAULT_MAIN_WINDOW = {
  width: 1420,
  height: 920,
  minWidth: 1080,
  minHeight: 700,
};

const DEFAULT_CONFIG = {
  serverUrl: DEFAULT_SERVER_URL,
  updateUrl: DEFAULT_UPDATE_URL,
  autoStart: true,
  minimizeToTray: true,
  windowState: {
    width: DEFAULT_MAIN_WINDOW.width,
    height: DEFAULT_MAIN_WINDOW.height,
    isMaximized: false,
    isFullScreen: false,
  },
};

const UPDATE_EVENT_CHANNEL = "desktop:update-status";
const SERVER_EVENT_CHANNEL = "desktop:server-updated";
const NOTIFICATION_CLICK_CHANNEL = "desktop:notification-click";
const APP_DISPLAY_NAME = "BHash Chat";

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let isQuitting = false;
let config = null;
let updateTimer = null;
let pendingNotificationTarget = null;
let saveWindowStateTimer = null;
let activeNativeNotification = null;

log.initialize();
log.transports.file.level = "info";

function configPath() {
  return path.join(app.getPath("userData"), "desktop-config.json");
}

function normalizeHttpUrl(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeWindowState(input) {
  if (!input || typeof input !== "object") return null;

  const out = {
    width: Number.isFinite(Number(input.width))
      ? Math.max(DEFAULT_MAIN_WINDOW.minWidth, Math.round(Number(input.width)))
      : DEFAULT_MAIN_WINDOW.width,
    height: Number.isFinite(Number(input.height))
      ? Math.max(DEFAULT_MAIN_WINDOW.minHeight, Math.round(Number(input.height)))
      : DEFAULT_MAIN_WINDOW.height,
    isMaximized: !!input.isMaximized,
    isFullScreen: !!input.isFullScreen,
  };

  if (Number.isFinite(Number(input.x))) out.x = Math.round(Number(input.x));
  if (Number.isFinite(Number(input.y))) out.y = Math.round(Number(input.y));

  return out;
}

function loadConfig() {
  const file = configPath();
  let stored = {};

  try {
    if (fs.existsSync(file)) {
      stored = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch (error) {
    log.warn("Could not read desktop config file:", error);
  }

  const serverUrl = normalizeHttpUrl(stored.serverUrl) || normalizeHttpUrl(DEFAULT_CONFIG.serverUrl);
  const updateUrl = normalizeHttpUrl(stored.updateUrl) || normalizeHttpUrl(DEFAULT_CONFIG.updateUrl);
  const windowState = normalizeWindowState(stored.windowState) || DEFAULT_CONFIG.windowState;

  return {
    ...DEFAULT_CONFIG,
    ...stored,
    serverUrl: serverUrl || DEFAULT_CONFIG.serverUrl,
    updateUrl: updateUrl || DEFAULT_CONFIG.updateUrl,
    autoStart: stored.autoStart !== undefined ? !!stored.autoStart : DEFAULT_CONFIG.autoStart,
    minimizeToTray:
      stored.minimizeToTray !== undefined
        ? !!stored.minimizeToTray
        : DEFAULT_CONFIG.minimizeToTray,
    windowState,
  };
}

function saveConfig(nextPartial) {
  const nextConfig = {
    ...(config || DEFAULT_CONFIG),
    ...nextPartial,
  };

  if (nextPartial && Object.prototype.hasOwnProperty.call(nextPartial, "windowState")) {
    nextConfig.windowState =
      normalizeWindowState(nextPartial.windowState) ||
      normalizeWindowState(config?.windowState) ||
      DEFAULT_CONFIG.windowState;
  }

  config = {
    ...nextConfig,
  };

  const file = configPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    log.error("Could not write desktop config file:", error);
  }

  return config;
}

function appIconPath() {
  const local = path.join(__dirname, "assets", "BHash_Electron.png");
  return fs.existsSync(local) ? local : null;
}

function emitToAllWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

function emitUpdateStatus(payload) {
  emitToAllWindows(UPDATE_EVENT_CHANNEL, payload);
}

function emitNotificationClick(payload) {
  if (!payload) return;
  emitToAllWindows(NOTIFICATION_CLICK_CHANNEL, payload);
}

function collectWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const isFullScreen = mainWindow.isFullScreen();
  const isMaximized = mainWindow.isMaximized();
  const bounds = isMaximized || isFullScreen ? mainWindow.getNormalBounds() : mainWindow.getBounds();

  return normalizeWindowState({
    ...bounds,
    isMaximized,
    isFullScreen,
  });
}

function saveWindowStateNow() {
  const state = collectWindowState();
  if (!state) return;
  saveConfig({ windowState: state });
}

function scheduleSaveWindowState() {
  if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer);
  saveWindowStateTimer = setTimeout(() => {
    saveWindowStateTimer = null;
    saveWindowStateNow();
  }, 220);
}

function applyConfiguredWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const state = normalizeWindowState(config?.windowState);
  if (!state) return;

  if (typeof state.x === "number" && typeof state.y === "number") {
    mainWindow.setBounds({ x: state.x, y: state.y, width: state.width, height: state.height });
  } else {
    mainWindow.setSize(state.width, state.height);
  }

  if (state.isFullScreen) {
    mainWindow.setFullScreen(true);
    return;
  }

  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }

  if (state.isMaximized) {
    mainWindow.maximize();
  } else if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }
}

function showMainWindow({ restoreState = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  if (restoreState) applyConfiguredWindowState();
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function createMainWindow() {
  const icon = appIconPath();
  const state = normalizeWindowState(config?.windowState) || DEFAULT_CONFIG.windowState;
  const browserWindowOptions = {
    width: state?.width ?? DEFAULT_MAIN_WINDOW.width,
    height: state?.height ?? DEFAULT_MAIN_WINDOW.height,
    minWidth: DEFAULT_MAIN_WINDOW.minWidth,
    minHeight: DEFAULT_MAIN_WINDOW.minHeight,
    show: false,
    backgroundColor: "#06090f",
    autoHideMenuBar: true,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  if (typeof state?.x === "number" && typeof state?.y === "number") {
    browserWindowOptions.x = state.x;
    browserWindowOptions.y = state.y;
  }

  mainWindow = new BrowserWindow(browserWindowOptions);

  mainWindow.once("ready-to-show", () => {
    applyConfiguredWindowState();
    mainWindow.show();
    scheduleSaveWindowState();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingNotificationTarget) {
      emitNotificationClick(pendingNotificationTarget);
    }
  });

  mainWindow.on("close", (event) => {
    saveWindowStateNow();
    const canHideToTray = config?.minimizeToTray && tray;
    if (!isQuitting && canHideToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("resize", () => scheduleSaveWindowState());
  mainWindow.on("move", () => scheduleSaveWindowState());
  mainWindow.on("maximize", () => scheduleSaveWindowState());
  mainWindow.on("unmaximize", () => scheduleSaveWindowState());
  mainWindow.on("enter-full-screen", () => scheduleSaveWindowState());
  mainWindow.on("leave-full-screen", () => scheduleSaveWindowState());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(config.serverUrl);
}

function createTray() {
  if (tray) return;

  const iconPath = appIconPath();
  if (!iconPath) {
    log.warn("Tray icon not found, tray disabled.");
    return;
  }

  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    log.warn("Tray icon file is empty, tray disabled.");
    return;
  }
  if (process.platform === "win32") {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(trayIcon);
  tray.setToolTip(APP_DISPLAY_NAME);
  tray.on("double-click", () => showMainWindow());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Abrir ${APP_DISPLAY_NAME}`,
      click: () => showMainWindow(),
    },
    {
      label: "Minhas configuracoes",
      click: () => openSettingsWindow(),
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 520,
    minWidth: 520,
    minHeight: 500,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: "#0a121d",
    title: `${APP_DISPLAY_NAME} - Minhas configuracoes`,
    parent: mainWindow || undefined,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  void settingsWindow.loadFile(path.join(__dirname, "setup.html"));
}

function applyAutoStartSetting(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
  } catch (error) {
    log.error("Could not set auto-start:", error);
  }
}

function notifyNative(payload) {
  if (!Notification.isSupported()) {
    return { ok: false, error: "Notification API not supported." };
  }

  const title =
    typeof payload?.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : APP_DISPLAY_NAME;
  const body = typeof payload?.body === "string" ? payload.body : "";
  const silent = payload?.silent ?? !payload?.playSound;
  const conversationId =
    typeof payload?.conversationId === "string" && payload.conversationId.trim()
      ? payload.conversationId.trim()
      : null;
  const messageId =
    typeof payload?.messageId === "string" && payload.messageId.trim()
      ? payload.messageId.trim()
      : null;

  // Mantem apenas uma notificacao ativa. Nova notificacao sobrepoe a anterior.
  if (activeNativeNotification) {
    try {
      activeNativeNotification.removeAllListeners();
      activeNativeNotification.close();
    } catch {
      // no-op
    }
    activeNativeNotification = null;
  }

  const notif = new Notification({ title, body, silent: !!silent });
  activeNativeNotification = notif;
  notif.on("close", () => {
    if (activeNativeNotification === notif) {
      activeNativeNotification = null;
    }
  });
  notif.on("click", () => {
    if (activeNativeNotification === notif) {
      activeNativeNotification = null;
    }
    try {
      notif.close();
    } catch {
      // no-op
    }
    showMainWindow({ restoreState: true });
    if (!conversationId) return;
    pendingNotificationTarget = {
      conversationId,
      messageId,
      at: Date.now(),
    };
    emitNotificationClick(pendingNotificationTarget);
  });
  notif.show();

  return { ok: true };
}

function setupUpdater() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    emitUpdateStatus({ status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    emitUpdateStatus({
      status: "available",
      version: info?.version || "",
      info: "Nova versao encontrada. Download iniciado.",
    });
  });

  autoUpdater.on("update-not-available", () => {
    emitUpdateStatus({ status: "none", info: "Aplicativo atualizado." });
  });

  autoUpdater.on("download-progress", (progress) => {
    emitUpdateStatus({
      status: "downloading",
      info: `Baixando update: ${Math.round(progress.percent || 0)}%`,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    emitUpdateStatus({
      status: "downloaded",
      version: info?.version || "",
      info: "Update pronto. Sera aplicado ao reiniciar o app.",
    });
  });

  autoUpdater.on("error", (error) => {
    emitUpdateStatus({ status: "error", error: error?.message || String(error) });
  });

  try {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: config.updateUrl,
    });
  } catch (error) {
    log.error("Could not set updater feed URL:", error);
  }
}

async function checkUpdatesSafe(source) {
  if (!app.isPackaged) {
    return { ok: false, reason: "dev-mode" };
  }

  try {
    emitUpdateStatus({ status: "check-requested", info: `Checando updates (${source})...` });
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    const message = error?.message || String(error);
    emitUpdateStatus({ status: "error", error: message });
    return { ok: false, error: message };
  }
}

function setupIpc() {
  ipcMain.handle("desktop:get-config", () => ({
    serverUrl: config.serverUrl,
    updateUrl: config.updateUrl,
    autoStart: !!config.autoStart,
    minimizeToTray: !!config.minimizeToTray,
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle("desktop:get-window-state", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return {
        isVisible: false,
        isMinimized: false,
        isFocused: false,
        isMaximized: false,
        isFullScreen: false,
      };
    }

    return {
      isVisible: mainWindow.isVisible(),
      isMinimized: mainWindow.isMinimized(),
      isFocused: mainWindow.isFocused(),
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen(),
    };
  });

  ipcMain.handle("desktop:set-server-url", async (_event, rawUrl) => {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) {
      return { ok: false, error: "URL invalida. Use http:// ou https://." };
    }

    saveConfig({ serverUrl: normalized });
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(normalized);
    }

    emitToAllWindows(SERVER_EVENT_CHANNEL, { serverUrl: normalized });
    return { ok: true, serverUrl: normalized };
  });

  ipcMain.handle("desktop:open-settings", () => {
    openSettingsWindow();
    return { ok: true };
  });

  ipcMain.handle("desktop:set-auto-start", (_event, enabled) => {
    const next = !!enabled;
    applyAutoStartSetting(next);
    saveConfig({ autoStart: next });
    return { ok: true, autoStart: next };
  });

  ipcMain.handle("desktop:notify", (_event, payload) => {
    return notifyNative(payload);
  });

  ipcMain.handle("desktop:consume-notification-target", () => {
    const target = pendingNotificationTarget;
    pendingNotificationTarget = null;
    return target;
  });

  ipcMain.handle("desktop:check-updates", async () => checkUpdatesSafe("manual"));
}

function bootstrap() {
  config = loadConfig();
  app.setAppUserModelId("com.bhash.chat.desktop");
  applyAutoStartSetting(config.autoStart);
  setupIpc();
  setupUpdater();
  createMainWindow();
  createTray();

  setTimeout(() => {
    void checkUpdatesSafe("startup");
  }, 8000);

  updateTimer = setInterval(() => {
    void checkUpdatesSafe("interval");
  }, 15 * 60 * 1000);
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    bootstrap();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMainWindow();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  saveWindowStateNow();
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  if (saveWindowStateTimer) {
    clearTimeout(saveWindowStateTimer);
    saveWindowStateTimer = null;
  }
});
