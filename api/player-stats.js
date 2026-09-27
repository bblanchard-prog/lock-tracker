// GET /api/player-stats?year=2024&week=5&lock=Santos+O+1.5+PATs
// Returns player stat + game score for prop picks

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SEASON_OPENERS, PLAYER_TEAM, parsePropIntent } from './_constants.js'

function cacheFile(key) {
  const safe = key.replace(/[^a-z0-9-]/gi, '_')
  return join(tmpdir(), `lock-ps-${safe}.json`)
}

function readFileCache(key) {
  try {
    const f = cacheFile(key)
    if (!existsSync(f)) return undefined
    return JSON.parse(readFileSync(f, 'utf8'))
  } catch { return undefined }
}

function writeFileCache(key, value) {
  try { writeFileSync(cacheFile(key), JSON.stringify(value)) } catch {}
}


function getTeamFromPlayerProp(lock) {
  if (!lock) return null
  const normalize = s => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '')
  const upper = normalize(lock)
  for (const [fragment, team] of Object.entries(PLAYER_TEAM)) {
    if (upper.includes(normalize(fragment.trim()))) return team
  }
  return null
}

const cache = {}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { year, week, lock, game } = req.query
  if (!year || !week || !lock) return res.status(200).json(null)

  const cacheKey = `${year}-${week}-${lock}-${game || ''}`
  if (cache[cacheKey] !== undefined) return res.status(200).json(cache[cacheKey])
  const fileCached = readFileCache(cacheKey)
  if (fileCached !== undefined) {
    cache[cacheKey] = fileCached
    return res.status(200).json(fileCached)
  }

  try {
    const intent = parsePropIntent(lock)
    if (!intent) return res.status(200).json(null)

    // Parse team abbrs from the pick's game field (e.g. "NYJ VS TEN" → ["NYJ", "TEN"])
    // This is the primary lookup — no team map needed, immune to player team changes
    function parseGameAbbrs(g) {
      if (!g) return null
      const parts = g.toUpperCase().trim().split(/\s+(?:VS\.?|@|AT)\s+/)
      if (parts.length !== 2) return null
      return [parts[0].trim(), parts[1].trim()]
    }
    const gameAbbrs = parseGameAbbrs(game)

    // Fallback: use PLAYER_TEAM map only when no game param provided
    if (!gameAbbrs) {
      const team = getTeamFromPlayerProp(lock)
      if (!team) return res.status(200).json(null)
    }

    if (!SEASON_OPENERS[parseInt(year)]) return res.status(200).json(null)

    const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${parseInt(week)}&year=${parseInt(year)}&limit=20`
    const sbRes = await fetch(sbUrl)
    if (!sbRes.ok) return res.status(200).json(null)
    const sbData = await sbRes.json()

    const teamUpper = gameAbbrs ? null : getTeamFromPlayerProp(lock)?.toUpperCase()
    let gameId = null, gameShortName = null
    let homeScore = null, awayScore = null, homeAbbr = null, awayAbbr = null
    let statusState = 'pre', period = null, clock = null

    for (const event of (sbData.events || [])) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const home = comp.competitors?.find(c => c.homeAway === 'home')
      const away = comp.competitors?.find(c => c.homeAway === 'away')
      if (!home || !away) continue
      const hA = home.team.abbreviation
      const aA = away.team.abbreviation
      const matched = gameAbbrs
        ? (gameAbbrs.includes(hA) && gameAbbrs.includes(aA))
        : (() => {
            const homeFullName = `${home.team.location} ${home.team.name}`.toUpperCase()
            const awayFullName = `${away.team.location} ${away.team.name}`.toUpperCase()
            const homeDisp = home.team.displayName?.toUpperCase() || homeFullName
            const awayDisp = away.team.displayName?.toUpperCase() || awayFullName
            return homeDisp === teamUpper || awayDisp === teamUpper ||
                   homeFullName === teamUpper || awayFullName === teamUpper
          })()
      if (matched) {
        gameId = event.id
        gameShortName = event.shortName
        homeScore = home.score != null ? parseInt(home.score) : null
        awayScore = away.score != null ? parseInt(away.score) : null
        homeAbbr = hA
        awayAbbr = aA
        statusState = comp.status?.type?.state || 'pre'
        period = comp.status?.period || null
        clock = comp.status?.displayClock || null
        break
      }
    }

    if (!gameId) {
      return res.status(200).json(null)
    }

    const bsUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`
    const bsRes = await fetch(bsUrl)
    if (!bsRes.ok) {
      const partial = { gameShortName, homeScore, awayScore, homeAbbr, awayAbbr, playerName: null, actual: null, label: intent.label, gameStatus: statusState, period, clock }
      cache[cacheKey] = partial
      return res.status(200).json(partial)
    }
    const bsData = await bsRes.json()

    const SHORT_TO_FULL = {
      'JAMO': 'Jameson Williams', 'CMC': 'Christian McCaffrey',
      'MARV': 'Marvin Harrison', 'SWIFT': "D'Andre Swift",
      'KAMARA': 'Alvin Kamara', 'PACHECO': 'Isiah Pacheco',
      'POLLARD': 'Tony Pollard', 'JEUDY': 'Jerry Jeudy',
    }
    const { playerFrag, category, label } = intent
    const playerGroups = bsData.boxscore?.players || []
    const normalize = s => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '')
    const lookupLabel = label === 'ATT' ? 'C/ATT' : label

    const findOneStat = (frag) => {
      const searchName = SHORT_TO_FULL[frag.toUpperCase()] || frag
      for (const group of playerGroups) {
        for (const statGroup of (group.statistics || [])) {
          if (statGroup.name?.toLowerCase() !== category) continue
          const labelIdx = (statGroup.labels || []).indexOf(lookupLabel)
          if (labelIdx === -1) continue
          for (const entry of (statGroup.athletes || [])) {
            const dispName = entry.athlete?.displayName || ''
            if (normalize(dispName).includes(normalize(searchName))) {
              const raw = entry.stats?.[labelIdx] ?? null
              let val = raw
              if (raw !== null && label === 'ATT') {
                val = typeof raw === 'string' && raw.includes('/') ? raw.split('/')[1] : raw
              }
              return { playerName: dispName, actual: val }
            }
          }
        }
      }
      return { playerName: null, actual: null }
    }

    let playerName = null, actual = null

    // Combined prop: "Player A vs Player B u77.5 Rec Yds"
    const combinedFrags = playerFrag.split(/\s+(?:vs\.?|and|\+)\s+/i).map(s => s.trim()).filter(s => s.length > 1)
    if (combinedFrags.length === 2) {
      const [r1, r2] = combinedFrags.map(findOneStat)
      const names = [r1, r2].filter(r => r.playerName).map(r => r.playerName)
      if (names.length > 0) {
        playerName = names.join(' + ')
        if (r1.actual !== null && r2.actual !== null) {
          actual = String((parseFloat(r1.actual) || 0) + (parseFloat(r2.actual) || 0))
        }
      }
    } else {
      const found = findOneStat(playerFrag)
      playerName = found.playerName
      actual = found.actual
    }

    const result = { playerName, actual, label: intent.label, ou: intent.ou, line: intent.line, gameShortName, homeScore, awayScore, homeAbbr, awayAbbr, gameStatus: statusState, period, clock }
    if (result.playerName !== null) {
      cache[cacheKey] = result
      if (statusState === 'post') writeFileCache(cacheKey, result)
    }
    // Don't cache at the CDN edge when playerName is unresolved — forces fresh fetch next time
    const maxAge = result.playerName === null ? 0 : statusState === 'post' ? 86400 : 60
    res.setHeader('Cache-Control', maxAge === 0 ? 'no-store' : `s-maxage=${maxAge}`)
    res.status(200).json(result)
  } catch (e) {
    res.status(200).json(null)
  }
}
