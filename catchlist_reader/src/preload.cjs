const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catchList", {
  load: () => ipcRenderer.invoke("library:load"),
  chooseDirectory: () => ipcRenderer.invoke("library:choose-directory"),
  hideEntry: (media, entryId) => ipcRenderer.invoke("library:hide-entry", media, entryId),
  undoHide: () => ipcRenderer.invoke("library:undo-hide"),
  resolveGameCovers: (appids) => ipcRenderer.invoke("library:resolve-game-covers", appids),
  openUrls: (urls) => ipcRenderer.invoke("external:open-urls", urls),
});
