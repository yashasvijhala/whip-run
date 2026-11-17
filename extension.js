/*
 * Whip Run: a tiny cowboy who lives on your screen while your AI agent thinks.
 *
 * The extension does three jobs:
 * 1. Watches ~/.whip-run/state, which Claude Code hooks update with busy, waiting or idle
 * 2. Starts the overlay (an Electron window over the whole screen) to play or react
 * 3. Fetches Electron once, if this machine doesn't already have one lying around
 */
const vscode = require('vscode')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')

const STATE_DIR = path.join(os.homedir(), '.whip-run')
const STATE_FILE = path.join(STATE_DIR, 'state')
const HOOK_FILE = path.join(STATE_DIR, 'hook.js')
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json')
const MARKER = 'whip-run'
// Hooks from the prototype, back when this extension had a much less polite name.
const OLD_MARKERS = ['claude-whipper']
const ELECTRON_VERSION = '43.7.3'

// Each hook writes one word into the state file. PreToolUse also logs which tool ran.
const HOOKS = {
  UserPromptSubmit: 'busy',
  PreToolUse: 'busy',
  PostToolUse: 'busy',
  Notification: 'waiting',
  Stop: 'idle'
}

const DONE_LINES = [
  '✅ Claude Code finished. Holster the whip.',
  '✅ Task done. The bot has earned exactly one coffee.',
  '✅ Claude Code is done. Go read the diff before it reads you.',
  '✅ Finished! Somewhere, a bug just lost its home.'
]
const WAITING_LINES = [
  '🙋 Claude Code needs your input. The bot is standing there, blinking politely.',
  '🙋 Claude Code is waiting on you. No pressure. (Some pressure.)'
]

let statusItem
let state = { mode: 'idle', since: Date.now() }
let reactedThisRun = false
let overlay
let log

const cfg = () => vscode.workspace.getConfiguration('whipRun')

function activate(context) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, 'idle\n')
  // Hooks call this stable copy, so they keep working after the extension updates and moves.
  fs.copyFileSync(path.join(context.extensionPath, 'hook.js'), HOOK_FILE)

  log = vscode.window.createOutputChannel('Whip Run')
  statusItem = vscode.window.createStatusBarItem('whipRun.status', vscode.StatusBarAlignment.Left, -1000)
  statusItem.name = 'Whip Run'
  statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
  statusItem.command = 'whipRun.play'
  context.subscriptions.push(statusItem, log, { dispose: stopOverlay })

  context.subscriptions.push(
    vscode.commands.registerCommand('whipRun.play', () => launchOverlay(context, false)),
    vscode.commands.registerCommand('whipRun.quit', stopOverlay),
    vscode.commands.registerCommand('whipRun.connect', installHooks),
    vscode.commands.registerCommand('whipRun.disconnect', removeHooks)
  )

  readState()
  fs.watchFile(STATE_FILE, { interval: 700 }, readState)
  context.subscriptions.push({ dispose: () => fs.unwatchFile(STATE_FILE) })
  offerHookMigration()

  const ticker = setInterval(() => tick(context), 1000)
  context.subscriptions.push({ dispose: () => clearInterval(ticker) })
  tick(context)
}

function readState() {
  let word = 'idle'
  try {
    word = fs.readFileSync(STATE_FILE, 'utf8').trim().split(/\s+/)[0] || 'idle'
  } catch {}
  if (!['busy', 'waiting', 'idle'].includes(word)) word = 'idle'
  if (word === state.mode) return

  const prev = state.mode
  // PostToolUse keeps firing during a run, so only a fresh prompt restarts the clock.
  const continuing = prev !== 'idle' && word === 'busy'
  state = { mode: word, since: continuing ? state.since : Date.now() }
  if (word === 'busy' && prev === 'idle') reactedThisRun = false

  if (cfg().get('notifyWhenDone') && prev === 'busy') {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]
    if (word === 'idle') vscode.window.showInformationMessage(pick(DONE_LINES))
    else if (word === 'waiting') vscode.window.showWarningMessage(pick(WAITING_LINES))
  }
}

function tick(context) {
  const secs = Math.floor((Date.now() - state.since) / 1000)
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  if (state.mode === 'busy') {
    statusItem.text = `$(loading~spin) ${clock} · 🤠 Whip Run`
    statusItem.tooltip = 'Claude Code is working. Play Whip Run while you wait (Ctrl+Alt+J).'
  } else if (state.mode === 'waiting') {
    statusItem.text = '$(bell) Claude Code needs you'
    statusItem.tooltip = 'Claude Code is waiting for your input.'
  } else {
    statusItem.text = '🤠 Whip Run'
    statusItem.tooltip = 'Play Whip Run along the bottom of your screen (Ctrl+Alt+J)'
  }
  statusItem.show()

  // The overlay starts with Claude so it can react to tools; the cowboy's cameos wait longer.
  if (cfg().get('reactToClaude') && state.mode === 'busy' && !reactedThisRun) {
    reactedThisRun = true
    launchOverlay(context, true)
  }
}

/* ---------- Overlay ---------- */

