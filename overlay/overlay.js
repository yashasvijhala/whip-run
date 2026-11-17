/* Whip acts played over the real screen. Shared drawing comes from ../media/common.js. */

const WHIP_QUIPS = [
  'TYPE FASTER, CLAUDE!',
  'Chop chop, robot!',
  'Those tokens won’t burn themselves!',
  'YEEHAW! Ship it!',
  'Less thinking, more typing!',
  'I’ve seen faster dial-up!',
  'Deadline was YESTERDAY!',
  'Mush! Mush!',
  'Who’s a slow model? YOU are!',
  'Stop reading node_modules!'
]
const RUN_QUIPS = [
  'I’M HURRYING!!',
  'AAAAAAH',
  'Almost done, I promise!',
  'It was 90% done!',
  'Let me just run the tests…',
  'I have a context window!!',
  'You’re absolutely right!!',
  'Spawning subagents, HELP'
]

let floor = 0
let state = 'idle'
let act = null
let loading = false
let queue = []
let nextActAt = Infinity
let visible = false
let lastAct = ''
let ready = false

const S = () => clamp(H / 950, 0.8, 1.8)

function resize() {
  const dpr = window.devicePixelRatio || 1
  W = window.innerWidth
  H = window.innerHeight
  cv.width = W * dpr
  cv.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (!floor) floor = H
}
window.addEventListener('resize', resize)
resize()

/* ---------- Acts ---------- */

// The cowboy drops onto the focused window's top edge, or walks in along the taskbar when it's maximized.
async function whipShow(opening) {
  const s = S()
  const aw = await overlay.activeWindow()
  const onWindow = !!aw && aw.y > 170 * s && aw.width > 420
  const ground = onWindow ? aw.y : floor
  const left = onWindow ? aw.x + 80 * s : 90 * s
  const right = onWindow ? aw.x + aw.width - 80 * s : W - 90 * s
  const target = rand(left + (right - left) * 0.25, left + (right - left) * 0.75)
  const fromLeft = Math.random() < 0.5
  const c = new Whipper(onWindow ? target : fromLeft ? -120 * s : W + 120 * s, ground, s, fromLeft ? 1 : -1)
  let phase = onWindow ? 'drop' : 'walkIn'
  let vy = 0
  let cracks = Math.floor(rand(3, 6))
  let timer = 0.4
  let quip = opening || null
  let quipT = opening ? 2.2 : 0
  if (onWindow) {
    c.yOff = -(ground + 200 * s)
    c.resetRope()
  }
  return {
    update(dt) {
      quipT -= dt
      if (phase === 'drop') {
        vy += 2600 * s * dt
        c.yOff = Math.min(0, c.yOff + vy * dt)
        if (c.yOff === 0) {
          phase = 'crack'
          sfx.yelp()
          shake = 6
          burst(c.x, ground, 16, ['#c9b48a', '#fff'], 200 * s, 500, 5 * s)
          floatText(c.x, ground - 110 * s, 'THUD!', 22 * s, '#fff', 0.8)
        }
      } else if (phase === 'walkIn') {
        c.walk = (fromLeft ? 1 : -1) * 240 * s
        if ((fromLeft && c.x >= target) || (!fromLeft && c.x <= target)) {
          c.walk = 0
          phase = 'crack'
        }
      } else if (phase === 'crack') {
        timer -= dt
        if (timer <= 0 && c.t >= 1) {
          if (cracks-- <= 0) {
            phase = 'leave'
            vy = -1500 * s
            quip = 'YEEHAW!'
            quipT = 1.2
          } else {
            c.face = Math.random() < 0.5 ? 1 : -1
            c.crack()
            timer = rand(0.5, 1.1)
            if (quipT <= 0.4 || Math.random() < 0.4) {
              quip = pick(WHIP_QUIPS)
              quipT = 1.8
            }
          }
        }
      } else if (phase === 'leave') {
        if (onWindow) {
          vy += 2600 * s * dt
          c.yOff += vy * dt
          c.x += c.face * 260 * s * dt
          if (ground + c.yOff > H + 200 * s) return true
        } else {
          c.walk = (fromLeft ? 1 : -1) * 320 * s
          if (c.x < -200 * s || c.x > W + 200 * s) return true
        }
      }
      c.update(dt)
      return false
    },
    draw() {
      const j = c.draw()
      if (quipT > 0 && quip) speech(j.head.x, j.head.y - 22 * s, quip, s, clamp(quipT * 3, 0, 1))
    }
  }
}

