/*
 * The overlay: a transparent, always-on-top, click-through window over the whole screen.
 * It plays the passive reactions and the Whip Run game. The extension starts it with
 * `electron overlay/main.js [--watch] [--play] [--mute]`.
 * Stdin lines: `play`, `quit`. Ctrl+Alt+J starts or stops the game; Ctrl+Alt+Q closes it all.
 */
const { app, BrowserWindow, Menu, screen, ipcMain, globalShortcut } = require('electron')
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')

const DIR = path.join(os.homedir(), '.whip-run')
const STATE_FILE = path.join(DIR, 'state')
const EVENTS_FILE = path.join(DIR, 'events.jsonl')
const LINUX = process.platform === 'linux'
const MAC = process.platform === 'darwin'
const mute = process.argv.includes('--mute')
const argNum = (name, fallback) => {
  const a = process.argv.find(v => v.startsWith(`--${name}=`))
  return a ? Number(a.split('=')[1]) : fallback
}

// Chromium needs these for a see-through window and for sound without a click first.
app.commandLine.appendSwitch('enable-transparent-visuals')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Wayland won't let apps keep windows on top or move focus, so run through XWayland instead.
if (LINUX) app.commandLine.appendSwitch('ozone-platform', 'x11')

let win
let display

// One cowboy per screen. A second launch just asks the first one to play.
if (!app.requestSingleInstanceLock()) app.quit()

function readState() {
  try {
    const w = fs.readFileSync(STATE_FILE, 'utf8').trim().split(/\s+/)[0]
    return ['busy', 'waiting', 'idle'].includes(w) ? w : 'idle'
  } catch {
    return 'idle'
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

// Runs an X11 helper on Linux; on other systems it quietly reports "no answer".
function xdotool(args, cb = () => {}) {
  if (!LINUX) return cb(new Error('not X11'), '')
  execFile('xdotool', args, { timeout: 800 }, cb)
}

function createWindow() {
  display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const b = display.bounds
  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.webContents.on('console-message', (_e, _level, message, line, source) =>
    console.error(`[overlay] ${message} (${path.basename(source)}:${line})`)
  )
  win.webContents.on('render-process-gone', (_e, d) => console.error('[overlay] renderer gone:', d.reason))
  win.loadFile(path.join(__dirname, 'overlay.html'))
  for (const ev of ['move', 'resize', 'show']) win.on(ev, () => send('geometry', { floor: floorY() }))
  win.webContents.on('did-finish-load', () => {
    send('init', {
      mute,
      floor: floorY(),
      state: readState(),
      play: process.argv.includes('--play'),
      after: argNum('after', 20),
      elapsed: argNum('elapsed', 0)
    })
  })
}

// Bottom of the usable screen in window coordinates. Some desktops push the window below a
// top panel, so this uses where the window really is rather than where we asked it to be.
function floorY() {
  const wb = win.getContentBounds()
  const wa = display.workArea
  return Math.min(wa.y + wa.height, wb.y + wb.height) - wb.y
}

// The focused window's top edge in overlay coordinates, so the cowboy can land on it.
// Only X11 can tell us; elsewhere he lands on the bottom of the screen instead.
function activeWindow() {
  return new Promise(resolve => {
    xdotool(['getactivewindow', 'getwindowgeometry', '--shell'], (err, out) => {
      if (err) return resolve(null)
      const g = Object.fromEntries(
        out
          .trim()
          .split('\n')
          .map(l => l.split('='))
          .map(([k, v]) => [k, Number(v)])
      )
      execFile('xprop', ['-id', String(g.WINDOW), '_NET_FRAME_EXTENTS'], { timeout: 800 }, (e2, o2) => {
        const m = !e2 && o2.match(/=\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/)
        const top = m ? Number(m[3]) : 0
        const b = display.bounds
        resolve({ x: g.X - b.x, y: g.Y - top - b.y, width: g.WIDTH, height: g.HEIGHT + top })
      })
    })
  })
}

// Streams lines that the hooks append to events.jsonl; anything from before startup is skipped.
function watchEvents() {
  let offset = 0
  try {
    offset = fs.statSync(EVENTS_FILE).size
  } catch {}
  fs.watchFile(EVENTS_FILE, { interval: 300 }, cur => {
    if (cur.size < offset) offset = 0
    if (cur.size === offset) return
    const fd = fs.openSync(EVENTS_FILE, 'r')
    const buf = Buffer.alloc(cur.size - offset)
    fs.readSync(fd, buf, 0, buf.length, offset)
    fs.closeSync(fd)
    offset = cur.size
    for (const line of buf.toString('utf8').split('\n')) {
      try {
        if (line.trim()) send('tool', JSON.parse(line))
      } catch {}
    }
  })
}

ipcMain.handle('active-window', () => activeWindow())
ipcMain.on('visible', (_e, on) => {
  if (!win) return
  if (on && !win.isVisible()) {
    win.showInactive()
    win.setAlwaysOnTop(true, 'screen-saver')
  } else if (!on && win.isVisible()) win.hide()
})

// The game reads keys through a 1x1 invisible window, because Linux can't make the big
// overlay focusable after creation. The mouse stays click-through the whole time, and
// focus goes back to the window you were using when the game ends.
let keyWin = null
let previousWindow = null

function focusKeyWindow() {
  if (!keyWin) return
  if (MAC) app.focus({ steal: true })
  keyWin.focus()
  xdotool(['windowactivate', String(keyWin.getNativeWindowHandle().readUInt32LE(0))])
}

ipcMain.on('interactive', (_e, on) => {
  if (on && keyWin) return focusKeyWindow()
  if (on) {
    xdotool(['getactivewindow'], (err, out) => (previousWindow = err ? null : out.trim()))
    const b = display.bounds
    keyWin = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: 1,
      height: 1,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: { preload: path.join(__dirname, 'keys-preload.js'), contextIsolation: true }
    })
    keyWin.loadFile(path.join(__dirname, 'keys.html'))
    keyWin.once('ready-to-show', () => {
      keyWin.show()
      focusKeyWindow()
    })
    keyWin.on('closed', () => (keyWin = null))
    globalShortcut.register('Escape', () => send('command', 'stop-play'))
    return
  }
  if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape')
  // Only hand focus back when the game still had it; after a click elsewhere, leave it there.
  const hadFocus = keyWin && keyWin.isFocused()
  if (keyWin) keyWin.destroy()
  if (!hadFocus) return
  if (LINUX && previousWindow) xdotool(['windowactivate', previousWindow])
  // macOS returns focus to the previous app when we step aside; Windows does it on its own.
  else if (MAC) app.hide()
})
ipcMain.on('key', (_e, k) => send('key', k))
ipcMain.on('quit', () => app.quit())

app.on('second-instance', () => send('command', 'play'))

app.setName('Whip Run')
Menu.setApplicationMenu(null)
// No dock icon on macOS: the cowboy is a guest, not a tenant.
if (MAC && app.dock) app.dock.hide()

app.whenReady().then(() => {
  // A short delay lets the compositor hand Chromium a transparent surface.
  setTimeout(createWindow, 300)
  globalShortcut.register('CommandOrControl+Alt+Q', () => app.quit())
  globalShortcut.register('CommandOrControl+Alt+J', () => send('command', 'toggle-play'))
  fs.mkdirSync(DIR, { recursive: true })
  fs.watchFile(STATE_FILE, { interval: 700 }, () => send('state', readState()))
  watchEvents()
  readline.createInterface({ input: process.stdin }).on('line', line => {
    const cmd = line.trim()
    if (cmd === 'quit') app.quit()
    else if (cmd) send('command', cmd)
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
