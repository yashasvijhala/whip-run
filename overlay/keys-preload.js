// Forwards key presses from the invisible keyboard window to the overlay during Whip Mode.
const { ipcRenderer } = require('electron')

window.addEventListener('keydown', e => {
  e.preventDefault()
  ipcRenderer.send('key', { type: 'down', key: e.key, repeat: e.repeat })
})
window.addEventListener('keyup', e => ipcRenderer.send('key', { type: 'up', key: e.key }))
window.addEventListener('blur', () => ipcRenderer.send('key', { type: 'blur' }))
window.addEventListener('focus', () => ipcRenderer.send('key', { type: 'focus' }))