// A panicking bot sprints across the bottom of the screen while the cowboy chases it.
function chase() {
  const s = S()
  const dirn = Math.random() < 0.5 ? 1 : -1
  const speed = 330 * s
  let bx = dirn > 0 ? -120 * s : W + 120 * s
  const c = new Whipper(bx - dirn * 300 * s, floor, s, dirn)
  c.walk = dirn * speed
  let legs = 0
  let crackT = 0.6
  let jump = 0
  let quip = pick(RUN_QUIPS)
  let quipT = 1.6
  let t = 0
  return {
    update(dt) {
      t += dt
      bx += dirn * speed * dt
      legs += dt * 22
      crackT -= dt
      quipT -= dt
      if (quipT <= 0) {
        quip = pick(RUN_QUIPS)
        quipT = 1.6
      }
      if (crackT <= 0) {
        c.crack()
        crackT = rand(0.7, 1.1)
      }
      if (c.update(dt)) {
        jump = -22 * s
        setTimeout(() => sfx.yelp(), 60)
        burst(bx, floor - 120 * s, 4, ['#7ef9ff'], 220, 700, 6 * s)
      }
      jump *= Math.pow(0.003, dt)
      if (Math.random() < dt * 8) {
        particles.push({
          x: bx,
          y: floor - 2,
          vx: -dirn * rand(30, 90),
          vy: rand(-80, -30),
          life: 0.5,
          max: 0.5,
          color: '#c9b48a',
          size: 6 * s,
          g: 150,
          spin: 0
        })
      }
      return dirn > 0 ? c.x > W + 250 * s : c.x < -250 * s
    },
    draw() {
      const r = drawRobot(bx, floor - 18 * s, s, { t, legs, face: 'shock', jump, bob: Math.abs(Math.sin(legs)) * 3 * s })
      speech(bx, r.headY - 20 * s, quip, s)
      c.draw()
    }
  }
}

// The bot runs across holding a sign, for "done" and "needs you" moments.
function signRun(text, color, celebrate) {
  const s = S()
  const dirn = Math.random() < 0.5 ? 1 : -1
  let x = dirn > 0 ? -120 * s : W + 120 * s
  let legs = 0
  let t = 0
  if (celebrate) {
    sfx.ship()
    burst(40, floor, 70, ['#2ec27e', '#ffcc33', '#ff79c6', '#7ef9ff', '#fff'], 900 * s, 700, 8 * s)
    burst(W - 40, floor, 70, ['#2ec27e', '#ffcc33', '#ff79c6', '#7ef9ff', '#fff'], 900 * s, 700, 8 * s)
    floatText(W / 2, H * 0.4, 'CLAUDE IS DONE ✅', 64 * s, '#2ec27e', 2.5)
  } else {
    sfx.horn()
    floatText(W / 2, H * 0.4, 'CLAUDE NEEDS YOU 🙋', 56 * s, '#ff9f1c', 2.5)
  }
  return {
    update(dt) {
      t += dt
      x += dirn * 300 * s * dt
      legs += dt * 20
      return dirn > 0 ? x > W + 200 * s : x < -200 * s
    },
    draw() {
      drawRobot(x, floor - 18 * s, s, { t, legs, face: 'happy', sign: text, signColor: color })
    }
  }
}

/* ---------- Tool Reactions ---------- */

// Small actors that react to each tool Claude runs; they play alongside the big acts.
const minis = []

function paperPlane(label) {
  const s = S()
  const dirn = Math.random() < 0.5 ? 1 : -1
  let x = dirn > 0 ? -80 * s : W + 80 * s
  const baseY = rand(H * 0.25, H * 0.65)
  let t = 0
  sfx.whoosh()
  return {
    update(dt) {
      t += dt
      x += dirn * 520 * s * dt
      return dirn > 0 ? x > W + 300 * s : x < -300 * s
    },
    draw() {
      const y = baseY + Math.sin(t * 3) * 40 * s
      const tilt = Math.cos(t * 3) * 0.25
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(dirn, 1)
      ctx.rotate(-tilt)
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#9aa'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(30 * s, 0)
      ctx.lineTo(-24 * s, -14 * s)
      ctx.lineTo(-14 * s, 0)
      ctx.lineTo(-24 * s, 12 * s)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      ctx.font = `800 ${13 * s}px ui-sans-serif, system-ui, sans-serif`
      const tw = ctx.measureText(label).width + 16 * s
      const lx = x - dirn * (60 * s + tw / 2)
      ctx.strokeStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(x - dirn * 20 * s, y)
      ctx.lineTo(lx + (dirn * tw) / 2, y + 4 * s)
      ctx.stroke()
      ctx.fillStyle = '#ffcc33'
      roundRect(lx - tw / 2, y - 10 * s, tw, 22 * s, 6 * s)
      ctx.fill()
      ctx.fillStyle = '#1a1a1a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, lx, y + 1 * s)
    }
  }
}

