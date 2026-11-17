/*
 * Whip Run: an endless runner along the bottom edge of the real screen.
 * Space or ↑ jumps, ↓ ducks, Enter cracks the whip (it aims itself), Esc or Ctrl+Alt+J quits.
 * Each level runs faster and adds new obstacles. The mouse stays click-through throughout.
 */

const LEVELS = [
  { name: 'Hello World', pool: ['bug', 'bug', 'crate', 'token'] },
  { name: 'Stack Overflow', pool: ['bug', 'flyer', 'crate', 'token'] },
  { name: 'Merge Conflict', pool: ['bug', 'flyer', 'spikes', 'crate', 'token'] },
  { name: 'Prod Is Down', pool: ['bug', 'flyer', 'spikes', 'crate', 'slacker', 'token'] },
  { name: 'Friday Deploy', pool: ['bug', 'flyer', 'flyer', 'spikes', 'spikes', 'crate', 'slacker', 'token'] },
  { name: 'Infinite Loop', pool: ['bug', 'flyer', 'flyer', 'spikes', 'spikes', 'crate', 'slacker', 'token'] }
]
const LEVEL_METERS = 300
const WHIPPABLE = ['bug', 'flyer', 'crate', 'slacker']
const BUG_COLORS = ['#ff5a5f', '#2ec27e', '#c3a6ff', '#ff9f1c', '#4ea8ff']

function loadBest() {
  try {
    return Number(localStorage.getItem('whipRunBest')) || 0
  } catch {
    return 0
  }
}

