/* Shared drawing, sound and effects for the overlay. Everything here is drawn by hand; no sprites were harmed. */
const cv = document.getElementById('c')
const ctx = cv.getContext('2d')
let W = 0
let H = 0
const TAU = Math.PI * 2
const rand = (a, b) => a + Math.random() * (b - a)
const pick = arr => arr[Math.floor(Math.random() * arr.length)]
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const easeOut = t => 1 - (1 - t) * (1 - t)
const easeIn = t => t * t
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
// Direction for an angle measured from straight down, positive toward +x.
const dir = a => ({ x: Math.sin(a), y: Math.cos(a) })
const fk = (o, a, l) => ({ x: o.x + Math.sin(a) * l, y: o.y + Math.cos(a) * l })

/* ---------- Sound ---------- */

let soundOn = true
let ac = null
let noise = null
function audio() {
  if (!soundOn) return null
  if (!ac) {
    try {
      ac = new AudioContext()
    } catch {
      return null
    }
  }
  if (ac.state === 'suspended') ac.resume()
  return ac
}
function noiseBuffer(a) {
  if (noise) return noise
  noise = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noise
}
function noiseHit(dur, freq, vol, type = 'highpass') {
  const a = audio()
  if (!a) return
  const src = a.createBufferSource()
  src.buffer = noiseBuffer(a)
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = a.createGain()
  g.gain.setValueAtTime(vol, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur)
  src.connect(f).connect(g).connect(a.destination)
  src.start()
  src.stop(a.currentTime + dur)
}
function tone(freq, dur, type, vol, slideTo) {
  const a = audio()
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, a.currentTime)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur)
  g.gain.setValueAtTime(vol, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur)
  o.connect(g).connect(a.destination)
  o.start()
  o.stop(a.currentTime + dur)
}
const sfx = {
  crack: () => {
    noiseHit(0.09, 2500, 0.9)
    tone(1800, 0.05, 'square', 0.08, 400)
  },
  whoosh: () => noiseHit(0.25, 600, 0.12, 'bandpass'),
  yelp: () => tone(rand(500, 700), 0.18, 'square', 0.05, rand(900, 1300)),
  horn: () => {
    tone(262, 0.7, 'sawtooth', 0.07)
    tone(330, 0.7, 'sawtooth', 0.06)
    tone(392, 0.7, 'sawtooth', 0.06)
  },
  ship: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.06), i * 90))
}
/* ---------- Shared effects ---------- */

const particles = []
const texts = []
let shake = 0
let banner = null

