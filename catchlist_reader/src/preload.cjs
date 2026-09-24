const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catchList", {
  previewGame: (input) => ipcRenderer.invoke("games:preview", input),
  cancelGamePreview: () => ipcRenderer.invoke("games:cancel-preview"),
  addGame: (token, destination) => ipcRenderer.invoke("games:add", token, destination),
  load: (media) => ipcRenderer.invoke("library:load", media),
  setFavorite: (media, entryId, favorite) => ipcRenderer.invoke("library:set-favorite", media, entryId, favorite),
  setHiddenReason: (key, reason) => ipcRenderer.invoke("library:set-hidden-reason", key, reason),
  favoriteBacklog: (id) => ipcRenderer.invoke("library:favorite-backlog", id),
  restoreHidden: (hideKey) => ipcRenderer.invoke("library:restore-hidden", hideKey),
  chooseDirectory: () => ipcRenderer.invoke("library:choose-directory"),
  hideEntry: (media, entryId, reason) => ipcRenderer.invoke("library:hide-entry", media, entryId, reason),
  deleteEntry: (media, entryId) => ipcRenderer.invoke("library:delete-entry", media, entryId),
  undoLastOperation: () => ipcRenderer.invoke("library:undo-last-operation"),
  resolveGameCovers: (appids) => ipcRenderer.invoke("library:resolve-game-covers", appids),
  copyText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  openUrls: (urls) => ipcRenderer.invoke("external:open-urls", urls),
});
