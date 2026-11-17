const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlay', {
  on: (channel, cb) => ipcRenderer.on(channel, (_e, payload) => cb(payload)),
  activeWindow: () => ipcRenderer.invoke('active-window'),
  setVisible: on => ipcRenderer.send('visible', on),
  setInteractive: on => ipcRenderer.send('interactive', on),
  quit: () => ipcRenderer.send('quit')
})