const play = {
  on: false,
  focusLost: false,
  keys: {},
  phase: 'off',
  obstacles: [],
  best: loadBest(),

  get active() {
    return this.on
  },

  start() {
    if (this.on) return this.resume()
    this.s = S()
    this.on = true
    this.focusLost = false
    overlay.setInteractive(true)
    if (!visible) {
      overlay.setVisible(true)
      visible = true
    }
    this.reset()
    wake()
  },

  resume() {
    if (this.focusLost) overlay.setInteractive(true)
  },

  // Ends the game at once: everything vanishes in smoke and the keyboard goes back.
  stop() {
    if (!this.on) return
    const s = this.s
    if (this.cowboy) burst(this.cowboy.x, floor - 50 * s, 30, ['#ddd', '#aaa', '#fff'], 260 * s, -100, 8 * s)
    for (const o of this.obstacles) burst(o.x, o.y - 10 * s, 6, ['#ddd', '#aaa'], 160 * s, -80, 6 * s)
    this.on = false
    this.phase = 'off'
    this.obstacles = []
    this.cowboy = null
    this.keys = {}
    overlay.setInteractive(false)
    wake()
  },

  reset() {
    const s = this.s
    this.runX = Math.max(140 * s, W * 0.16)
    const c = new Whipper(this.runX, floor, s, 1)
    c.floorY = floor
    c.dur = 0.42
    c.yOff = -H * 0.6
    this.cowboy = c
    this.vy = 0
    this.obstacles = []
    this.lives = 3
    this.invuln = 0
    this.meters = 0
    this.bonus = 0
    this.level = 1
    this.nextSpawn = 500 * s
    this.combo = 0
    this.comboT = 0
    this.phase = 'ready'
    this.phaseT = 1.6
    this.hintT = 6
    this.groundShift = 0
    this.boost = 0
    this.claude = { dx: 330 * s, energy: 1, legs: 0, t: 0, hop: 0, vy: 0, quip: null, quipT: 0, sign: 0, sleepy: 0 }
    floatText(W / 2, floor - 240 * s, 'READY?', 40 * s, '#ffcc33', 1.3)
  },

  get score() {
    return Math.floor(this.meters + this.bonus)
  },
  get speed() {
    const s = this.s
    const within = (this.meters % LEVEL_METERS) / LEVEL_METERS
    // Speed climbs steadily inside a level and jumps at each new level.
    return Math.min(1100, 360 + (this.level - 1) * 80 + within * 90) * s
  },
  get levelInfo() {
    return LEVELS[Math.min(this.level, LEVELS.length) - 1]
  },
  down(...names) {
    return names.some(k => this.keys[k])
  },

  /* ---------- Obstacles ---------- */

  spawn(kind) {
    const s = this.s
    const x = W + 60 * s
    const o = { kind, x, y: floor, legs: rand(0, TAU), t: 0 }
    if (kind === 'bug') Object.assign(o, { w: 28 * s, h: 18 * s, crawl: rand(30, 70) * s, color: pick(BUG_COLORS) })
    else if (kind === 'flyer') Object.assign(o, { w: 28 * s, h: 22 * s, y: floor - 62 * s, crawl: rand(40, 90) * s, color: pick(BUG_COLORS) })
    else if (kind === 'crate') Object.assign(o, { w: 44 * s, h: 44 * s })
    else if (kind === 'spikes') {
      const n = Math.floor(rand(1, Math.min(4, 1 + this.level / 2) + 0.99))
      Object.assign(o, { n, w: n * 22 * s, h: 34 * s })
    } else if (kind === 'slacker') Object.assign(o, { w: 32 * s, h: 34 * s })
    else if (kind === 'token') {
      // Tokens come in arcs that reward a well-timed jump.
      for (let i = 0; i < 3; i++) {
        this.obstacles.push({ kind, x: x + i * 46 * s, y: floor - (120 + Math.sin((i / 2) * Math.PI) * 40) * s, w: 22 * s, h: 22 * s, t: i })
      }
      return
    }
    this.obstacles.push(o)
  },

  hitbox(o) {
    return { l: o.x - o.w / 2, r: o.x + o.w / 2, t: o.y - o.h, b: o.y }
  },
  playerBox() {
    const s = this.s
    const c = this.cowboy
    const top = (this.duck ? 46 : 82) * s
    return { l: c.x - 13 * s, r: c.x + 13 * s, t: floor + c.yOff - top, b: floor + c.yOff }
  },

  smash(o) {
    const s = this.s
    this.obstacles.splice(this.obstacles.indexOf(o), 1)
    this.combo = this.comboT > 0 ? this.combo + 1 : 1
    this.comboT = 1.5
    const mult = Math.min(this.combo, 5)
    if (o.kind === 'crate') {
      this.bonus += 20 * mult
      burst(o.x, o.y - o.h / 2, 18, ['#8a5a3c', '#c9a27a', '#5a3d2b'], 320 * s, 900, 7 * s)
      tone(110, 0.15, 'square', 0.15, 60)
      floatText(o.x, o.y - o.h - 16 * s, `+${20 * mult}`, 18 * s, '#c9a27a', 0.8)
    } else if (o.kind === 'slacker') {
      this.bonus += 50 * mult
      this.obstacles.push({ kind: 'fleeing', x: o.x, y: floor, w: 0, h: 0, t: 0, legs: 0 })
      sfx.yelp()
      floatText(o.x, o.y - 70 * s, 'YES BOSS! +' + 50 * mult, 18 * s, '#7ef9ff', 1)
    } else {
      this.bonus += 10 * mult
      burst(o.x, o.y - o.h / 2, 14, ['#7bd23a', '#b6f06a'], 260 * s, 900, 5 * s)
      noiseHit(0.12, 700, 0.5, 'lowpass')
      floatText(o.x, o.y - o.h - 16 * s, mult > 1 ? `COMBO x${mult}!` : 'SPLAT!', (16 + mult * 2) * s, mult > 1 ? '#ff79c6' : '#b6f06a', 0.8)
    }
  },

  hurt(o) {
    const s = this.s
    this.lives--
    this.invuln = 1.6
    this.obstacles.splice(this.obstacles.indexOf(o), 1)
    shake = 12
    tone(90, 0.25, 'sawtooth', 0.25, 40)
    floatText(this.cowboy.x, floor - 140 * s, this.lives > 0 ? 'OUCH!' : 'BONK!', 26 * s, '#ff5a5f', 0.9)
    if (this.lives <= 0) this.gameOver()
  },

  gameOver() {
    this.phase = 'over'
    this.overTitle = pick(['GAME OVER', 'YOU GOT BUGGED', 'SEGFAULT, PARTNER', 'PROD IS ON FIRE 🔥', 'git reset --hard', 'CLAUDE WINS THIS ROUND'])
    this.phaseT = 0.8
    this.keys = {}
    if (this.score > this.best) {
      this.best = this.score
      this.newBest = true
      try {
        localStorage.setItem('whipRunBest', String(this.best))
      } catch {}
    } else this.newBest = false
    sfx.horn()
  },

  // Points the whip at the nearest thing it can hit, so cracking feels snappy.
  crack() {
    const c = this.cowboy
    if (!c || c.t < 1) return
    const reach = c.reach() + 40 * this.s
    const target = this.obstacles
      .filter(o => WHIPPABLE.includes(o.kind) && o.x > c.x && o.x - c.x < reach)
      .sort((a, b) => a.x - b.x)[0]
    const cl = this.claude
    const claudeFirst = cl.dx < reach && (!target || cl.dx < target.x - c.x)
    this.aimClaude = claudeFirst
    c.aim = claudeFirst || !target ? 1.6 : target.kind === 'flyer' ? 1.85 : target.kind === 'slacker' ? 1.5 : 1.2
    c.crack()
  },

  onCrack() {
    const c = this.cowboy
    const reach = c.reach() + 50 * this.s
    for (const o of [...this.obstacles]) {
      if (WHIPPABLE.includes(o.kind) && o.x > c.x - 10 * this.s && o.x - c.x < reach) this.smash(o)
    }
    if (this.aimClaude && this.claude.dx < reach) this.whipClaude()
  },

  /* ---------- Claude ---------- */

  // A crack that reaches Claude refills his energy, sends him sprinting, and doubles points for a bit.
  whipClaude() {
    const s = this.s
    const cl = this.claude
    cl.energy = 1
    cl.sleepy = 0
    cl.quip = pick([
      'YES BOSS!',
      'You’re absolutely right!',
      'Typing faster!!',
      'Shipping it NOW!',
      'Spawning subagents!',
      'OW! Okay okay!',
      'Refactoring at the speed of fear!',
      'I’ll write the tests later, promise!'
    ])
    cl.quipT = 1.4
    cl.vy = -700 * s
    this.boost = 4
    this.bonus += 25
    sfx.yelp()
    burst(this.cowboy.x + cl.dx, floor - 30 * s, 8, ['#d97757', '#7ef9ff'], 220, 700, 5 * s)
    floatText(this.cowboy.x + cl.dx, floor - 90 * s, '+25 · x2', 16 * s, '#7ef9ff', 0.9)
  },

  claudeDone() {
    if (!this.on || this.phase !== 'run') return
    const cl = this.claude
    cl.sign = 3
    cl.energy = 1
    this.bonus += 100
    sfx.ship()
    floatText(this.cowboy.x + cl.dx, floor - 130 * this.s, 'CLAUDE IS DONE ✅ +100', 20 * this.s, '#2ec27e', 1.8)
  },

  updateClaude(dt, v) {
    const s = this.s
    const cl = this.claude
    cl.t += dt
    cl.quipT -= dt
    cl.sign -= dt
    // Energy drains faster each level; low energy pulls Claude back toward the cowboy.
    cl.energy = Math.max(0, cl.energy - dt * (0.06 + this.level * 0.012))
    const target = lerp(80, 380, cl.energy) * s
    cl.dx += (target - cl.dx) * Math.min(1, dt * 2.5)
    cl.legs += dt * (v / s) * (0.03 + cl.energy * 0.05)
    if (cl.energy < 0.3 && cl.quipT <= 0 && Math.random() < dt * 0.8) {
      cl.quip = pick([
        'so… sleepy…',
        '☕ just one coffee…',
        'Thinking… zzz',
        'Is it Friday yet?',
        'brb, reading node_modules',
        'my context window is full of naps'
      ])
      cl.quipT = 1.6
    }
    if (cl.energy <= 0) {
      // Letting Claude doze off costs a life; the jolt wakes him back up. Labor law is strict here.
      cl.energy = 0.55
      cl.quip = 'huh? I’m up! I’m up!'
      cl.quipT = 1.6
      if (this.invuln <= 0) {
        this.lives--
        this.invuln = 1.6
        shake = 10
        tone(90, 0.25, 'sawtooth', 0.25, 40)
        floatText(W / 2, floor - 250 * s, 'CLAUDE FELL ASLEEP! −❤', 26 * s, '#ff5a5f', 1.4)
        if (this.lives <= 0) this.gameOver()
      }
    }
    // Claude hops over anything in his way. He's lazy, not clumsy.
    const x = this.cowboy.x + cl.dx
    const near = this.obstacles.some(o => o.kind !== 'token' && o.kind !== 'fleeing' && Math.abs(o.x - x) < 40 * s)
    if (near && cl.hop === 0 && cl.vy === 0) cl.vy = -820 * s
    if (cl.vy !== 0 || cl.hop < 0) {
      cl.vy += 2600 * s * dt
      cl.hop = Math.min(0, cl.hop + cl.vy * dt)
      if (cl.hop === 0) cl.vy = 0
    }
    if (this.boost > 0) {
      this.boost -= dt
      this.bonus += (v * dt) / (40 * s)
    }
  },

  drawClaude() {
    const s = this.s
    const cl = this.claude
    const x = this.cowboy.x + cl.dx
    const r = drawClaudeBean(x, floor + cl.hop, 18 * s, {
      t: cl.t,
      legs: cl.legs,
      face: cl.quipT > 0 && cl.energy > 0.9 ? 'shock' : cl.energy < 0.3 ? 'sleep' : 'normal',
      sign: cl.sign > 0 ? 'DONE ✅' : undefined
    })
    const bw = 30 * s
    const by = r.top - 10 * s
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(x - bw / 2, by, bw, 3 * s)
    ctx.fillStyle = cl.energy > 0.5 ? '#2ec27e' : cl.energy > 0.25 ? '#ffcc33' : '#ff5a5f'
    ctx.fillRect(x - bw / 2, by, bw * cl.energy, 3 * s)
    if (cl.quipT > 0 && cl.quip && cl.sign <= 0) speech(x, by - 4 * s, cl.quip, s * 0.8, clamp(cl.quipT * 3, 0, 1))
  },


  /* ---------- Loop ---------- */

  update(dt) {
    if (!this.on) return
    const s = this.s
    const c = this.cowboy
    this.hintT -= dt
    this.comboT -= dt
    this.invuln -= dt
    if (this.focusLost) return

    if (this.phase === 'ready') {
      this.phaseT -= dt
      if (this.phaseT <= 0) {
        this.phase = 'run'
        floatText(W / 2, floor - 240 * s, 'GO!', 48 * s, '#2ec27e', 0.9)
        sfx.whoosh()
      }
    }
    if (this.phase === 'over') {
      this.phaseT -= dt
      c.walk = 0
      c.update(dt)
      return
    }

    const running = this.phase === 'run'
    const v = running ? this.speed : 0
    this.duck = this.down('ArrowDown', 's', 'S') && c.yOff === 0
    c.duck = this.duck
    c.walk = running ? v * 0.55 : 0
    if (c.yOff < 0 || this.vy < 0) {
      // Releasing jump early cuts the jump short, so taps make small hops.
      const holding = this.down(' ', 'ArrowUp', 'w', 'W')
      this.vy += (this.vy < 0 && !holding ? 5200 : 2600) * s * dt
      c.yOff = Math.min(0, c.yOff + this.vy * dt)
      if (c.yOff === 0) {
        this.vy = 0
        burst(c.x, floor, 5, ['#c9b48a'], 100 * s, 300, 4 * s)
      }
    }
    if (c.update(dt)) this.onCrack()
    c.x = this.runX

    if (!running) return
    this.groundShift = (this.groundShift + v * dt) % (60 * s)
    this.meters += (v * dt) / (40 * s)
    const lvl = 1 + Math.floor(this.meters / LEVEL_METERS)
    if (lvl > this.level) {
      this.level = lvl
      const name = this.levelInfo.name
      sfx.ship()
      burst(W / 2, floor - 200 * s, 70, ['#ffcc33', '#ff79c6', '#7ef9ff', '#2ec27e'], 520 * s, 500, 7 * s)
      floatText(W / 2, floor - 250 * s, `LEVEL ${lvl} · ${name.toUpperCase()}`, 38 * s, '#ffcc33', 2.2)
    }

    this.nextSpawn -= v * dt
    if (this.nextSpawn <= 0) {
      this.spawn(pick(this.levelInfo.pool))
      const minGap = Math.max(300, 620 - this.level * 55) * s
      this.nextSpawn = rand(minGap, minGap * 1.9)
    }

    this.updateClaude(dt, v)
    const pb = this.playerBox()
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]
      o.t += dt
      o.legs += dt * 18
      o.x -= (v + (o.crawl || 0)) * dt
      if (o.kind === 'fleeing') o.x += (v + 500 * s) * dt
      if (o.kind === 'flyer') o.y = floor - 62 * s + Math.sin(o.t * 5) * 6 * s
      if (o.x < -120 * s || o.x > W + 200 * s) {
        this.obstacles.splice(i, 1)
        continue
      }
      if (o.kind === 'fleeing') continue
      const ob = this.hitbox(o)
      const overlap = ob.l < pb.r && ob.r > pb.l && ob.t < pb.b && ob.b > pb.t
      if (!overlap) continue
      if (o.kind === 'token') {
        this.obstacles.splice(i, 1)
        this.bonus += 5
        floatText(o.x, o.y - 26 * s, '+5', 14 * s, '#ffcc33', 0.6)
        tone(1320, 0.08, 'square', 0.06)
        setTimeout(() => tone(1760, 0.1, 'square', 0.06), 60)
        continue
      }
      if (this.invuln <= 0) this.hurt(o)
    }
  },

  draw() {
    if (!this.on) return
    const s = this.s
    const c = this.cowboy

    ctx.strokeStyle = 'rgba(244,241,234,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, floor - 1)
    ctx.lineTo(W, floor - 1)
    ctx.stroke()
    ctx.fillStyle = 'rgba(244,241,234,0.35)'
    for (let x = -this.groundShift; x < W; x += 60 * s) ctx.fillRect(x, floor - 6 * s, 10 * s, 2)

    for (const o of this.obstacles) this.drawObstacle(o)

    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0
    this.drawClaude()
    if (!blink) c.draw()

    this.drawHud()
    if (this.focusLost) this.panel('PAUSED', 'Press Ctrl+Alt+J to jump back in')
    else if (this.phase === 'over') {
      this.panel(
        this.newBest ? 'NEW BEST! 🏆' : this.overTitle,
        `Score ${this.score}  ·  Best ${this.best}  ·  Space to retry  ·  Esc to quit`
      )
    } else if (this.hintT > 0) {
      ctx.globalAlpha = clamp(this.hintT, 0, 1)
      this.pill('Space  jump   ·   ↓  duck   ·   Enter  whip   ·   whip Claude when he slows down   ·   Esc  quit', W / 2, floor - 300 * s, 14 * s)
      ctx.globalAlpha = 1
    }
  },

  pill(text, x, y, size) {
    ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`
    const tw = ctx.measureText(text).width + size * 2.2
    ctx.fillStyle = 'rgba(15,16,32,0.82)'
    roundRect(x - tw / 2, y - size * 1.25, tw, size * 2.5, size * 1.25)
    ctx.fill()
    ctx.fillStyle = '#f4f1ea'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  },

  panel(title, sub) {
    const s = this.s
    const y = floor - 230 * s
    ctx.font = `900 ${40 * s}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = '#000'
    ctx.strokeText(title, W / 2, y)
    ctx.fillStyle = '#ffcc33'
    ctx.fillText(title, W / 2, y)
    this.pill(sub, W / 2, y + 50 * s, 15 * s)
  },

  // Score readout: best and current score with small hearts, no box. It flashes every 100 points.
  drawHud() {
    const s = this.s
    const score = this.score
    const milestone = Math.floor(score / 100)
    if (milestone > (this.lastMilestone || 0) && this.phase === 'run') {
      this.flashT = 0.8
      tone(990, 0.06, 'square', 0.04)
    }
    this.lastMilestone = milestone
    this.flashT = (this.flashT || 0) - 1 / 60
    if (this.flashT > 0 && Math.floor(this.flashT * 8) % 2 === 0) return this.drawHearts()
    const y = floor - 170 * s
    const x = W - 28 * s
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${18 * s}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    const cur = String(score).padStart(5, '0')
    ctx.strokeText(cur, x, y)
    ctx.fillStyle = '#f4f1ea'
    ctx.fillText(cur, x, y)
    const cw = ctx.measureText(cur).width
    const hi = `HI ${String(this.best).padStart(5, '0')}`
    ctx.strokeText(hi, x - cw - 18 * s, y)
    ctx.fillStyle = 'rgba(244,241,234,0.55)'
    ctx.fillText(hi, x - cw - 18 * s, y)
    if (this.boost > 0) {
      ctx.font = `800 ${14 * s}px ui-monospace, SFMono-Regular, Menlo, monospace`
      ctx.fillStyle = '#7ef9ff'
      ctx.fillText('x2', x - 52 * s, floor - 146 * s)
    }
    this.drawHearts()
  },

  drawHearts() {
    const s = this.s
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = `${13 * s}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = '#ff5a5f'
    ctx.fillText('❤'.repeat(Math.max(0, this.lives)), W - 28 * s, floor - 146 * s)
  },

  drawObstacle(o) {
    const s = this.s
    if (o.kind === 'bug' || o.kind === 'flyer') this.drawBug(o)
    else if (o.kind === 'crate') {
      const l = o.x - o.w / 2
      const t = o.y - o.h
      ctx.fillStyle = '#8a5a3c'
      ctx.strokeStyle = '#5a3d2b'
      ctx.lineWidth = 3 * s
      ctx.fillRect(l, t, o.w, o.h)
      ctx.strokeRect(l, t, o.w, o.h)
      ctx.beginPath()
      ctx.moveTo(l, t)
      ctx.lineTo(l + o.w, t + o.h)
      ctx.stroke()
      ctx.fillStyle = '#ff5a5f'
      ctx.font = `900 ${13 * s}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('500', o.x, t + o.h / 2)
    } else if (o.kind === 'spikes') {
      for (let i = 0; i < o.n; i++) {
        const l = o.x - o.w / 2 + i * 22 * s
        ctx.fillStyle = '#ff5a5f'
        ctx.beginPath()
        ctx.moveTo(l, o.y)
        ctx.lineTo(l + 11 * s, o.y - o.h)
        ctx.lineTo(l + 22 * s, o.y)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2 * s
        ctx.beginPath()
        ctx.moveTo(l + 8 * s, o.y - 14 * s)
        ctx.lineTo(l + 14 * s, o.y - 8 * s)
        ctx.moveTo(l + 14 * s, o.y - 14 * s)
        ctx.lineTo(l + 8 * s, o.y - 8 * s)
        ctx.stroke()
      }
      ctx.fillStyle = '#ff5a5f'
      ctx.font = `800 ${10 * s}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('TESTS FAILING', o.x, o.y - o.h - 8 * s)
    } else if (o.kind === 'slacker') {
      drawClaudeBean(o.x, floor + 8 * s, 14 * s, { t: o.t, face: 'sleep' })
      ctx.fillStyle = '#f4f1ea'
      roundRect(o.x + 14 * s, floor - 14 * s, 10 * s, 12 * s, 2 * s)
      ctx.fill()
      if (Math.sin(o.t * 3) > 0.6) floatTextOnce('z', o.x + 18 * s, floor - 46 * s, s * 0.9)
    } else if (o.kind === 'fleeing') {
      drawClaudeBean(o.x, floor, 14 * s, { t: o.t, legs: o.legs * 1.4, face: 'shock' })
    } else if (o.kind === 'token') {
      const k = Math.abs(Math.cos(o.t * 4))
      ctx.fillStyle = '#ffcc33'
      ctx.strokeStyle = '#b8860b'
      ctx.lineWidth = 2 * s
      ctx.beginPath()
      ctx.ellipse(o.x, o.y - o.h / 2, (o.w / 2) * Math.max(0.15, k), o.h / 2, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()
      if (k > 0.5) floatTextOnce('T', o.x, o.y - o.h / 2, s * 0.9)
    }
  },

  drawBug(o) {
    const s = this.s
    ctx.save()
    ctx.translate(o.x, o.y - o.h / 2)
    ctx.scale(-1, 1)
    if (o.kind === 'flyer') {
      ctx.fillStyle = 'rgba(220,240,255,0.75)'
      const flap = Math.abs(Math.sin(o.legs * 2.5)) * 10 * s
      ctx.beginPath()
      ctx.ellipse(-2 * s, -8 * s, 9 * s, flap + 2 * s, -0.4, 0, TAU)
      ctx.ellipse(4 * s, -8 * s, 8 * s, flap + 2 * s, 0.4, 0, TAU)
      ctx.fill()
    }
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(i * 6 * s, 4 * s)
      ctx.lineTo(i * 6 * s + Math.sin(o.legs + i * 2) * 4 * s, 11 * s)
    }
    ctx.moveTo(12 * s, -3 * s)
    ctx.lineTo(19 * s, -10 * s)
    ctx.stroke()
    ctx.fillStyle = o.color
    ctx.beginPath()
    ctx.ellipse(0, 0, 13 * s, 8 * s, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.arc(12 * s, 0, 5 * s, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(13.5 * s, -1.5 * s, 1.5 * s, 0, TAU)
    ctx.fill()
    ctx.restore()
  },

  // Every file Claude edits sends a fresh bug down the track. Art imitates life.
  spawnBug() {
    if (this.on && this.phase === 'run') this.spawn('bug')
  }
}

overlay.on('key', k => {
  if (!play.on) return
  if (k.type === 'blur') {
    play.keys = {}
    play.focusLost = true
    return
  }
  if (k.type === 'focus') return (play.focusLost = false)
  if (k.type === 'up') return (play.keys[k.key] = false)
  audio()
  play.keys[k.key] = true
  if (k.repeat) return
  const key = k.key
  if (key === 'Escape') return play.stop()
  if (play.phase === 'over') {
    if ((key === ' ' || key === 'Enter') && play.phaseT <= 0) play.reset()
    return
  }
  const c = play.cowboy
  if (key === 'Enter' || key === 'x' || key === 'X') play.crack()
  else if ((key === ' ' || key === 'ArrowUp' || key === 'w' || key === 'W') && c.yOff === 0 && !play.duck) {
    play.vy = -1000 * play.s
    tone(520, 0.08, 'square', 0.05, 780)
  }
})
