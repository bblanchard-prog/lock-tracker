// Pick outcome margin utilities — coverage margin for spreads and totals

import { TEAM_ALIASES } from './teamUtils.js'

/**
 * Normalize a raw team string to a canonical full team name using TEAM_ALIASES.
 * Returns null if no match found.
 */
function normalizeTeam(raw) {
  if (!raw) return null
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9 ']/g, '')
  return TEAM_ALIASES[key] || null
}

/**
 * Format a margin number: show one decimal place, but strip trailing ".0"
 * e.g. 2.5 → "2.5", 3.0 → "3", 0.5 → "0.5"
 */
export function formatMargin(margin) {
  const abs = Math.abs(margin)
  const str = abs.toFixed(1)
  return str.endsWith('.0') ? str.slice(0, -2) : str
}

/**
 * parsePickLine(lock) → { type, ... } or null
 *
 * Parses a lock text string to determine what kind of bet it is.
 *
 * Spread:  "Falcons -2.5", "KC -7", "Bills +3", "PHI -3.5"
 *   → { type: 'spread', teamRaw: 'Falcons', spread: -2.5 }
 *
 * Total:   "Over 44.5", "Under 48", "O44.5", "U48", "o/44.5"
 *   → { type: 'total', direction: 'over' | 'under', line: 44.5 }
 *
 * Anything else → null
 */
export function parsePickLine(lock) {
  if (!lock) return null

  // Strip leading fluff like "Take ", "Lock: ", "Lock ", etc.
  let s = lock.trim().replace(/^(take|lock[:\s]*)\s*/i, '').trim()

  // --- Total detection first (before spread, to avoid "O" being a team token) ---
  // Matches: "Over 44.5", "Under 48", "O 44.5", "U48", "O/44.5", "U/48"
  const totalMatch = s.match(/^(over|under|o|u)[\/\s]*(\d+(?:\.\d+)?)/i)
  if (totalMatch) {
    const dir = totalMatch[1].toLowerCase()
    return {
      type: 'total',
      direction: dir === 'over' || dir === 'o' ? 'over' : 'under',
      line: parseFloat(totalMatch[2]),
    }
  }

  // --- Spread detection ---
  // Must end with a +/- number (the spread), optionally preceded by spaces
  // e.g. "Falcons -2.5", "KC -7", "Bills +3", "KC-7" (no space), "PHI -3.5"
  const spreadMatch = s.match(/^(.+?)\s*([+\-]\d+(?:\.\d+)?)\s*$/)
  if (spreadMatch) {
    const teamRaw = spreadMatch[1].trim()
    const spread  = parseFloat(spreadMatch[2])
    // Sanity check: teamRaw shouldn't be empty and spread should be a real number
    if (teamRaw && !isNaN(spread) && isFinite(spread)) {
      // Reject if teamRaw looks like another number (e.g. "52 48" shouldn't match)
      if (/^\d+$/.test(teamRaw)) return null
      return { type: 'spread', teamRaw, spread }
    }
  }

  // ML: team name with optional " ML" suffix, no spread/total syntax
  const mlMatch = s.match(/^(.+?)(?:\s+ml)?\s*$/i)
  if (mlMatch) {
    const teamRaw = mlMatch[1].trim()
    if (teamRaw && !/^\d/.test(teamRaw) && teamRaw.length > 1) {
      return { type: 'ml', teamRaw }
    }
  }

  return null
}

/**
 * parseOutcomeScores(outcome) → [{teamRaw, score}, ...] (length 2) or null
 *
 * Handles multiple formats:
 *   "ATL 27, NO 24"     → [{teamRaw:'ATL', score:27}, {teamRaw:'NO', score:24}]
 *   "KC 27 BUF 20"      → [{teamRaw:'KC', score:27}, {teamRaw:'BUF', score:20}]
 *   "Packers 31 Bears 17" → [{teamRaw:'Packers', score:31}, {teamRaw:'Bears', score:17}]
 *   "52-48" or "52 48"  → [{score:52}, {score:48}] (no teamRaw)
 *
 * Returns null if the outcome can't be parsed into exactly two scores.
 */