async function launchOverlay(context, auto) {
  if (overlay) {
    if (!auto) overlay.stdin.write('play\n')
    return
  }
  // A quiet background launch never asks to download anything.
  const electron = await findElectron(context, !auto)
  if (!electron || overlay) return
  const args = [path.join(context.extensionPath, 'overlay', 'main.js')]
  if (electron.downloaded && process.platform === 'linux') {
    // Release builds need a root-owned sandbox helper that a per-user download can't have.
    // The overlay only loads its own local files, so running without the sandbox is safe.
    args.unshift('--no-sandbox')
  }
  if (auto) {
    const elapsed = Math.floor((Date.now() - state.since) / 1000)
    args.push('--watch', `--after=${cfg().get('cameoAfterSeconds')}`, `--elapsed=${elapsed}`)
  } else args.push('--play')
  if (!cfg().get('sound')) args.push('--mute')

  // The extension host sets ELECTRON_RUN_AS_NODE, which would turn Electron into plain Node.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron.bin, args, { env, stdio: ['pipe', 'ignore', 'pipe'] })
  overlay = child
  child.stdin.on('error', () => {})
  child.stderr.on('data', d => log.append(d.toString()))
  child.on('error', e => {
    log.appendLine(`Overlay failed to start: ${e.message}`)
    vscode.window.showErrorMessage(`Whip Run couldn't start its overlay: ${e.message}`)
  })
  child.on('exit', code => {
    if (overlay === child) overlay = undefined
    if (code) log.appendLine(`Overlay exited with code ${code}`)
  })
}

function stopOverlay() {
  if (!overlay) return
  const child = overlay
  child.stdin.write('quit\n')
  setTimeout(() => child.exitCode === null && child.kill(), 1500)
}

/* ---------- Electron ---------- */

function cacheDir(context) {
  return path.join(context.globalStorageUri.fsPath, `electron-${ELECTRON_VERSION}`)
}

function cachedBinary(context) {
  const dir = cacheDir(context)
  if (process.platform === 'darwin') return path.join(dir, 'Electron.app', 'Contents', 'MacOS', 'Electron')
  return path.join(dir, process.platform === 'win32' ? 'electron.exe' : 'electron')
}

// Looks for Electron in the setting, then our own download, then common system installs.
async function findElectron(context, mayDownload) {
  const configured = cfg().get('electronPath')
  if (configured) return { bin: configured }
  if (fs.existsSync(cachedBinary(context))) return { bin: cachedBinary(context), downloaded: true }
  if (process.platform === 'linux') {
    const libs = fs.existsSync('/usr/lib') ? fs.readdirSync('/usr/lib').filter(d => /^electron\d*$/.test(d)) : []
    for (const d of libs.sort().reverse()) {
      const p = path.join('/usr/lib', d, 'electron')
      if (fs.existsSync(p)) return { bin: p }
    }
  }
  if (!mayDownload) return null

  const ok = await vscode.window.showInformationMessage(
    'Whip Run needs Electron to draw the cowboy on top of your screen. Download it once from GitHub (about 100 MB)?',
    { modal: true, detail: 'It’s stored in VS Code’s extension storage and checked against Electron’s published SHA-256 checksums. You can point whipRun.electronPath at an existing copy instead.' },
    'Download'
  )
  if (ok !== 'Download') return null
  try {
    await downloadElectron(context)
    return { bin: cachedBinary(context), downloaded: true }
  } catch (e) {
    log.appendLine(`Electron download failed: ${e.stack || e.message}`)
    vscode.window.showErrorMessage(`Whip Run couldn't download Electron: ${e.message}`)
    return null
  }
}

const SADDLE_UP = [
  'Saddling up the horse…',
  'Polishing the whip…',
  'Teaching bugs to run in a straight line…',
  'Hiding the bot’s coffee…',
  'Negotiating with the stickman’s union…'
]

