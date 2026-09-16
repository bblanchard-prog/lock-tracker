import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function cacheFile(week) {
  return join(tmpdir(), `lock-schedule-${String(week).padStart(2, '0')}.json`)
}

function classifySlot(date) {
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', hour12: false,
  }).formatToParts(date)
  const day = etParts.find(p => p.type === 'weekday')?.value ?? ''
  const hour = parseInt(etParts.find(p => p.type === 'hour')?.value ?? '0', 10)
  if (day === 'Thursday') return 'TNF'
  if (day === 'Monday') return 'MNF'
  if (day === 'Saturday') return 'Saturday'
  if (day === 'Sunday') {
    if (hour >= 20) return 'SNF'
    if (hour >= 15) return 'Sunday Late'
    return 'Sunday Early'
  }
  return day
}

function fmtET(date) {
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }) + ' ET'
}
function fmtCT(date) {
  return date.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true }) + ' CT'
}
function fmtDay(date) {
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const weekNum = parseInt(req.query.week, 10)
  if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 18) {
    return res.status(400).json({ error: 'week must be 1–18' })
  }

  // Try cache
  const cf = cacheFile(weekNum)
  if (existsSync(cf)) {
    try {
      const cached = JSON.parse(readFileSync(cf, 'utf8'))
      const age = Date.now() - new Date(cached.fetchedAt).getTime()
      if (age < 24 * 60 * 60 * 1000) return res.json({ week: weekNum, games: cached.games })
    } catch {}
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${weekNum}&dates=2026`
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`ESPN ${resp.status}`)
    const json = await resp.json()
    const games = (json.events ?? [])
      .map(ev => {
        const date = new Date(ev.date)
        const comps = ev.competitions?.[0]?.competitors ?? []
        const away = comps.find(c => c.homeAway === 'away')?.team?.abbreviation ?? ''
        const home = comps.find(c => c.homeAway === 'home')?.team?.abbreviation ?? ''
        return {
          label: away && home ? `${away} vs ${home}` : ev.shortName ?? ev.name ?? '',
          day: fmtDay(date),
          timeET: fmtET(date),
          timeCT: fmtCT(date),
          slot: classifySlot(date),
          _sort: date.getTime(),
        }
      })
      .sort((a, b) => a._sort - b._sort)
      .map(({ _sort, ...g }) => ({ ...g, ts: _sort }))

    try { writeFileSync(cf, JSON.stringify({ fetchedAt: new Date().toISOString(), games })) } catch {}
    return res.json({ week: weekNum, games })
  } catch (err) {
    if (existsSync(cf)) {
      try { return res.json({ ...JSON.parse(readFileSync(cf, 'utf8')), stale: true }) } catch {}
    }
    return res.status(404).json({ error: 'schedule unavailable' })
  }
}
