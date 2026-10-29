const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("steamConfirmation", {
  control: action => { if (["cancel", "check", "ready"].includes(action)) ipcRenderer.send("steam-confirmation:control", action); },
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("steam-confirmation:state", listener);
    return () => ipcRenderer.removeListener("steam-confirmation:state", listener);
  },
});