export function parseOutcomeScores(outcome) {
  if (!outcome || typeof outcome !== 'string') return null
  const s = outcome.trim()

  // Score-only formats: "52-48", "52 48"
  const scoreOnlyDash = s.match(/^(\d+)\s*[-–]\s*(\d+)$/)
  if (scoreOnlyDash) {
    return [{ score: parseInt(scoreOnlyDash[1], 10) }, { score: parseInt(scoreOnlyDash[2], 10) }]
  }

  const scoreOnlySpace = s.match(/^(\d+)\s+(\d+)$/)
  if (scoreOnlySpace) {
    return [{ score: parseInt(scoreOnlySpace[1], 10) }, { score: parseInt(scoreOnlySpace[2], 10) }]
  }

  // Team+score formats. Strategy: find all occurrences of a word/abbrev followed by a number.
  // We tokenize on word boundaries and look for (word+, score) pairs.
  // Normalize commas out so "ATL 27, NO 24" becomes "ATL 27 NO 24"
  const cleaned = s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()

  // Match pattern: one or more word tokens, then a score, repeating
  // e.g. ["ATL", "27", "NO", "24"] or ["Kansas", "City", "27", "Buffalo", "20"]
  // We'll use a greedy regex that pulls out (non-digit text)(digit) pairs
  const pairs = []
  // Split into tokens
  const tokens = cleaned.split(/\s+/)
  let i = 0
  while (i < tokens.length) {
    // Gather word tokens until we hit a pure number
    const wordTokens = []
    while (i < tokens.length && !/^\d+$/.test(tokens[i])) {
      wordTokens.push(tokens[i])
      i++
    }
    // Now tokens[i] should be a score number
    if (i < tokens.length && /^\d+$/.test(tokens[i])) {
      const scoreVal = parseInt(tokens[i], 10)
      i++
      if (wordTokens.length > 0) {
        pairs.push({ teamRaw: wordTokens.join(' '), score: scoreVal })
      } else {
        // Number with no preceding team — skip or treat as score-only
        pairs.push({ score: scoreVal })
      }
    } else {
      // Trailing word tokens with no score — ignore
      break
    }
  }

  if (pairs.length === 2) return pairs
  return null
}

/**
 * computeCoverageMargin(pick) → { margin, type, ... } or null
 *
 * Given a pick object { lock, outcome, game }, parses both the lock and the
 * outcome and computes the coverage margin:
 *
 * For spreads:
 *   coverageMargin = (betTeamScore - otherTeamScore) - spread
 *   Positive = covered, Negative = missed
 *
 * For totals:
 *   over:  margin = actualTotal - line   (positive = over hit)
 *   under: margin = line - actualTotal   (positive = under hit)
 *
 * Returns null if either side can't be parsed or teams can't be matched.
 */
function teamMatches(scoreEntry, lockRaw, lockNorm) {
  const outRaw = scoreEntry.teamRaw
  if (!outRaw) return false
  const outNorm = normalizeTeam(outRaw)
  if (lockNorm && outNorm && lockNorm === outNorm) return true
  if (lockNorm) {
    const lastWord = lockNorm.split(' ').pop().toUpperCase()
    if (outRaw.toUpperCase() === lastWord) return true
  }
  if (outNorm) {
    const lastWord = outNorm.split(' ').pop().toUpperCase()
    if (lockRaw.trim().toUpperCase() === lastWord) return true
  }
  if (outRaw.trim().toUpperCase() === lockRaw.trim().toUpperCase()) return true
  const lockLastWord = lockRaw.trim().toUpperCase().split(/\s+/).pop()
  const outLastWord  = outRaw.trim().toUpperCase().split(/\s+/).pop()
  if (lockLastWord === outLastWord && lockLastWord.length > 1) return true
  return false
}

export function computeCoverageMargin(pick) {
  if (!pick) return null
  const { lock, outcome } = pick

  const parsedLock = parsePickLine(lock)
  if (!parsedLock) return null

  // --- Totals ---
  if (parsedLock.type === 'total') {
    const scores = parseOutcomeScores(outcome)
    if (!scores) return null
    const actualTotal = scores[0].score + scores[1].score
    const { direction, line } = parsedLock
    const margin = direction === 'over' ? actualTotal - line : line - actualTotal
    return { margin, type: 'total', direction, line, actual: actualTotal }
  }

  // --- Spreads & ML ---
  if (parsedLock.type === 'spread' || parsedLock.type === 'ml') {
    const scores = parseOutcomeScores(outcome)
    if (!scores) return null

    const { teamRaw: lockTeamRaw } = parsedLock
    const lockTeamNorm = normalizeTeam(lockTeamRaw)

    let betIdx = -1
    for (let i = 0; i < scores.length; i++) {
      if (teamMatches(scores[i], lockTeamRaw, lockTeamNorm)) { betIdx = i; break }
    }
    if (betIdx === -1) return null

    const otherIdx = betIdx === 0 ? 1 : 0
    const betTeamScore   = scores[betIdx].score
    const otherTeamScore = scores[otherIdx].score

    if (parsedLock.type === 'ml') {
      const margin = betTeamScore - otherTeamScore
      return { margin, type: 'ml', teamRaw: lockTeamRaw, betScore: betTeamScore, otherScore: otherTeamScore }
    }

    // Covered when: betScore + spread > otherScore  →  (betScore - otherScore) + spread > 0
    const margin = (betTeamScore - otherTeamScore) + parsedLock.spread
    return {
      margin,
      type: 'spread',
      teamRaw: lockTeamRaw,
      spread: parsedLock.spread,
      betScore: betTeamScore,
      otherScore: otherTeamScore,
    }
  }

  return null
}
