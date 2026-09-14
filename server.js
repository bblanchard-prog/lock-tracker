import express from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_FILE = join(__dirname, 'picks.json')
const OVERRIDES_FILE = join(__dirname, 'overrides.json')
const PORT = 3001

const app = express()
app.use(express.json())

// CORS for Vite dev server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

function readDB() {
  if (!existsSync(DB_FILE)) return { weeks: {} }
  try { return JSON.parse(readFileSync(DB_FILE, 'utf8')) }
  catch { return { weeks: {} } }
}

function writeDB(data) {
  writeFileSync(DB_FILE, JSON.stringify(data, null, 2))
}

// Get current week key: "2025-W34"
function currentWeekKey() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`
}

// GET /api/picks?week=2025-W34  (defaults to current week)
app.get('/api/picks', (req, res) => {
  const week = req.query.week || currentWeekKey()
  const db = readDB()
  res.json({ week, picks: db.weeks[week] || [] })
})

// POST /api/picks  { week?, player, sport, game, lock, odds }
app.post('/api/picks', (req, res) => {
  const { player, sport, game, lock, odds } = req.body
  const week = req.body.week || currentWeekKey()

  if (!player || !lock) {
    return res.status(400).json({ error: 'player and lock are required' })
  }

  const db = readDB()
  if (!db.weeks[week]) db.weeks[week] = []

  // Replace existing pick by same player this week
  db.weeks[week] = db.weeks[week].filter(
    p => p.player.trim().toUpperCase() !== player.trim().toUpperCase()
  )

  db.weeks[week].push({
    player: player.trim().toUpperCase(),
    sport: sport || 'NFL',
    game: game || '',
    lock,
    odds: odds ? Number(odds) : null,
    submittedAt: new Date().toISOString(),
  })

  writeDB(db)
  res.json({ ok: true, week, picks: db.weeks[week] })
})

// DELETE /api/picks/:week/:player
app.delete('/api/picks/:week/:player', (req, res) => {
  const { week, player } = req.params
  const db = readDB()
  if (db.weeks[week]) {
    db.weeks[week] = db.weeks[week].filter(
      p => p.player.trim().toUpperCase() !== player.trim().toUpperCase()
    )
  }
  writeDB(db)
  res.json({ ok: true })
})

// GET /api/week  — what's the current week key
app.get('/api/week', (_req, res) => res.json({ week: currentWeekKey() }))

// ── Historical pick overrides ───────────────────────────────────────────────
// Keyed as { "<year>-<weekNum>-<PLAYER>": { game, lock, odds, result, sport } }

function readOverrides() {
  if (!existsSync(OVERRIDES_FILE)) return {}
  try { return JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8')) }
  catch { return {} }
}
function writeOverrides(data) {
  writeFileSync(OVERRIDES_FILE, JSON.stringify(data, null, 2))
}

// GET /api/overrides
app.get('/api/overrides', (_req, res) => res.json(readOverrides()))

// PUT /api/overrides/:year/:week/:player  — upsert one pick override
app.put('/api/overrides/:year/:week/:player', (req, res) => {
  const { year, week, player } = req.params
  const key = `${year}-${week}-${player.trim().toUpperCase()}`
  const overrides = readOverrides()
  overrides[key] = { ...req.body }
  writeOverrides(overrides)
  res.json({ ok: true, key })
})

// DELETE /api/overrides/:year/:week/:player  — remove override (revert to data.js)
app.delete('/api/overrides/:year/:week/:player', (req, res) => {
  const { year, week, player } = req.params
  const key = `${year}-${week}-${player.trim().toUpperCase()}`
  const overrides = readOverrides()
  delete overrides[key]
  writeOverrides(overrides)
  res.json({ ok: true })
})

// ── NFL Schedule helpers ────────────────────────────────────────────────────

function scheduleCacheFile(week) {
  return join(__dirname, `schedule-cache-${String(week).padStart(2, '0')}.json`)
}

function readScheduleCache(week) {
  const file = scheduleCacheFile(week)
  if (!existsSync(file)) return null
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    const age = Date.now() - new Date(data.fetchedAt).getTime()
    if (age < 24 * 60 * 60 * 1000) return data
    return null          // stale
  } catch {
    return null
  }
}

function readScheduleCacheForce(week) {
  const file = scheduleCacheFile(week)
  if (!existsSync(file)) return null
  try { return JSON.parse(readFileSync(file, 'utf8')) }
  catch { return null }
}

function writeScheduleCache(week, games) {
  const payload = { fetchedAt: new Date().toISOString(), games }
  writeFileSync(scheduleCacheFile(week), JSON.stringify(payload, null, 2))
}

function classifySlot(date) {
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const dayName = etParts.find(p => p.type === 'weekday')?.value ?? ''
  const hourET = parseInt(etParts.find(p => p.type === 'hour')?.value ?? '0', 10)

  if (dayName === 'Thursday') return 'TNF'
  if (dayName === 'Monday')   return 'MNF'
  if (dayName === 'Saturday') return 'Saturday'
  if (dayName === 'Sunday') {
    if (hourET >= 20) return 'SNF'
    if (hourET >= 15) return 'Sunday Late'
    return 'Sunday Early'
  }
  // Wednesday / Friday / Tuesday etc — just return the actual day name
  return dayName
}

function formatTimeET(date) {
  // Returns "8:15 PM ET" style string
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET'
}

function formatTimeCT(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' CT'
}

function formatDay(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
  })
}

function transformEvents(events) {
  const games = events
    .map(event => {
      const date = new Date(event.date)
      const competitors = (event.competitions?.[0]?.competitors ?? [])
      const away = competitors.find(c => c.homeAway === 'away')?.team?.abbreviation ?? ''
      const home = competitors.find(c => c.homeAway === 'home')?.team?.abbreviation ?? ''
      const label = away && home ? `${away} vs ${home}` : event.shortName ?? event.name ?? ''

      return {
        label,
        day: formatDay(date),
        timeET: formatTimeET(date),
        timeCT: formatTimeCT(date),
        slot: classifySlot(date),
        _sortKey: date.getTime(),
      }
    })
    .sort((a, b) => a._sortKey - b._sortKey)
    .map(({ _sortKey, ...rest }) => rest)    // strip internal sort key

  return games
}

// GET /api/schedule/:week
app.get('/api/schedule/:week', async (req, res) => {
  const weekNum = parseInt(req.params.week, 10)
  if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 18) {
    return res.status(400).json({ error: 'week must be 1–18' })
  }

  // Return fresh cache if available
  const cached = readScheduleCache(weekNum)
  if (cached) return res.json({ week: weekNum, games: cached.games })

  // Fetch from ESPN
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${weekNum}&dates=2026`
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`ESPN responded ${response.status}`)
    const json = await response.json()
    const games = transformEvents(json.events ?? [])
    writeScheduleCache(weekNum, games)
    return res.json({ week: weekNum, games })
  } catch (err) {
    console.error('ESPN fetch error:', err.message)
    // Fall back to any existing (possibly stale) cache
    const stale = readScheduleCacheForce(weekNum)
    if (stale) return res.json({ week: weekNum, games: stale.games, stale: true })
    return res.status(404).json({ error: 'schedule unavailable' })
  }
})

app.listen(PORT, () => {
  console.log(`Lock Tracker API running on http://localhost:${PORT}`)
})
