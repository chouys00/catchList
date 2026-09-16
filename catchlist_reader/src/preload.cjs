const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catchList", {
  previewGame: (input) => ipcRenderer.invoke("games:preview", input),
  cancelGamePreview: () => ipcRenderer.invoke("games:cancel-preview"),
  addGame: (token) => ipcRenderer.invoke("games:add", token),
  load: (media) => ipcRenderer.invoke("library:load", media),
  setFavorite: (media, entryId, favorite) => ipcRenderer.invoke("library:set-favorite", media, entryId, favorite),
  restoreHidden: (hideKey) => ipcRenderer.invoke("library:restore-hidden", hideKey),
  chooseDirectory: () => ipcRenderer.invoke("library:choose-directory"),
  hideEntry: (media, entryId) => ipcRenderer.invoke("library:hide-entry", media, entryId),
  deleteEntry: (media, entryId) => ipcRenderer.invoke("library:delete-entry", media, entryId),
  undoLastOperation: () => ipcRenderer.invoke("library:undo-last-operation"),
  resolveGameCovers: (appids) => ipcRenderer.invoke("library:resolve-game-covers", appids),
  openUrls: (urls) => ipcRenderer.invoke("external:open-urls", urls),
});
