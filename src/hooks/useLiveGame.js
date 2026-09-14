import { useState, useEffect } from 'react'

// Maps ESPN abbreviations that differ from our schedule format
const ESPN_ABBR_MAP = {
  'GNB': 'GB', 'KAN': 'KC', 'NOR': 'NO', 'SFO': 'SF', 'TAM': 'TB',
  'NWE': 'NE', 'LVR': 'LV', 'LAR': 'LAR', 'LAC': 'LAC',
}

function normalizeAbbr(abbr) {
  if (!abbr) return ''
  const up = abbr.toUpperCase()
  return ESPN_ABBR_MAP[up] || up
}

// Module-level cache: key → { data, ts }
const cache = {}
const STALE_IN = 60_000    // 60s when in-progress
const STALE_PRE = 300_000  // 5 min when pre-game

function getDateRange(weekNum) {
  const WEEK1_START = new Date('2026-09-10T00:00:00Z')
  const weekStart = new Date(WEEK1_START.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000)
  const weekEnd = new Date(weekStart.getTime() + 8 * 24 * 60 * 60 * 1000)
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
  return `${fmt(weekStart)}-${fmt(weekEnd)}`
}

async function fetchWeekGames(weekNum) {
  const cacheKey = `week-${weekNum}`
  // Use week-level cache (shared across all games in same week)
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < STALE_IN) {
    return cache[cacheKey].data
  }
  try {
    const dates = getDateRange(weekNum)
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=20`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    cache[cacheKey] = { data: data.events || [], ts: Date.now() }
    return cache[cacheKey].data
  } catch {
    return null
  }
}

function findGameInEvents(events, gameField) {
  if (!events || !gameField) return null
  const parts = gameField.toUpperCase().split(/\s+(?:VS\.?|@|AT)\s+/)
  if (parts.length < 2) return null
  const [teamA, teamB] = parts.map(p => p.trim())

  for (const event of events) {
    const comp = event.competitions?.[0]
    if (!comp) continue
    const home = comp.competitors?.find(c => c.homeAway === 'home')
    const away = comp.competitors?.find(c => c.homeAway === 'away')
    if (!home || !away) continue

    const homeAbbr = normalizeAbbr(home.team.abbreviation)
    const awayAbbr = normalizeAbbr(away.team.abbreviation)

    if (
      (homeAbbr === teamA && awayAbbr === teamB) ||
      (homeAbbr === teamB && awayAbbr === teamA)
    ) {
      const state = comp.status?.type?.state || 'pre'
      const completed = comp.status?.type?.completed || false
      return {
        status: completed ? 'final' : state === 'in' ? 'in' : 'pre',
        period: comp.status?.period || null,
        clock: comp.status?.displayClock || null,
        homeScore: home.score != null ? parseInt(home.score) : null,
        awayScore: away.score != null ? parseInt(away.score) : null,
        homeAbbr: home.team.abbreviation?.toUpperCase(),
        awayAbbr: away.team.abbreviation?.toUpperCase(),
      }
    }
  }
  return null
}

// Shared: one ESPN fetch per week, all game hooks read from it
export function useLiveGame(gameField, weekNum) {
  const [gameData, setGameData] = useState(null)

  useEffect(() => {
    if (!gameField || !weekNum) return
    let cancelled = false

    async function poll() {
      // Invalidate week cache before polling when game is live
      const cacheKey = `week-${weekNum}`
      if (gameData?.status === 'in') {
        delete cache[cacheKey]
      }

      const events = await fetchWeekGames(weekNum)
      if (cancelled || !events) return

      const found = findGameInEvents(events, gameField)
      if (!cancelled && found) setGameData(found)
    }

    poll()

    // Adaptive polling: every 60s when live, every 5 min pre-game, stop when final
    const id = setInterval(() => {
      if (gameData?.status === 'final') return
      poll()
    }, gameData?.status === 'in' ? STALE_IN : STALE_PRE)

    return () => { cancelled = true; clearInterval(id) }
  }, [gameField, weekNum, gameData?.status])

  return gameData
}