async function downloadElectron(context) {
  const archMap = { x64: 'x64', arm64: 'arm64', arm: 'armv7l', ia32: 'ia32' }
  const platMap = { linux: 'linux', darwin: 'darwin', win32: 'win32' }
  const plat = platMap[process.platform]
  const arch = archMap[process.arch]
  if (!plat || !arch) throw new Error(`no Electron build for ${process.platform}-${process.arch}`)
  const asset = `electron-v${ELECTRON_VERSION}-${plat}-${arch}.zip`
  const base = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}`

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '🤠 Whip Run', cancellable: true },
    async (progress, token) => {
      const abort = new AbortController()
      token.onCancellationRequested(() => abort.abort())
      progress.report({ message: 'Checking Electron’s checksums…' })
      const sums = await (await fetchOk(`${base}/SHASUMS256.txt`, abort.signal)).text()
      const line = sums.split('\n').find(l => l.trim().endsWith(asset))
      if (!line) throw new Error(`no checksum published for ${asset}`)
      const expected = line.trim().split(/\s+/)[0]

      const res = await fetchOk(`${base}/${asset}`, abort.signal)
      const total = Number(res.headers.get('content-length')) || 0
      const tmpDir = path.join(context.globalStorageUri.fsPath, 'tmp')
      fs.mkdirSync(tmpDir, { recursive: true })
      const zipPath = path.join(tmpDir, asset)
      const out = fs.createWriteStream(zipPath)
      const hash = crypto.createHash('sha256')
      let got = 0
      let lastPct = 0
      for await (const chunk of res.body) {
        hash.update(chunk)
        out.write(chunk)
        got += chunk.length
        const pct = total ? Math.floor((got / total) * 100) : 0
        if (pct >= lastPct + 5) {
          progress.report({ increment: pct - lastPct, message: `${SADDLE_UP[Math.floor(pct / 21)]} ${pct}%` })
          lastPct = pct
        }
      }
      await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())))
      if (hash.digest('hex') !== expected) {
        fs.rmSync(zipPath, { force: true })
        throw new Error('the download didn’t match Electron’s published checksum')
      }

      progress.report({ message: 'Unpacking…' })
      const dir = cacheDir(context)
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      await unzip(zipPath, dir)
      fs.rmSync(tmpDir, { recursive: true, force: true })
      if (process.platform === 'linux') {
        for (const f of ['electron', 'chrome_crashpad_handler']) {
          const p = path.join(dir, f)
          if (fs.existsSync(p)) fs.chmodSync(p, 0o755)
        }
      }
      if (!fs.existsSync(cachedBinary(context))) throw new Error('Electron unpacked, but its binary is missing')
    }
  )
}

async function fetchOk(url, signal) {
  const res = await fetch(url, { signal, redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res
}

const run = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 120000, maxBuffer: 1 << 24 }, err => (err ? reject(err) : resolve()))
  )

// Each OS ships a different unzipper; Linux falls back to Python when `unzip` is missing.
async function unzip(zip, dir) {
  if (process.platform === 'darwin') return run('ditto', ['-x', '-k', zip, dir])
  if (process.platform === 'win32') return run('tar', ['-xf', zip, '-C', dir])
  try {
    await run('unzip', ['-q', '-o', zip, '-d', dir])
  } catch {
    await run('python3', ['-m', 'zipfile', '-e', zip, dir])
  }
}

/* ---------- Claude Code Hooks ---------- */

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return {}
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
}

function settingsText() {
  try {
    return fs.readFileSync(SETTINGS_FILE, 'utf8')
  } catch {
    return ''
  }
}

// Forward slashes and quotes keep the command working in bash, zsh, cmd and PowerShell.
function hookCommand(word) {
  const file = HOOK_FILE.split(path.sep).join('/')
  return `node "${file}" ${word} # ${MARKER}`
}

function stripOurHooks(settings) {
  if (!settings.hooks) return
  const ours = cmd => [MARKER, ...OLD_MARKERS].some(m => String(cmd || '').includes(m))
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map(group => ({ ...group, hooks: (group.hooks || []).filter(h => !ours(h.command)) }))
      .filter(group => group.hooks.length > 0)
    if (settings.hooks[event].length === 0) delete settings.hooks[event]
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks
}

function offerHookMigration() {
  const text = settingsText()
  if (!OLD_MARKERS.some(m => text.includes(m))) return
  vscode.window
    .showInformationMessage(
      'Whip Run found hooks from its old prototype in your Claude Code settings. Swap them for the new ones?',
      'Update Hooks'
    )
    .then(pick => pick && installHooks())
}

async function installHooks() {
  let settings
  try {
    settings = readSettings()
  } catch (e) {
    vscode.window.showErrorMessage(`Whip Run can't read ${SETTINGS_FILE}: ${e.message}`)
    return
  }
  const ok = await vscode.window.showInformationMessage(
    'Connect Whip Run to Claude Code?',
    {
      modal: true,
      detail: `This adds 5 small hooks to ${SETTINGS_FILE}. They note whether Claude Code is busy and which tool it's using (the tool name plus a filename or command, never your prompts or file contents) in ~/.whip-run, so the game can react. The hooks need Node.js on your PATH. A backup of your settings is saved next to the file.`
    },
    'Connect'
  )
  if (ok !== 'Connect') return

  if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.whip-run-backup`)
  stripOurHooks(settings)
  settings.hooks = settings.hooks || {}
  for (const [event, word] of Object.entries(HOOKS)) {
    settings.hooks[event] = settings.hooks[event] || []
    settings.hooks[event].push({ hooks: [{ type: 'command', command: hookCommand(word) }] })
  }
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n')
  vscode.window.showInformationMessage(
    '🪢 Hooked up! Start a new Claude Code session and the bot reports for duty.'
  )
}

async function removeHooks() {
  let settings
  try {
    settings = readSettings()
  } catch (e) {
    vscode.window.showErrorMessage(`Whip Run can't read ${SETTINGS_FILE}: ${e.message}`)
    return
  }
  stripOurHooks(settings)
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n')
  vscode.window.showInformationMessage('Whip Run is disconnected from Claude Code. The cowboy hangs up his hat.')
}

function deactivate() {
  stopOverlay()
}

module.exports = { activate, deactivate }
