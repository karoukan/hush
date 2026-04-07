const fr = (navigator.language || '').startsWith('fr')
document.documentElement.lang = fr ? 'fr' : 'en'

const lang = {
  invite: fr ? 'appuyez pour commencer' : 'press to begin',
  question: fr ? 'comment tu te sens ?' : 'how are you feeling?',
  placeholder: fr ? 'une ligne, juste pour toi' : 'one line, just for you',
  moods: [
    { id: 'okay', label: fr ? 'serein' : 'okay', color: '#4ade80' },
    { id: 'hard', label: fr ? 'difficile' : 'hard', color: '#f87171' },
    { id: 'new', label: fr ? 'nouveau' : 'new', color: '#60a5fa' },
    { id: 'thinking', label: fr ? 'pensif' : 'thinking', color: '#c084fc' },
    { id: 'lost', label: fr ? 'perdu' : 'lost', color: '#fb923c' },
    { id: 'empty', label: fr ? 'vide' : 'empty', color: '#94a3b8' }
  ],
  terminal: fr
    ? ['Envoi en cours...', 'Résolution des pensées...', 'Stocké.', 'Respire.']
    : ['Pushing to origin...', 'Resolving thoughts...', 'Stored.', 'Breathe.'],
  reveal: fr
    ? "cette étoile, c'est toi.\nchaque jour en crée une nouvelle."
    : 'that star is you.\nevery day creates a new one.',
  privacy: fr ? 'Confidentialité' : 'Privacy',
  storeBadge: fr
    ? 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/fr-fr?size=250x83'
    : 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83',
  today: fr ? "aujourd'hui" : 'today'
}

document.getElementById('privacy-link').textContent = lang.privacy
document.getElementById('store-badge').src = lang.storeBadge

const ghostMessages = fr
  ? [
    'premier jour, on verra', 'fatigué mais serein', 'trop de bruit dans ma tête',
    "j'ai souri sans raison", 'juste... vide', 'une bonne journée finalement',
    'besoin de silence', 'tout va trop vite', 'ok', "j'avance",
    'pourquoi je stresse', 'un pas de plus', 'rien de spécial'
  ]
  : [
    'first day, let\'s see', 'tired but okay', 'too much noise in my head',
    'smiled for no reason', 'just... empty', 'a good day after all',
    'need some silence', 'everything\'s too fast', 'ok', 'moving forward',
    'why am i anxious', 'one step further', 'nothing special'
  ]

const MOOD_COLORS = [
  { label: fr ? 'serein' : 'okay', color: '#4ade80' },
  { label: fr ? 'difficile' : 'hard', color: '#f87171' },
  { label: fr ? 'nouveau' : 'new', color: '#60a5fa' },
  { label: fr ? 'pensif' : 'thinking', color: '#c084fc' },
  { label: fr ? 'perdu' : 'lost', color: '#fb923c' },
  { label: fr ? 'vide' : 'empty', color: '#94a3b8' }
]

let currentPhase = 'phase-invite'
let chosenMood = null
let chosenMsg = ''
let commits = []
let mainCluster = null
let didFirstPush = false

const pad = n => n < 10 ? '0' + n : '' + n

