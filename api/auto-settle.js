import webpush from 'web-push'
import { supabase } from './_supabase.js'
import { parsePropIntent as parsePropIntentShared, PLAYER_TEAM as SHARED_PLAYER_TEAM, CURRENT_SEASON, SEASON_OPENERS } from './_constants.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

function getCurrentWeekKey() {
  const opener = SEASON_OPENERS[CURRENT_SEASON]
  const WEEK1_START = new Date(`${opener}T00:00:00Z`)
  const daysSince = (Date.now() - WEEK1_START.getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince < 0) return `${CURRENT_SEASON}-NFL-W01`
  // +2 day offset: advances to next week on Tuesday after games end
  const weekNum = Math.min(18, Math.floor((daysSince + 2) / 7) + 1)
  return `${CURRENT_SEASON}-NFL-W${String(weekNum).padStart(2, '0')}`
}

const TEAM_ALIASES = {
  ARI:'Arizona Cardinals',ATL:'Atlanta Falcons',BAL:'Baltimore Ravens',BUF:'Buffalo Bills',
  CAR:'Carolina Panthers',CHI:'Chicago Bears',CIN:'Cincinnati Bengals',CLE:'Cleveland Browns',
  DAL:'Dallas Cowboys',DEN:'Denver Broncos',DET:'Detroit Lions',GB:'Green Bay Packers',
  HOU:'Houston Texans',IND:'Indianapolis Colts',JAX:'Jacksonville Jaguars',KC:'Kansas City Chiefs',
  LAC:'Los Angeles Chargers',LAR:'Los Angeles Rams',LV:'Las Vegas Raiders',MIA:'Miami Dolphins',
  MIN:'Minnesota Vikings',NE:'New England Patriots',NO:'New Orleans Saints',NYG:'New York Giants',
  NYJ:'New York Jets',PHI:'Philadelphia Eagles',PIT:'Pittsburgh Steelers',SEA:'Seattle Seahawks',
  SF:'San Francisco 49ers',TB:'Tampa Bay Buccaneers',TEN:'Tennessee Titans',WAS:'Washington Commanders',
  BEARS:'Chicago Bears',CHIEFS:'Kansas City Chiefs',BILLS:'Buffalo Bills',RAVENS:'Baltimore Ravens',
  EAGLES:'Philadelphia Eagles',COWBOYS:'Dallas Cowboys',PACKERS:'Green Bay Packers',LIONS:'Detroit Lions',
  VIKINGS:'Minnesota Vikings',SAINTS:'New Orleans Saints',FALCONS:'Atlanta Falcons',BUCS:'Tampa Bay Buccaneers',
  BUCCANEERS:'Tampa Bay Buccaneers',CHARGERS:'Los Angeles Chargers',RAMS:'Los Angeles Rams',
  RAIDERS:'Las Vegas Raiders',BRONCOS:'Denver Broncos',SEAHAWKS:'Seattle Seahawks',
  CARDINALS:'Arizona Cardinals',PANTHERS:'Carolina Panthers',BROWNS:'Cleveland Browns',
  BENGALS:'Cincinnati Bengals',STEELERS:'Pittsburgh Steelers',TEXANS:'Houston Texans',
  COLTS:'Indianapolis Colts',JAGUARS:'Jacksonville Jaguars',DOLPHINS:'Miami Dolphins',
  PATRIOTS:'New England Patriots',GIANTS:'New York Giants',JETS:'New York Jets',
  TITANS:'Tennessee Titans',COMMANDERS:'Washington Commanders',
  PATS:'New England Patriots',CARDS:'Arizona Cardinals',
}

function normalizeTeam(raw) {
  if (!raw) return null
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9 ']/g, '')
  return TEAM_ALIASES[key] || null
}

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
  const outLastWord = outRaw.trim().toUpperCase().split(/\s+/).pop()
  if (lockLastWord === outLastWord && lockLastWord.length > 1) return true
  return false
}

