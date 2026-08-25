const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catchList", {
  load: () => ipcRenderer.invoke("library:load"),
  chooseDirectory: () => ipcRenderer.invoke("library:choose-directory"),
  deleteEntry: (media, entryId) => ipcRenderer.invoke("library:delete-entry", media, entryId),
  undoDelete: () => ipcRenderer.invoke("library:undo-delete"),
  resolveGameCovers: (appids) => ipcRenderer.invoke("library:resolve-game-covers", appids),
  openUrls: (urls) => ipcRenderer.invoke("external:open-urls", urls),
});