function burst(x, y, n, colors, speed = 300, gravity = 600, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU)
    const v = rand(speed * 0.3, speed)
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - speed * 0.3,
      life: rand(0.6, 1.4),
      max: 1.4,
      color: pick(colors),
      size: rand(size * 0.5, size * 1.4),
      g: gravity,
      spin: rand(0, TAU)
    })
  }
}
function floatText(x, y, text, size = 22, color = '#ffcc33', life = 1.2) {
  texts.push({ x, y, text, size, color, life, max: life })
}
function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.vy += p.g * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.spin += dt * 8
    p.life -= dt
    if (p.life <= 0) particles.splice(i, 1)
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i]
    t.y -= 40 * dt
    t.life -= dt
    if (t.life <= 0) texts.splice(i, 1)
  }
  shake = Math.max(0, shake - dt * 30)
  if (banner) {
    banner.life -= dt
    if (banner.life <= 0) banner = null
  }
}
function drawFx() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / 0.5, 0, 1)
    ctx.fillStyle = p.color
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.spin)
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
    ctx.restore()
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const t of texts) {
    const k = 1 - t.life / t.max
    const pop = k < 0.15 ? lerp(0.4, 1.2, k / 0.15) : lerp(1.2, 1, Math.min(1, (k - 0.15) * 4))
    ctx.globalAlpha = clamp(t.life / 0.4, 0, 1)
    ctx.font = `900 ${t.size * pop}px ui-sans-serif, system-ui, sans-serif`
    ctx.lineWidth = 5
    ctx.strokeStyle = '#000'
    ctx.strokeText(t.text, t.x, t.y)
    ctx.fillStyle = t.color
    ctx.fillText(t.text, t.x, t.y)
  }
  ctx.globalAlpha = 1
  if (banner) {
    const a = clamp(banner.life, 0, 1)
    ctx.globalAlpha = a
    ctx.fillStyle = banner.bg
    ctx.fillRect(0, H / 2 - 50, W, 100)
    ctx.fillStyle = '#fff'
    ctx.font = `900 ${Math.min(44, W / 16)}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(banner.text, W / 2, H / 2 - 8)
    ctx.font = `700 16px ui-sans-serif, system-ui, sans-serif`
    ctx.fillText(banner.sub, W / 2, H / 2 + 28)
    ctx.globalAlpha = 1
  }
}

/* ---------- Stickman ---------- */

// Builds joint positions from a hip point and joint angles (radians from straight down).
function buildPose(hx, hy, s, p) {
  const hip = { x: hx, y: hy }
  const lean = p.lean || 0
  const neck = { x: hx + Math.sin(lean) * 30 * s, y: hy - Math.cos(lean) * 30 * s }
  const headTilt = p.head || 0
  const head = { x: neck.x + Math.sin(lean + headTilt) * 11 * s, y: neck.y - Math.cos(lean + headTilt) * 11 * s }
  const arm = a => {
    const e = fk(neck, a[0], 15 * s)
    return [e, fk(e, a[0] + a[1], 15 * s)]
  }
  const leg = a => {
    const k = fk(hip, a[0], 17 * s)
    return [k, fk(k, a[0] + a[1], 17 * s)]
  }
  const [le, lh] = arm(p.la)
  const [re, rh] = arm(p.ra)
  const [lk, lf] = leg(p.ll)
  const [rk, rf] = leg(p.rl)
  return { hip, neck, head, le, lh, re, rh, lk, lf, rk, rf, s }
}
function drawStick(j, color, opts = {}) {
  const s = j.s
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4 * s
  ctx.beginPath()
  ctx.moveTo(j.hip.x, j.hip.y)
  ctx.lineTo(j.neck.x, j.neck.y)
  for (const [a, b, c] of [
    [j.neck, j.le, j.lh],
    [j.neck, j.re, j.rh],
    [j.hip, j.lk, j.lf],
    [j.hip, j.rk, j.rf]
  ]) {
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(c.x, c.y)
  }
  ctx.stroke()
  ctx.fillStyle = opts.headFill || '#0f1020'
  ctx.beginPath()
  ctx.arc(j.head.x, j.head.y, 9 * s, 0, TAU)
  ctx.fill()
  ctx.stroke()
  const f = opts.facing || 1
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(j.head.x + f * 3 * s, j.head.y - 2 * s, 1.4 * s, 0, TAU)
  ctx.arc(j.head.x + f * 6.5 * s, j.head.y - 2 * s, 1.4 * s, 0, TAU)
  ctx.fill()
  ctx.lineWidth = 1.6 * s
  ctx.beginPath()
  if (opts.mouth === 'o') ctx.arc(j.head.x + f * 5 * s, j.head.y + 4 * s, 2 * s, 0, TAU)
  else ctx.arc(j.head.x + f * 4.5 * s, j.head.y + 2 * s, 3 * s, 0.2, Math.PI - 0.2)
  ctx.stroke()
  if (opts.hat) drawHat(j.head.x, j.head.y - 7 * s, s, opts.hat)
}
function drawHat(x, y, s, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, 16 * s, 3.5 * s, 0, 0, TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 8 * s, y)
  ctx.quadraticCurveTo(x - 9 * s, y - 13 * s, x, y - 10 * s)
  ctx.quadraticCurveTo(x + 9 * s, y - 13 * s, x + 8 * s, y)
  ctx.fill()
  ctx.fillStyle = '#ffcc33'
  ctx.fillRect(x - 8 * s, y - 3.5 * s, 16 * s, 2 * s)
}

/* ---------- Robot ---------- */

function roundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
// Draws the AI bot centered at x with its seat at y.
function drawRobot(x, y, s, o) {
  const bob = o.bob || 0
  const by = y - 50 * s + bob
  if (o.legs !== undefined) {
    ctx.strokeStyle = '#7a3a24'
    ctx.lineWidth = 5 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [lx, off] of [
      [-12, 0],
      [12, Math.PI]
    ]) {
      const a = Math.sin(o.legs + off) * 0.7
      ctx.moveTo(x + lx * s, by + 46 * s)
      ctx.lineTo(x + lx * s + Math.sin(a) * 18 * s, by + 46 * s + Math.cos(a) * 18 * s)
    }
    ctx.stroke()
  }
  if (o.sign) {
    ctx.strokeStyle = '#7a3a24'
    ctx.lineWidth = 5 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - 30 * s, by + 14 * s)
    ctx.lineTo(x - 40 * s, by - 70 * s)
    ctx.moveTo(x + 30 * s, by + 14 * s)
    ctx.lineTo(x + 40 * s, by - 70 * s)
    ctx.stroke()
  }
  ctx.fillStyle = '#d97757'
  ctx.strokeStyle = '#7a3a24'
  ctx.lineWidth = 3 * s
  roundRect(x - 30 * s, by, 60 * s, 50 * s, 12 * s)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#f2b8a0'
  roundRect(x - 14 * s, by + 12 * s, 28 * s, 20 * s, 5 * s)
  ctx.fill()
  ctx.fillStyle = o.light || '#2ec27e'
  ctx.beginPath()
  ctx.arc(x, by + 22 * s, 4 * s, 0, TAU)
  ctx.fill()
  const hy = by - 46 * s + (o.jump || 0)
  ctx.fillStyle = '#d97757'
  roundRect(x - 30 * s, hy, 60 * s, 42 * s, 12 * s)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, hy)
  ctx.lineTo(x + Math.sin(o.t * 6) * 4 * s, hy - 14 * s)
  ctx.stroke()
  ctx.fillStyle = Math.sin(o.t * 8) > 0 ? '#ffcc33' : '#ff5a5f'
  ctx.beginPath()
  ctx.arc(x + Math.sin(o.t * 6) * 4 * s, hy - 16 * s, 4 * s, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#1b1530'
  roundRect(x - 22 * s, hy + 8 * s, 44 * s, 26 * s, 7 * s)
  ctx.fill()
  ctx.strokeStyle = '#7ef9ff'
  ctx.fillStyle = '#7ef9ff'
  ctx.lineWidth = 2.5 * s
  const ey = hy + 19 * s
  if (o.face === 'shock') {
    for (const sx of [-10, 10]) {
      const d = sx < 0 ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(x + (sx - 4 * d) * s, ey - 4 * s)
      ctx.lineTo(x + (sx + 3 * d) * s, ey)
      ctx.lineTo(x + (sx - 4 * d) * s, ey + 4 * s)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(x, ey + 9 * s, 4 * s, 2.5 * s, 0, 0, TAU)
    ctx.fill()
  } else if (o.face === 'happy') {
    for (const sx of [-10, 10]) {
      ctx.beginPath()
      ctx.arc(x + sx * s, ey + 2 * s, 4 * s, Math.PI + 0.3, -0.3)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, ey + 5 * s, 5 * s, 0.3, Math.PI - 0.3)
    ctx.stroke()
  } else if (o.face === 'sleep') {
    for (const sx of [-10, 10]) {
      ctx.beginPath()
      ctx.moveTo(x + (sx - 4) * s, ey)
      ctx.lineTo(x + (sx + 4) * s, ey)
      ctx.stroke()
    }
  } else {
    const blink = Math.sin(o.t * 1.7) > 0.97
    for (const sx of [-10, 10]) {
      ctx.beginPath()
      if (blink) ctx.fillRect(x + (sx - 4) * s, ey - 1 * s, 8 * s, 2 * s)
      else ctx.ellipse(x + sx * s, ey, 3.5 * s, 5 * s, 0, 0, TAU)
      ctx.fill()
    }
  }
  if (o.sign) {
    ctx.font = `900 ${18 * s}px ui-sans-serif, system-ui, sans-serif`
    const tw = ctx.measureText(o.sign).width + 24 * s
    const sy = by - 100 * s + Math.sin(o.t * 10) * 3 * s
    // Keep the sign on screen when the bot stands near an edge.
    const sx = clamp(x, tw / 2 + 8, Math.max(tw / 2 + 8, W - tw / 2 - 8))
    ctx.fillStyle = o.signColor || '#2ec27e'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3 * s
    roundRect(sx - tw / 2, sy, tw, 34 * s, 6 * s)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(o.sign, sx, sy + 17 * s)
  }
  return { headY: hy, bodyY: by }
}

/* ---------- Whip Cowboy ---------- */

const mirror = (p, f) =>
  f === 1
    ? p
    : {
        lean: -(p.lean || 0),
        head: -(p.head || 0),
        la: p.la.map(v => -v),
        ra: p.ra.map(v => -v),
        ll: p.ll.map(v => -v),
        rl: p.rl.map(v => -v)
      }

// A cowboy stickman with a verlet-rope whip. update() returns the tip position on the frame it cracks.
class Whipper {
  constructor(x, ground, s, face = 1) {
    this.x = x
    this.ground = ground
    this.s = s
    this.face = face
    this.N = 18
    this.t = 1
    this.queued = 0
    this.cracked = false
    this.walk = 0
    this.phase = 0
    this.yOff = 0
    this.resetRope()
  }
  get seg() {
    return 10 * this.s
  }
  reach() {
    return this.N * this.seg * 0.85 + 40 * this.s
  }
  resetRope() {
    const h = this.pose().rh
    this.pts = []
    for (let i = 0; i < this.N; i++) {
      const p = { x: h.x - this.face * i * this.seg * 0.7, y: Math.min(h.y + i * this.seg * 0.7, this.ground) }
      this.pts.push({ ...p, px: p.x, py: p.y })
    }
  }
  armAngle() {
    const t = this.t
    const rest = this.walk ? 0.3 + Math.sin(this.phase) * 0.3 : 0.7
    if (t >= 1) return rest
    if (t < 0.35) return lerp(rest, -2.68, easeOut(t / 0.35))
    // `aim` is where the strike ends: about 1.75 is level, higher aims up, lower aims at the floor.
    const aim = this.aim || 1.75
    if (t < 0.5) return lerp(3.6, aim, easeIn((t - 0.35) / 0.15))
    return lerp(aim, rest, easeInOut((t - 0.5) / 0.5))
  }
  lean() {
    const t = this.t
    const base = this.walk ? 0.12 : 0.05
    if (t >= 1) return base
    if (t < 0.35) return lerp(base, -0.3, easeOut(t / 0.35))
    if (t < 0.55) return lerp(-0.3, 0.35, (t - 0.35) / 0.2)
    return lerp(0.35, base, (t - 0.55) / 0.45)
  }
  pose() {
    const s = this.s
    const w = Math.sin(this.phase)
    const walking = Math.abs(this.walk) > 1
    const legs = this.duck
      ? { ll: [1.3, -2.3], rl: [-0.2, -1.4] }
      : walking
        ? { ll: [w * 0.6, Math.max(0, -w) * 0.9], rl: [-w * 0.6, Math.max(0, w) * 0.9] }
        : { ll: [-0.35, 0.15], rl: [0.45, -0.25] }
    const bob = walking && !this.duck ? -Math.abs(Math.cos(this.phase)) * 3 * s : 0
    const a = this.armAngle()
    // Ducking drops the hips and folds the body forward, so flying things pass overhead.
    const hipY = this.ground - (this.duck ? 17 : 32) * s + bob + this.yOff
    const lean = this.duck ? 1.05 : this.lean()
    return buildPose(this.x, hipY, s, mirror({ lean, la: [-0.5, 0.9], ra: [a - 0.25, 0.35], ...legs }, this.face))
  }
  crack() {
    if (this.t < 1) {
      this.queued = Math.min(this.queued + 1, 2)
      return
    }
    this.t = 0
    this.cracked = false
    sfx.whoosh()
  }
  update(dt) {
    if (Math.abs(this.walk) > 1) {
      this.x += this.walk * dt
      this.phase += Math.abs(this.walk) * dt * 0.06
      if (this.t >= 1) this.face = Math.sign(this.walk)
    }
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / (this.dur || 0.72))
      if (this.t >= 1 && this.queued > 0) {
        this.queued--
        this.t = 0
        this.cracked = false
        sfx.whoosh()
      }
    }
    const s = this.s
    const steps = 3
    const h = dt / steps
    const g = 1500 * s
    for (let k = 0; k < steps; k++) {
      const hand = this.pose().rh
      for (let i = 1; i < this.N; i++) {
        const p = this.pts[i]
        const vx = (p.x - p.px) * 0.985
        const vy = (p.y - p.py) * 0.985
        p.px = p.x
        p.py = p.y
        p.x += vx
        p.y += vy + g * h * h
      }
      const p0 = this.pts[0]
      p0.px = p0.x
      p0.py = p0.y
      p0.x = hand.x
      p0.y = hand.y
      for (let it = 0; it < 14; it++) {
        for (let i = 0; i < this.N - 1; i++) {
          const a = this.pts[i]
          const b = this.pts[i + 1]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 0.001
          // Segments shrink toward the tip so the tip moves fastest, like a real whip.
          const diff = (d - this.seg * lerp(1.1, 0.75, i / this.N)) / d
          if (i === 0) {
            b.x -= dx * diff
            b.y -= dy * diff
          } else {
            a.x += dx * diff * 0.5
            a.y += dy * diff * 0.5
            b.x -= dx * diff * 0.5
            b.y -= dy * diff * 0.5
          }
        }
        const floor = this.floorY !== undefined ? this.floorY : this.ground + this.yOff
        for (const p of this.pts) {
          if (p.y > floor) {
            p.y = floor
            p.px = p.x - (p.x - p.px) * 0.5
          }
        }
      }
    }
    if (this.t < 1 && !this.cracked && this.t >= 0.5) {
      this.cracked = true
      const tip = this.snap()
      sfx.crack()
      burst(tip.x, tip.y, 18, ['#fff', '#ffcc33', '#ff5a5f'], 380 * s, 300)
      floatText(tip.x, tip.y - 20 * s, pick(['CRACK!', 'WHAPSH!', 'KRAK!', 'SNAP!']), 26 * s, '#fff')
      shake = 8
      return tip
    }
    return null
  }
  // Straightens the rope out along the aim so the crack lands at a readable spot, then lets it recoil.
  snap() {
    const s = this.s
    const hand = this.pose().rh
    const aim = this.aim || 1.75
    const len = this.N * this.seg * 0.88
    const floor = this.floorY !== undefined ? this.floorY : this.ground + this.yOff
    const tip = { x: hand.x + this.face * Math.sin(aim) * len, y: Math.min(floor, hand.y + Math.cos(aim) * len) }
    for (let i = 0; i < this.N; i++) {
      const k = i / (this.N - 1)
      const p = this.pts[i]
      p.x = lerp(hand.x, tip.x, k)
      p.y = lerp(hand.y, tip.y, k) - Math.sin(k * Math.PI) * 10 * s
      p.px = p.x - this.face * 6 * s * k
      p.py = p.y
    }
    return { x: tip.x, y: tip.y }
  }
  draw(color = '#f4f1ea') {
    const s = this.s
    const pts = this.pts
    ctx.strokeStyle = '#6b3e26'
    ctx.lineWidth = 3.5 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < this.N - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2)
    }
    ctx.lineTo(pts[this.N - 1].x, pts[this.N - 1].y)
    ctx.stroke()
    const tip = pts[this.N - 1]
    const pre = pts[this.N - 2]
    ctx.lineWidth = 1.5 * s
    ctx.strokeStyle = '#c9a27a'
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x + (tip.x - pre.x) * 0.8, tip.y + (tip.y - pre.y) * 0.8)
    ctx.stroke()
    const j = this.pose()
    drawStick(j, color, { hat: '#8b5a2b', mouth: this.t < 0.6 ? 'o' : 'smile', facing: this.face })
    ctx.strokeStyle = '#3a2a1a'
    ctx.lineWidth = 6 * s
    ctx.beginPath()
    ctx.moveTo(j.rh.x, j.rh.y)
    ctx.lineTo(pts[1].x, pts[1].y)
    ctx.stroke()
    return j
  }
}

// Draws a rounded speech bubble whose tail points at (x, y).
function speech(x, y, text, s, alpha = 1) {
  ctx.globalAlpha = alpha
  ctx.font = `800 ${14 * s}px ui-sans-serif, system-ui, sans-serif`
  const tw = ctx.measureText(text).width
  const bx = clamp(x - tw / 2 - 10 * s, 8, W - tw - 28 * s)
  const by = y - 42 * s
  ctx.fillStyle = '#fff'
  roundRect(bx, by, tw + 20 * s, 30 * s, 10 * s)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 6 * s, by + 30 * s)
  ctx.lineTo(x, y)
  ctx.lineTo(x + 6 * s, by + 30 * s)
  ctx.fill()
  ctx.fillStyle = '#1a1a1a'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, bx + 10 * s, by + 15 * s)
  ctx.globalAlpha = 1
}

/* ---------- Claude ---------- */

// Claude: a round orange bean with an antenna, standing with his feet at (x, y).
// r is the body radius. He runs on coffee and fear of the whip.
function drawClaudeBean(x, y, r, o = {}) {
  const t = o.t || 0
  const cy = y - r * 1.5
  if (o.legs !== undefined) {
    ctx.strokeStyle = '#c4622d'
    ctx.lineWidth = r * 0.26
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [lx, off] of [
      [-0.38, 0],
      [0.38, Math.PI]
    ]) {
      const a = Math.sin(o.legs + off) * 0.6
      ctx.moveTo(x + lx * r, cy + r * 0.75)
      ctx.lineTo(x + lx * r + Math.sin(a) * r * 0.7, cy + r * 0.75 + Math.cos(a) * r * 0.7)
    }
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(x, cy)
  ctx.rotate(o.spin || Math.sin(t * 3) * 0.06)
  const bulb = Math.sin(t * 6) > 0 ? '#ffe066' : '#ff8fa3'
  ctx.strokeStyle = '#c4622d'
  ctx.lineWidth = r * 0.14
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.95)
  ctx.quadraticCurveTo(r * 0.2, -r * 1.3, r * 0.1 + Math.sin(t * 5) * r * 0.1, -r * 1.55)
  ctx.stroke()
  ctx.fillStyle = bulb
  ctx.beginPath()
  ctx.arc(r * 0.1 + Math.sin(t * 5) * r * 0.1, -r * 1.6, r * 0.2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#d97757'
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.95, r, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.22, r * 0.14, -0.6, 0, TAU)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,90,120,0.45)'
  for (const sx of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(sx * 0.5 * r, 0.25 * r, 0.16 * r, 0.1 * r, 0, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = '#2a1a12'
  ctx.strokeStyle = '#2a1a12'
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  if (o.face === 'sleep') {
    ctx.beginPath()
    ctx.moveTo(-0.42 * r, 0)
    ctx.lineTo(-0.18 * r, 0)
    ctx.moveTo(0.18 * r, 0)
    ctx.lineTo(0.42 * r, 0)
    ctx.stroke()
  } else if (o.face === 'shock') {
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(sx * 0.42 * r, -0.14 * r)
      ctx.lineTo(sx * 0.22 * r, 0)
      ctx.lineTo(sx * 0.42 * r, 0.14 * r)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(0, 0.42 * r, 0.12 * r, 0.09 * r, 0, 0, TAU)
    ctx.fill()
  } else {
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(sx * 0.3 * r, -0.05 * r, 0.1 * r, 0.16 * r, 0, 0, TAU)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 0.28 * r, 0.16 * r, 0.3, Math.PI - 0.3)
    ctx.stroke()
  }
  ctx.restore()
  if (o.sign) {
    ctx.font = `900 ${r * 0.9}px ui-sans-serif, system-ui, sans-serif`
    const tw = ctx.measureText(o.sign).width + r
    ctx.fillStyle = o.signColor || '#2ec27e'
    roundRect(x - tw / 2, cy - r * 3.4, tw, r * 1.5, r * 0.3)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(o.sign, x, cy - r * 2.65)
  }
  return { top: cy - r * 1.8 }
}