function parsePickLine(lock) {
  if (!lock) return null
  let s = lock.trim().replace(/^(take|lock[:\s]*)\s*/i, '').trim()
  const totalMatch = s.match(/^(over|under|o|u)[\/\s]*(\d+(?:\.\d+)?)/i)
  if (totalMatch) {
    const dir = totalMatch[1].toLowerCase()
    return { type: 'total', direction: dir === 'over' || dir === 'o' ? 'over' : 'under', line: parseFloat(totalMatch[2]) }
  }
  const spreadMatch = s.match(/^(.+?)\s*([+\-]\d+(?:\.\d+)?)\s*$/)
  if (spreadMatch) {
    const teamRaw = spreadMatch[1].trim()
    const spread = parseFloat(spreadMatch[2])
    if (teamRaw && !isNaN(spread) && !/^\d+$/.test(teamRaw)) return { type: 'spread', teamRaw, spread }
  }
  const mlMatch = s.match(/^(.+?)(?:\s+ml)?\s*$/i)
  if (mlMatch) {
    const teamRaw = mlMatch[1].trim()
    if (teamRaw && !/^\d/.test(teamRaw) && teamRaw.length > 1) return { type: 'ml', teamRaw }
  }
  return null
}

function computeResult(lock, homeAbbr, awayAbbr, homeScore, awayScore) {
  const parsedLock = parsePickLine(lock)
  if (!parsedLock) return null

  if (parsedLock.type === 'total') {
    const total = homeScore + awayScore
    const { direction, line } = parsedLock
    const margin = direction === 'over' ? total - line : line - total
    return margin > 0 ? 'W' : margin < 0 ? 'L' : 'P'
  }

  if (parsedLock.type === 'spread' || parsedLock.type === 'ml') {
    const { teamRaw } = parsedLock
    const teamNorm = normalizeTeam(teamRaw)
    const scores = [
      { teamRaw: homeAbbr, score: homeScore },
      { teamRaw: awayAbbr, score: awayScore },
    ]
    let betIdx = -1
    for (let i = 0; i < scores.length; i++) {
      if (teamMatches(scores[i], teamRaw, teamNorm)) { betIdx = i; break }
    }
    if (betIdx === -1) return null
    const otherIdx = betIdx === 0 ? 1 : 0
    const betScore = scores[betIdx].score
    const otherScore = scores[otherIdx].score

    if (parsedLock.type === 'ml') {
      return betScore > otherScore ? 'W' : betScore < otherScore ? 'L' : 'P'
    }
    const margin = (betScore - otherScore) + parsedLock.spread
    return margin > 0 ? 'W' : margin < 0 ? 'L' : 'P'
  }
  return null
}

const parsePropIntent = parsePropIntentShared

const PLAYER_TEAM = SHARED_PLAYER_TEAM

function getTeamFromPlayerProp(lock) {
  if (!lock) return null
  const normalize = s => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '')
  const upper = normalize(lock)
  for (const [fragment, team] of Object.entries(PLAYER_TEAM)) {
    if (upper.includes(normalize(fragment.trim()))) return team
  }
  return null
}

const SHORT_TO_FULL = {
  'JAMO': 'Jameson Williams', 'CMC': 'Christian McCaffrey',
  'MARV': 'Marvin Harrison', 'SWIFT': "D'Andre Swift",
  'KAMARA': 'Alvin Kamara', 'PACHECO': 'Isiah Pacheco',
  'POLLARD': 'Tony Pollard', 'JEUDY': 'Jerry Jeudy',
}