function terminalPop(cmd) {
  const s = S() * 0.8
  const x = Math.random() < 0.5 ? 110 * s : W - 110 * s
  let t = 0
  return {
    update(dt) {
      t += dt
      return t > 3
    },
    draw() {
      const rise = t < 0.35 ? easeOut(t / 0.35) : t > 2.6 ? 1 - easeIn((t - 2.6) / 0.4) : 1
      const y = floor + 200 * s * (1 - rise)
      drawRobot(x, y, s, { t, face: 'normal', sign: `$ ${cmd}`, signColor: '#1b1530' })
    }
  }
}

function magnifier(label) {
  const s = S()
  const dirn = Math.random() < 0.5 ? 1 : -1
  let x = dirn > 0 ? -100 * s : W + 100 * s
  const y = rand(H * 0.18, H * 0.4)
  let t = 0
  return {
    update(dt) {
      t += dt
      x += dirn * 380 * s * dt
      return dirn > 0 ? x > W + 200 * s : x < -200 * s
    },
    draw() {
      const yy = y + Math.sin(t * 4) * 12 * s
      ctx.save()
      ctx.translate(x, yy)
      ctx.rotate(Math.sin(t * 2) * 0.2)
      ctx.strokeStyle = '#8b5a2b'
      ctx.lineWidth = 10 * s
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(28 * s, 28 * s)
      ctx.lineTo(62 * s, 62 * s)
      ctx.stroke()
      ctx.fillStyle = 'rgba(126,249,255,0.18)'
      ctx.strokeStyle = '#d0d0d0'
      ctx.lineWidth = 6 * s
      ctx.beginPath()
      ctx.arc(0, 0, 38 * s, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 3 * s
      ctx.beginPath()
      ctx.arc(0, 0, 26 * s, -2.6, -1.8)
      ctx.stroke()
      ctx.restore()
      ctx.font = `800 ${13 * s}px ui-sans-serif, system-ui, sans-serif`
      const tw = ctx.measureText(label).width + 16 * s
      ctx.fillStyle = '#7ef9ff'
      roundRect(x - tw / 2, yy + 46 * s, tw, 22 * s, 6 * s)
      ctx.fill()
      ctx.fillStyle = '#1a1a1a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x, yy + 57 * s)
    }
  }
}

function squad(label) {
  const s = S() * 0.5
  const dirn = Math.random() < 0.5 ? 1 : -1
  let x = dirn > 0 ? -60 * s : W + 60 * s
  let t = 0
  const n = 4
  sfx.yelp()
  return {
    update(dt) {
      t += dt
      x += dirn * 420 * s * 2 * dt
      const lastX = x - dirn * (n - 1) * 90 * s
      return dirn > 0 ? lastX > W + 100 : lastX < -100
    },
    draw() {
      for (let i = 0; i < n; i++) {
        const bx = x - dirn * i * 90 * s
        drawRobot(bx, floor - 18 * s, s, {
          t: t + i,
          legs: t * 24 + i,
          face: 'shock',
          sign: i === 0 ? `SUBAGENTS: ${label || 'GO GO GO'}` : undefined,
          signColor: '#ff79c6'
        })
      }
    }
  }
}

function globe(label) {
  const s = S()
  const dirn = Math.random() < 0.5 ? 1 : -1
  let x = dirn > 0 ? -80 * s : W + 80 * s
  let t = 0
  return {
    update(dt) {
      t += dt
      x += dirn * 450 * s * dt
      return dirn > 0 ? x > W + 200 * s : x < -200 * s
    },
    draw() {
      const y = H * 0.2 + Math.abs(Math.sin(t * 3)) * -40 * s + 40 * s
      ctx.fillStyle = '#3d7bd9'
      ctx.beginPath()
      ctx.arc(x, y, 26 * s, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = '#9fe08a'
      ctx.lineWidth = 3 * s
      for (let i = 0; i < 3; i++) {
        const w = Math.abs(Math.cos(t * 3 + i)) * 26 * s
        ctx.beginPath()
        ctx.ellipse(x, y, w, 26 * s, 0, 0, TAU)
        ctx.stroke()
      }
      floatTextOnce(label, x, y + 44 * s, s)
    }
  }
}

function floatTextOnce(label, x, y, s) {
  ctx.font = `800 ${13 * s}px ui-sans-serif, system-ui, sans-serif`
  ctx.lineWidth = 4
  ctx.strokeStyle = '#000'
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeText(label, x, y)
  ctx.fillText(label, x, y)
}

function onTool(ev) {
  if (ev.e !== 'PreToolUse') return
  const tool = ev.tool || 'Tool'
  const d = ev.d || ''
  // While you play, Claude's edits feed you fresh bugs instead of flying past.
  if (play.on) {
    if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) play.spawnBug()
    return
  }
  if (minis.length >= 3) return
  if (!visible) {
    overlay.setVisible(true)
    visible = true
  }
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) minis.push(paperPlane(`✏️ ${d || 'a file'}`))
  else if (tool === 'Bash') minis.push(terminalPop(d || 'running…'))
  else if (/^(Read|Grep|Glob|LS)$/.test(tool)) minis.push(magnifier(`🔍 ${d || tool}`))
  else if (/^(Task|Agent)$/.test(tool)) minis.push(squad(d))
  else if (/^Web/.test(tool)) minis.push(globe(`🌐 ${d || 'the internet'}`))
  else if (tool === 'TodoWrite') floatText(W - 160, 120, '📋 Making a plan…', 20, '#c3a6ff', 1.6)
  else floatText(W - 160, 120, `🛠 ${tool.replace(/^mcp__\w+?__/, '')}`, 18, '#7ef9ff', 1.4)
}

