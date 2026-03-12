const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("bhashDesktop", {
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  getWindowState: () => ipcRenderer.invoke("desktop:get-window-state"),
  setServerUrl: (url) => ipcRenderer.invoke("desktop:set-server-url", url),
  openSettings: () => ipcRenderer.invoke("desktop:open-settings"),
  setAutoStart: (enabled) => ipcRenderer.invoke("desktop:set-auto-start", enabled),
  notify: (payload) => ipcRenderer.invoke("desktop:notify", payload),
  consumeNotificationTarget: () => ipcRenderer.invoke("desktop:consume-notification-target"),
  checkUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  onUpdateStatus: (callback) => subscribe("desktop:update-status", callback),
  onServerUpdated: (callback) => subscribe("desktop:server-updated", callback),
  onNotificationClick: (callback) => subscribe("desktop:notification-click", callback),
});
