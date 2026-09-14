import { TEAM_ALIASES, getTeamFromPlayerProp } from './teamUtils.js'

// Normalize a team string to canonical full name
function normalizeTeam(raw) {
  if (!raw) return null
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9 ']/g, '')
  if (TEAM_ALIASES[key]) return TEAM_ALIASES[key]
  // Try last word (e.g. "Chiefs" → find via values)
  const lastWord = key.split(' ').pop()
  const match = Object.entries(TEAM_ALIASES).find(([k, v]) => k === lastWord || v.toUpperCase().split(' ').pop() === lastWord)
  return match ? match[1] : null
}

// Given an ESPN game object and a pick's game/lock fields,
// find the score of the team the pick was on and the opponent score.
// Returns { outcome: "KC 27, BUF 20", betScore, otherScore, betTeam, otherTeam } or null
export function matchPickToScore(espnGame, pickGame, pickLock) {
  if (!espnGame?.completed || !espnGame.home || !espnGame.away) return null

  const { home, away } = espnGame

  // Determine which team was bet on from the lock text
  // Simple: extract first token(s) before a number/spread
  const betTeamRaw = extractBetTeam(pickLock)
  if (!betTeamRaw) return null

  const betTeamNorm = normalizeTeam(betTeamRaw)
  const homeNorm = normalizeTeam(home.abbr) || normalizeTeam(home.name)
  const awayNorm = normalizeTeam(away.abbr) || normalizeTeam(away.name)

  let betSide = null
  if (betTeamNorm) {
    if (betTeamNorm === homeNorm) betSide = 'home'
    else if (betTeamNorm === awayNorm) betSide = 'away'
  }

  // Fallback: try matching last word of raw team vs abbr
  if (!betSide) {
    const raw = betTeamRaw.trim().toUpperCase()
    if (raw === home.abbr.toUpperCase() || home.name.toUpperCase().includes(raw) || home.name.toUpperCase().split(' ').pop() === raw) betSide = 'home'
    else if (raw === away.abbr.toUpperCase() || away.name.toUpperCase().includes(raw) || away.name.toUpperCase().split(' ').pop() === raw) betSide = 'away'
  }

  if (!betSide) return null

  const bet   = betSide === 'home' ? home : away
  const other = betSide === 'home' ? away  : home

  const outcome = `${bet.abbr} ${bet.score}, ${other.abbr} ${other.score}`
  return { outcome, betScore: bet.score, otherScore: other.score, betTeam: bet.name, otherTeam: other.name }
}

// Extract the team being bet on from a lock string
// "Chiefs -7" → "Chiefs", "KC ML" → "KC", "Over 44.5" → null
function extractBetTeam(lock) {
  if (!lock) return null
  let s = lock.trim().replace(/^(take|lock[:\s]*)\s*/i, '').trim()

  // Totals — no team
  if (/^(over|under|o|u)[\/\s]*\d/i.test(s)) return null

  // Remove trailing spread/odds/ML
  // "Chiefs -7.5" → "Chiefs", "KC ML" → "KC", "Bills +3" → "Bills"
  s = s.replace(/\s*(ML|[+-]\d+(?:\.\d+)?)$/i, '').trim()

  return s || null
}

// Match a pick's game field against a list of ESPN games
// pick.game is like "KC @ BUF" or "KC vs BUF"
export function findEspnGame(espnGames, pickGame) {
  if (!pickGame || !espnGames?.length) return null

  const parts = pickGame.toUpperCase().split(/\s*(?:@|VS\.?|\bAT\b|\/)\s*/)
  if (parts.length < 2) return null
  const [rawA, rawB] = parts.map(p => p.trim())

  const normA = normalizeTeam(rawA)
  const normB = normalizeTeam(rawB)

  for (const game of espnGames) {
    const homeNorm = normalizeTeam(game.home?.abbr) || normalizeTeam(game.home?.name)
    const awayNorm = normalizeTeam(game.away?.abbr) || normalizeTeam(game.away?.name)

    const teamsMatch = (
      (teamsEqual(normA || rawA, homeNorm || game.home?.abbr) && teamsEqual(normB || rawB, awayNorm || game.away?.abbr)) ||
      (teamsEqual(normA || rawA, awayNorm || game.away?.abbr) && teamsEqual(normB || rawB, homeNorm || game.home?.abbr))
    )
    if (teamsMatch) return game
  }
  return null
}

function teamsEqual(a, b) {
  if (!a || !b) return false
  const norm = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return norm(a) === norm(b)
}

// Find the ESPN game for a pick with no game field using player→team lookup,
// then falling back to extracting the team directly from the lock text (handles ML, spreads)
export function findGameForProp(espnGames, lockText) {
  if (!espnGames?.length || !lockText) return null

  // 1. Player prop lookup
  let team = getTeamFromPlayerProp(lockText)

  // 2. Team-from-lock fallback (ML picks like "Chiefs ML", spreads like "Chiefs -7")
  if (!team) {
    let s = lockText.trim().replace(/^(take|lock[:\s]*)\s*/i, '').trim()
    // Skip totals
    if (!/^(over|under|o|u)[\/\s]*\d/i.test(s)) {
      s = s.replace(/\s*(ML|[+-]\d+(?:\.\d+)?)$/i, '').trim()
      if (s) team = normalizeTeam(s)
    }
  }

  if (!team) return null
  const teamUpper = team.toUpperCase()
  for (const game of espnGames) {
    const homeNorm = normalizeTeam(game.home?.abbr) || normalizeTeam(game.home?.name)
    const awayNorm = normalizeTeam(game.away?.abbr) || normalizeTeam(game.away?.name)
    if ((homeNorm && homeNorm.toUpperCase() === teamUpper) ||
        (awayNorm && awayNorm.toUpperCase() === teamUpper) ||
        game.home?.name?.toUpperCase() === teamUpper ||
        game.away?.name?.toUpperCase() === teamUpper) {
      return game
    }
  }
  return null
}

// Build outcome string from ESPN game (winner score, loser score format)
export function buildOutcomeString(espnGame) {
  if (!espnGame?.completed || !espnGame.home || !espnGame.away) return null
  const { home, away } = espnGame
  if (home.score == null || away.score == null) return null
  // Winner first
  const winner = home.score >= away.score ? home : away
  const loser  = home.score >= away.score ? away : home
  return `${winner.abbr} ${winner.score}, ${loser.abbr} ${loser.score}`
}