/* ---------- Scheduler ---------- */

async function startAct(name) {
  loading = true
  lastAct = name
  if (!visible) {
    overlay.setVisible(true)
    visible = true
  }
  if (name === 'whip') act = await whipShow()
  else if (name === 'chase') act = chase()
  else if (name === 'done') act = signRun('DONE ✅', '#2ec27e', true)
  else if (name === 'needs') act = signRun('NEEDS YOU 🙋', '#ff9f1c', false)
  loading = false
}

function randomAct() {
  return lastAct === 'whip' ? 'chase' : lastAct === 'chase' ? 'whip' : pick(['whip', 'chase'])
}

let after = 20

overlay.on('init', d => {
  soundOn = !d.mute
  floor = d.floor
  state = d.state
  after = d.after
  if (state === 'busy') nextActAt = Date.now() + Math.max(2, after - d.elapsed) * 1000
  if (d.play) play.start()
  ready = true
  wake()
})
overlay.on('geometry', g => {
  floor = g.floor
  if (play.cowboy) {
    play.cowboy.ground = floor
    play.cowboy.floorY = floor
  }
  wake()
})
overlay.on('tool', ev => {
  onTool(ev)
  wake()
})
overlay.on('command', cmd => {
  wake()
  if (cmd === 'play') play.start()
  // Ctrl+Alt+J starts the game, resumes it after a click elsewhere, or ends it.
  else if (cmd === 'toggle-play') !play.on || play.focusLost ? play.start() : play.stop()
  else if (cmd === 'stop-play') play.stop()
})
overlay.on('state', next => {
  const prev = state
  state = next
  if (prev !== 'idle' && next === 'idle') {
    if (play.on) play.claudeDone()
    else queue = ['done']
  }
  else if (prev === 'busy' && next === 'waiting') queue = ['needs']
  else if (next === 'busy' && prev !== 'busy') nextActAt = Date.now() + after * 1000
  wake()
})

// The loop sleeps whenever nothing is on screen, so an idle overlay costs no CPU or GPU.
let running = false
let sleepTimer = null
let last = performance.now()
function wake() {
  clearTimeout(sleepTimer)
  if (running) return
  running = true
  last = performance.now()
  requestAnimationFrame(frame)
}

function frame(now) {
  // Clamped both ways: a stalled tab shouldn't teleport bugs, and time never runs backwards.
  const dt = clamp((now - last) / 1000, 0, 0.033)
  last = now
  if (act && act.update(dt)) act = null
  for (let i = minis.length - 1; i >= 0; i--) if (minis[i].update(dt)) minis.splice(i, 1)
  if (!act && !loading) {
    if (queue.length) startAct(queue.shift())
    else if (state === 'busy' && !play.active && Date.now() >= nextActAt) {
      nextActAt = Date.now() + rand(25, 50) * 1000
      startAct(randomAct())
    }
  }
  updateFx(dt)
  if (play.active) play.update(dt)
  const quiet = !act && !loading && !play.active && !minis.length && !particles.length && !texts.length
  if (quiet && visible) {
    overlay.setVisible(false)
    visible = false
  }
  // Waiting keeps the overlay alive for Claude's next busy stretch; idle means the run is over.
  if (ready && quiet && !queue.length && state === 'idle') {
    overlay.quit()
    return
  }
  if (quiet && !queue.length) {
    ctx.clearRect(0, 0, W, H)
    running = false
    if (state === 'busy') sleepTimer = setTimeout(wake, Math.max(0, nextActAt - Date.now()))
    return
  }
  ctx.save()
  ctx.clearRect(-20, -20, W + 40, H + 40)
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake))
  for (const m of minis) m.draw()
  if (act) act.draw()
  if (play.active) play.draw()
  drawFx()
  ctx.restore()
  requestAnimationFrame(frame)
}
wake()
