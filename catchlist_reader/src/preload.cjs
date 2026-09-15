const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catchList", {
  load: () => ipcRenderer.invoke("library:load"),
  chooseDirectory: () => ipcRenderer.invoke("library:choose-directory"),
  hideEntry: (media, entryId) => ipcRenderer.invoke("library:hide-entry", media, entryId),
  deleteEntry: (media, entryId) => ipcRenderer.invoke("library:delete-entry", media, entryId),
  undoLastOperation: () => ipcRenderer.invoke("library:undo-last-operation"),
  resolveGameCovers: (appids) => ipcRenderer.invoke("library:resolve-game-covers", appids),
  openUrls: (urls) => ipcRenderer.invoke("external:open-urls", urls),
});
