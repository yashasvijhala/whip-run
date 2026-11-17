/*
 * Claude Code hook: `node hook.js <busy|waiting|idle>`.
 * Writes the word to ~/.whip-run/state and appends a short tool event
 * (tool name plus a filename, command or pattern) to events.jsonl for the overlay.
 * Prompt text and file contents are never written.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const dir = path.join(os.homedir(), '.whip-run')
const word = process.argv[2] || 'busy'
const short = (v, n = 48) => {
  const line = String(v || '')
    .split('\n')[0]
    .trim()
  return line.length > n ? line.slice(0, n - 1) + '…' : line
}

function detail(tool, input) {
  if (!input) return ''
  if (input.file_path || input.notebook_path) return path.basename(input.file_path || input.notebook_path)
  if (tool === 'Bash') return short(input.command)
  if (input.pattern) return short(input.pattern, 32)
  if (input.url) {
    try {
      return new URL(input.url).hostname
    } catch {
      return ''
    }
  }
  if (input.query) return short(input.query, 32)
  if (input.description) return short(input.description, 32)
  return ''
}

function finish(raw) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'state'), word + '\n')
  let data = {}
  try {
    data = JSON.parse(raw)
  } catch {}
  const event = data.hook_event_name
  if (event !== 'PreToolUse' && event !== 'UserPromptSubmit') return
  const file = path.join(dir, 'events.jsonl')
  const line = JSON.stringify({ t: Date.now(), e: event, tool: data.tool_name, d: detail(data.tool_name, data.tool_input) })
  try {
    if (fs.statSync(file).size > 100000) fs.writeFileSync(file, '')
  } catch {}
  fs.appendFileSync(file, line + '\n')
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => (raw += d))
process.stdin.on('end', () => finish(raw))
// Never hold up Claude Code if stdin stays open. The cowboy waits for no one, and neither do hooks.
setTimeout(() => {
  finish(raw)
  process.exit(0)
}, 800).unref()