const starsEl = document.getElementById('stars')
for (let i = 0; i < 60; i++) {
  const el = document.createElement('div')
  el.className = 'star'
  const sz = 0.5 + Math.random() * 1.5
  const o1 = 0.05 + Math.random() * 0.2
  el.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--dur:${1.5+Math.random()*3}s;--o1:${o1};--o2:${o1+0.1+Math.random()*0.2};animation-delay:${Math.random()*3}s;`
  starsEl.appendChild(el)
}

const canvas = document.getElementById('galaxy')
const ctx = canvas.getContext('2d')
let clusters = []

function resize() { /* took me mass too long to get devicePixelRatio right */
  canvas.width = innerWidth * devicePixelRatio
  canvas.height = innerHeight * devicePixelRatio
  canvas.style.width = innerWidth + 'px'
  canvas.style.height = innerHeight + 'px'
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
}
addEventListener('resize', resize)
resize()

function hash7() {
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 7; i++) out += hex[Math.floor(Math.random() * 16)]
  return out
}

function hashCode(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h = h & h // force 32bit int
  }
  return Math.abs(h)
}

// cluster = one "day" with N commits orbiting
function Cluster(x, y, commits, age, isMain) {
  this.x = x
  this.y = y
  this.commits = commits
  this.age = age // days ago
  this.isMain = isMain || false
  this.t0 = performance.now()
  this.rot = 0
  // test avec des bezier curves pour la vitesse..n
  this.speed = age === 0 ? 0.015 : age < 3 ? 0.008 : age < 7 ? 0.003 : 0 // eyeballed
  this.dir = Math.random() > 0.5 ? 1 : -1
  this.phase = Math.random() * Math.PI * 2

  this.dots = commits.map((c, i) => {
    const base = (Math.PI * 2 * i) / Math.max(commits.length, 1)
    return {
      angle: base + (hashCode(c.hash) % 628) / 1000, // jitter so they don't stack
      rFactor: 0.7 + (hashCode(c.hash + 'r') % 100) / 100 * 0.6, // empirique LOL
      twinkle: Math.random() * Math.PI * 2
    }
  })
}

Cluster.prototype.isCollapsed = function() { return this.age >= 7 }

// devrait probablement être un easing mais bon ça marche
Cluster.prototype.spread = function() {
  if (this.age === 0) return 1
  if (this.age === 1) return 0.6
  if (this.age === 2) return 0.3
  if (this.age === 3) return 0.15
  if (this.age < 7) return 0.06
  return 0
}

Cluster.prototype.radius = function() {
  const max = this.commits.length <= 2 ? 14 : Math.min(12 + this.commits.length * 3, 35)
  return max * this.spread()
}

Cluster.prototype.size = function() {
  return 4 + Math.min((this.commits.length - 1) * 1.2, 10)
}

Cluster.prototype.mainColor = function() {
  const cnt = {}
  this.commits.forEach(c => { cnt[c.color] = (cnt[c.color] || 0) + 1 })
  let best = '', max = 0
  for (const k in cnt) if (cnt[k] > max) { best = k; max = cnt[k] }
  return best
}

Cluster.prototype.hit = function(mx, my) {
  const d = Math.hypot(this.x - mx, this.y - my)
  return this.isCollapsed()
    ? d < this.size() * 3
    : d < Math.max(this.radius() + 15, 25)
}

function render(t) {
  ctx.clearRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio)

  for (let i = 0; i < clusters.length; i++) {
    const cl = clusters[i]
    const a = Math.min((t - cl.t0) / 600, 1) // appear
    cl.rot += cl.speed * cl.dir

    if (cl.isCollapsed()) {
      drawStar(cl, t, a)
    } else {
      drawDots(cl, t, a)
    }
  }
  requestAnimationFrame(render)
}

function drawStar(cl, t, a) {
  const col = cl.mainColor()
  const b = 1 + 0.12 * Math.sin(t / 1500 + cl.phase)
  const sz = cl.size() * a * b
  const gw = cl.size() * 4 * a

  let g = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, gw)
  g.addColorStop(0, col + '30')
  g.addColorStop(0.5, col + '10')
  g.addColorStop(1, 'transparent')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cl.x, cl.y, gw, 0, Math.PI * 2)
  ctx.fill()

  g = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, sz)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.5, col)
  g.addColorStop(1, col + '40')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cl.x, cl.y, sz, 0, Math.PI * 2)
  ctx.fill()
}

function drawDots(cl, t, a) {
  const r = cl.radius()
  const scale = cl.isMain ? 2.2 : 1

  for (let i = 0; i < cl.dots.length; i++) {
    const d = cl.dots[i]
    const col = cl.commits[i].color
    const ang = d.angle + cl.rot
    const px = cl.x + Math.cos(ang) * r * d.rFactor
    const py = cl.y + Math.sin(ang) * r * d.rFactor
    const tw = (0.5 + 0.4 * Math.sin(t / 1500 + d.twinkle)) * a
    const sz = 3.5 * scale

    // TODO: move this out of the loop
    const hex2 = v => Math.round(v * 255).toString(16).padStart(2, '0')
    let g = ctx.createRadialGradient(px, py, 0, px, py, sz * 4)
    g.addColorStop(0, col + hex2(tw * 0.35))
    g.addColorStop(0.6, col + hex2(tw * 0.1))
    g.addColorStop(1, 'transparent')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, sz * 4, 0, Math.PI * 2)
    ctx.fill()

    g = ctx.createRadialGradient(px, py, 0, px, py, sz * 0.5)
    g.addColorStop(0, `rgba(255,255,255,${tw * 0.95})`)
    g.addColorStop(0.5, col + hex2(tw))
    g.addColorStop(1, col + hex2(tw * 0.2))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, sz * a, 0, Math.PI * 2)
    ctx.fill()
  }
}

const detailEl = document.getElementById('commit-detail')

// SPLIT A FAIRE CAR FONCTION TROP LONGUE
function showDetail(cl, x, y) {
  let html = ''
  if (cl.commits.length > 1)
    html += '<div class="cd-title">' + cl.commits.length + ' commits</div>'

  for (let i = cl.commits.length - 1; i >= 0; i--) {
    const c = cl.commits[i]
    html += `<div class="cd-entry">
      <div class="cd-mood"><span class="cd-dot" style="background:${c.color}"></span>
      <span class="cd-label" style="color:${c.color}">${c.mood}</span></div>
      <div class="cd-message">${c.message}</div>
      <div class="cd-meta"><span class="cd-time">${c.time}</span>
      <span class="cd-hash">${c.hash}</span></div></div>`
  }

  detailEl.innerHTML = html
  detailEl.style.maxHeight = Math.min(innerHeight - 40, 400) + 'px'
  detailEl.style.overflowY = 'auto'

  let left = x + 12, top = y - 20 // positionnement artisanal 
  if (left + 310 > innerWidth) left = x - 260
  if (left < 10) left = 10
  if (top + 200 > innerHeight) top = y - 200
  if (top < 16) top = 16

  detailEl.style.left = left + 'px'
  detailEl.style.top = top + 'px'
  detailEl.classList.add('visible')
}

function hideDetail() { detailEl.classList.remove('visible') }

canvas.addEventListener('click', e => {
  if (currentPhase !== 'phase-reveal') return

  let found = null
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i].hit(e.clientX, e.clientY)) { found = clusters[i]; break }
  }
  found ? showDetail(found, e.clientX, e.clientY) : hideDetail()
})

document.addEventListener('click', e => {
  if (!detailEl.contains(e.target) && e.target !== canvas) hideDetail()
})

function goTo(id) {
  currentPhase = id
  document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

const prompt = document.getElementById('invite-prompt')
let ci = 0
function type() {
  if (ci >= lang.invite.length) return
  prompt.insertBefore(document.createTextNode(lang.invite[ci]), prompt.querySelector('.cursor-blink'))
  ci++
  setTimeout(type, 40 + Math.random() * 30)
}
setTimeout(type, 800)

function startApp() {
  if (currentPhase !== 'phase-invite') return
  goTo('phase-mood')
}
prompt.addEventListener('click', startApp)
document.addEventListener('keydown', startApp)

document.getElementById('mood-question').textContent = lang.question
const moodsEl = document.getElementById('moods')

lang.moods.forEach(m => {
  const btn = document.createElement('button')
  btn.className = 'mood-pill'
  btn.style.setProperty('--c', m.color)
  btn.innerHTML = `<span class="dot"></span><span class="label">${m.label}</span>`
  btn.onclick = () => { chosenMood = m; setupInput() }
  moodsEl.appendChild(btn)
})

function setupInput() {
  document.getElementById('mood-chosen').innerHTML =
    `<span class="dot" style="background:${chosenMood.color}"></span>` +
    `<span class="name" style="color:${chosenMood.color}">${chosenMood.label}</span>`

  const input = document.getElementById('msg-input')
  const btn = document.getElementById('push-btn')
  const counter = document.getElementById('char-count')
  input.placeholder = lang.placeholder
  input.value = ''
  btn.style.background = chosenMood.color
  btn.classList.remove('ready')

  goTo('phase-message')
  setTimeout(() => input.focus(), 400)

  input.oninput = () => {
    const len = input.value.length
    btn.classList.toggle('ready', input.value.trim().length > 0)
    if (len > 50) {
      counter.textContent = len + '/72'
      counter.classList.add('visible')
      counter.classList.toggle('warn', len > 65)
    } else {
      counter.classList.remove('visible')
    }
  }
  input.onkeydown = e => { if (e.key === 'Enter' && input.value.trim()) push() }
  btn.onclick = () => { if (input.value.trim()) push() }
}

function push() {
  chosenMsg = document.getElementById('msg-input').value.trim()
  const now = new Date()

  commits.push({
    mood: chosenMood.label,
    color: chosenMood.color,
    message: chosenMsg,
    hash: hash7(),
    time: lang.today + ', ' + pad(now.getHours()) + 'h' + pad(now.getMinutes())
  })

  goTo('phase-push')
  const term = document.getElementById('terminal')
  term.innerHTML = ''

  lang.terminal.forEach((line, i) => {
    const el = document.createElement('div')
    el.className = 'terminal-line' + (i === lang.terminal.length - 1 ? ' muted' : '')
    el.textContent = line
    term.appendChild(el)
    setTimeout(() => el.classList.add('visible'), 300 * i + 200)
  })

  // 
  setTimeout(() => {
    goTo('phase-reveal')
    updateMain()
    if (!didFirstPush) {
      addGhosts()
      requestAnimationFrame(render)
      didFirstPush = true
    }
  }, 300 * lang.terminal.length + 800)
}

function updateMain() {
  const cx = innerWidth / 2, cy = innerHeight / 2 - 40

  if (mainCluster) {
    mainCluster.commits = commits
    mainCluster.dots = commits.map((c, i) => {
      const base = (Math.PI * 2 * i) / Math.max(commits.length, 1)
      return {
        angle: base + (hashCode(c.hash) % 628) / 1000,
        rFactor: 0.7 + (hashCode(c.hash + 'r') % 100) / 100 * 0.6,
        twinkle: Math.random() * Math.PI * 2
      }
    })
    mainCluster.t0 = performance.now()
  } else {
    mainCluster = new Cluster(cx, cy, commits, 0, true)
    clusters.unshift(mainCluster)
  }

  document.getElementById('reveal-text').textContent = lang.reveal
}

function ghostTime(days) {
  const h = 7 + Math.floor(Math.random() * 14)
  const m = Math.floor(Math.random() * 60)
  let label
  if (fr) label = days === 1 ? 'hier' : 'il y a ' + days + ' jours'
  else label = days === 1 ? 'yesterday' : days + ' days ago'
  return label + ', ' + pad(h) + 'h' + pad(m)
}

function addGhosts() {
  const cx = innerWidth / 2, cy = innerHeight / 2 - 40

  for (let i = 0; i < 12; i++) {
    const ang = Math.random() * Math.PI * 2
    const dist = 60 + Math.random() * 160
    const x = cx + Math.cos(ang) * dist
    const y = cy + Math.sin(ang) * dist * 0.7
    const days = 1 + Math.floor(Math.random() * 25)
    const n = 1 + Math.floor(Math.random() * 3)

    const gc = []
    for (let j = 0; j < n; j++) {
      const m = MOOD_COLORS[Math.floor(Math.random() * MOOD_COLORS.length)]
      gc.push({
        mood: m.label, color: m.color,
        message: ghostMessages[Math.floor(Math.random() * ghostMessages.length)],
        hash: hash7(), time: ghostTime(days)
      })
    }

    // stagger
    setTimeout(() => clusters.push(new Cluster(x, y, gc, days)), 200 + i * 80)
  }
}