async function getPropResult(gameId, intent) {
  const { playerFrag, category, label, ou, line } = intent
  const searchFrag = SHORT_TO_FULL[playerFrag.toUpperCase()] || playerFrag

  const bsRes = await fetchWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`)
  if (!bsRes.ok) return null
  const bsData = await bsRes.json()

  const playerGroups = bsData.boxscore?.players || []
  let actual = null
  outer: for (const group of playerGroups) {
    for (const statGroup of (group.statistics || [])) {
      if (statGroup.name?.toLowerCase() !== category) continue
      const lookupLabel = label === 'ATT' ? 'C/ATT' : label
      const labelIdx = (statGroup.labels || []).indexOf(lookupLabel)
      if (labelIdx === -1) continue
      for (const entry of (statGroup.athletes || [])) {
        const dispName = entry.athlete?.displayName || ''
        if (dispName.toUpperCase().includes(searchFrag.toUpperCase())) {
          const raw = entry.stats?.[labelIdx] ?? null
          if (raw !== null && label === 'ATT') {
            actual = typeof raw === 'string' && raw.includes('/') ? raw.split('/')[1] : raw
          } else {
            actual = raw
          }
          break outer
        }
      }
    }
  }

  if (actual === null) return null
  const val = parseFloat(actual)
  if (isNaN(val)) return null
  if (ou === 'over') return val > line ? 'W' : val === line ? 'P' : 'L'
  return val < line ? 'W' : val === line ? 'P' : 'L'
}

async function pushFiltered(title, body, prefKey) {
  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  if (!subs?.length) return
  const targets = prefKey
    ? subs.filter(sub => !sub.prefs || sub.prefs[prefKey] !== false)
    : subs
  const payload = JSON.stringify({ title, body, icon: '/icon-192.png', url: '/' })
  await Promise.allSettled(
    targets.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(async err => {
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      })
    )
  )
}

function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id))
}

async function fetchEspnScoreboard(weekKey) {
  const weekNum = parseInt(weekKey.replace(/.*W/, ''), 10)
  const res = await fetchWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${weekNum}&year=${CURRENT_SEASON}&limit=20`)
  if (!res.ok) return []
  const data = await res.json()
  return data.events || []
}

function findGame(events, gameField) {
  if (!gameField) return null
  const parts = gameField.toUpperCase().split(/\s+(?:VS\.?|@|AT)\s+/)
  if (parts.length < 2) return null
  const [teamA, teamB] = parts
  const normA = (TEAM_ALIASES[teamA] || teamA).toUpperCase()
  const normB = (TEAM_ALIASES[teamB] || teamB).toUpperCase()

  for (const event of events) {
    const comp = event.competitions?.[0]
    if (!comp) continue
    const home = comp.competitors?.find(c => c.homeAway === 'home')
    const away = comp.competitors?.find(c => c.homeAway === 'away')
    if (!home || !away) continue
    const homeNorm = (TEAM_ALIASES[home.team.abbreviation] || `${home.team.location} ${home.team.name}`).toUpperCase()
    const awayNorm = (TEAM_ALIASES[away.team.abbreviation] || `${away.team.location} ${away.team.name}`).toUpperCase()

    const matchAB = (homeNorm.includes(normA) || normA.includes(homeNorm.split(' ').pop())) &&
                    (awayNorm.includes(normB) || normB.includes(awayNorm.split(' ').pop()))
    const matchBA = (homeNorm.includes(normB) || normB.includes(homeNorm.split(' ').pop())) &&
                    (awayNorm.includes(normA) || normA.includes(awayNorm.split(' ').pop()))

    if (matchAB || matchBA) return { event, comp, home, away }
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()

  const auth = req.headers.authorization || ''
  const secret = process.env.SETTLE_SECRET
  // Accept GitHub Actions bearer token OR admin password hash from the settings drawer
  const ADMIN_HASH = 'b48cd264507888552dfc132357c1b5b96a158ec451830850343abecbf4ff6d04'
  const isValidSecret = !secret || auth === `Bearer ${secret}`
  const isValidAdmin = auth === `AdminHash ${ADMIN_HASH}`
  if (!isValidSecret && !isValidAdmin) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const weekKey = req.body?.week || getCurrentWeekKey()

  const { data: picks, error: picksErr } = await supabase
    .from('picks')
    .select('*')
    .eq('week', weekKey)
    .is('result', null)
  if (picksErr) return res.status(500).json({ error: picksErr.message })
  if (!picks?.length) return res.json({ ok: true, settled: 0, message: 'no open picks' })

  const events = await fetchEspnScoreboard(weekKey)
  if (!events.length) return res.json({ ok: true, settled: 0, message: 'no ESPN data' })

  // Persist completed scores to game_scores so scores.js hits DB cache on next load
  const weekYearNum = parseInt(weekKey.split('-')[0])
  const weekNumNum = parseInt(weekKey.replace(/.*W/, ''))
  const completedEvents = events.filter(e => e.competitions?.[0]?.status?.type?.completed)
  if (completedEvents.length > 0) {
    const rows = completedEvents.map(event => {
      const comp = event.competitions[0]
      const home = comp.competitors.find(c => c.homeAway === 'home')
      const away = comp.competitors.find(c => c.homeAway === 'away')
      return {
        year: weekYearNum, week: weekNumNum,
        home_abbr: home.team.abbreviation, away_abbr: away.team.abbreviation,
        short_name: event.shortName || event.name || '',
        home_name: home.team.displayName || home.team.name,
        away_name: away.team.displayName || away.team.name,
        home_score: parseInt(home.score), away_score: parseInt(away.score),
      }
    })
    await supabase.from('game_scores').upsert(rows, { onConflict: 'year,week,home_abbr,away_abbr' })
  }

  const settled = []
  const skipped = []

  for (const pick of picks) {
    const { player, lock, game } = pick
    if (!lock) { skipped.push({ player, reason: 'no lock' }); continue }

    const propIntent = parsePropIntent(lock)
    let result = null

    if (propIntent) {
      // Use pick.game field (abbr-based) as primary lookup; fall back to PLAYER_TEAM if game missing
      let gameMatch = null
      if (game) {
        gameMatch = findGame(events, game)
        if (gameMatch && !gameMatch.comp.status?.type?.completed) gameMatch = null
      }
      if (!gameMatch) {
        const team = getTeamFromPlayerProp(lock)
        if (!team) { skipped.push({ player, reason: 'unknown player team' }); continue }
        for (const event of events) {
          const comp = event.competitions?.[0]
          if (!comp) continue
          const home = comp.competitors?.find(c => c.homeAway === 'home')
          const away = comp.competitors?.find(c => c.homeAway === 'away')
          if (!home || !away) continue
          const teamUpper = team.toUpperCase()
          const homeDisp = home.team.displayName?.toUpperCase() || `${home.team.location} ${home.team.name}`.toUpperCase()
          const awayDisp = away.team.displayName?.toUpperCase() || `${away.team.location} ${away.team.name}`.toUpperCase()
          if (homeDisp === teamUpper || awayDisp === teamUpper) {
            if (comp.status?.type?.completed) gameMatch = { event, comp }
            break
          }
        }
      }
      if (!gameMatch) { skipped.push({ player, reason: 'game not final' }); continue }

      result = await getPropResult(gameMatch.event.id, propIntent)
    } else {
      const gameMatch = findGame(events, game)
      if (!gameMatch) { skipped.push({ player, reason: 'game not found' }); continue }
      const { comp, home, away } = gameMatch
      if (!comp.status?.type?.completed) { skipped.push({ player, reason: 'game not final' }); continue }

      result = computeResult(lock, home.team.abbreviation, away.team.abbreviation, parseInt(home.score), parseInt(away.score))
    }

    if (!result) { skipped.push({ player, reason: 'could not determine result' }); continue }

    const { error: updateErr } = await supabase
      .from('picks')
      .update({ result })
      .eq('week', weekKey)
      .eq('player', player)
    if (updateErr) { skipped.push({ player, reason: updateErr.message }); continue }

    settled.push({ player, result })

    const emoji = result === 'W' ? '✅' : result === 'L' ? '❌' : '🤝'
    const label = result === 'W' ? 'WIN' : result === 'L' ? 'LOSS' : 'PUSH'
    await pushFiltered(`${player}: ${label} ${emoji}`, lock, 'results')
  }

  // Check parlay
  const { data: allPicks } = await supabase.from('picks').select('result,lock').eq('week', weekKey)
  if (allPicks) {
    const withLocks = allPicks.filter(p => p.lock)
    const noLoss = !withLocks.some(p => p.result === 'L')
    const allDone = withLocks.length >= 4 && withLocks.every(p => p.result === 'W' || p.result === 'P')
    if (noLoss && allDone && settled.length > 0) {
      await pushFiltered('🏆 PARLAY HIT!', `All ${withLocks.length} picks cashed this week — WE EAT! 💰`, 'parlay')
    }
  }

  return res.json({ ok: true, settled: settled.length, skipped: skipped.length, details: { settled, skipped } })
}
