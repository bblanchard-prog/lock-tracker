import webpush from 'web-push'
import { supabase } from './_supabase.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

function getCurrentWeekKey() {
  const WEEK1_START = new Date('2026-09-10T00:00:00Z')
  const now = new Date()
  const ms = now - WEEK1_START
  if (ms < 0) return '2026-NFL-W01'
  const weekNum = Math.min(18, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1)
  return `2026-NFL-W${String(weekNum).padStart(2, '0')}`
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

function parsePropIntent(lock) {
  if (!lock) return null
  const m = lock.match(/^(.+?)\s+(o(?:ver)?|u(?:nder)?)\s*(\d+\.?\d*)\s+(.+)$/i)
  if (!m) return null
  const playerFrag = m[1].trim()
  const ou = /^o/i.test(m[2]) ? 'over' : 'under'
  const line = parseFloat(m[3])
  const statKey = m[4].trim().toUpperCase()
  let category = null, label = null
  if (/^PAT|^XP|^EXTRA/.test(statKey)) { category = 'kicking'; label = 'XP' }
  else if (/^FG|FIELD.*GOAL|TOTAL.*FG/.test(statKey)) { category = 'kicking'; label = 'FG' }
  else if (/^CATCH|^CATCHES/.test(statKey)) { category = 'receiving'; label = 'REC' }
  else if (/^REC/.test(statKey) && !/YDS|YARD/.test(statKey)) { category = 'receiving'; label = 'REC' }
  else if (/REC.*YDS|REC.*YARD|RECEIVING.*YDS/.test(statKey)) { category = 'receiving'; label = 'YDS' }
  else if (/RUSH.*YDS|RUSH.*YARD/.test(statKey)) { category = 'rushing'; label = 'YDS' }
  else if (/^YDS|^YARD/.test(statKey)) { category = 'receiving'; label = 'YDS' }
  else if (/PASS.*TD|TD.*PASS/.test(statKey)) { category = 'passing'; label = 'TD' }
  else if (/^TOUCHDOWN/.test(statKey)) { category = 'receiving'; label = 'TD' }
  else if (/^TD/.test(statKey)) { category = 'receiving'; label = 'TD' }
  else if (/^CAR|^CARR|^CARRIES|RUSH.*ATT|^RUSH/.test(statKey)) { category = 'rushing'; label = 'CAR' }
  else if (/LONG.*REC|LONGEST.*REC|LONGEST|LONG$/.test(statKey)) { category = 'receiving'; label = 'LONG' }
  else if (/^COMP|^CMP/.test(statKey)) { category = 'passing'; label = 'C/ATT' }
  else if (/PASS.*YDS|PASS.*YARD/.test(statKey)) { category = 'passing'; label = 'YDS' }
  else if (/PASS.*ATT|^ATT/.test(statKey)) { category = 'passing'; label = 'ATT' }
  else return null
  return { playerFrag, ou, line, category, label }
}

const PLAYER_TEAM = {
  'KYLER MURRAY':'Arizona Cardinals','MARVIN HARRISON':'Arizona Cardinals','MARVIN HARRISON JR':'Arizona Cardinals','MARV ':'Arizona Cardinals',
  'JAMES CONNER':'Arizona Cardinals','JAMES CONNOR':'Arizona Cardinals',
  'DRAKE LONDON':'Atlanta Falcons','DYAMI BROWN':'Atlanta Falcons','KOO ':'Atlanta Falcons','YOUNGHOE KOO':'Atlanta Falcons',
  'LAMAR JACKSON':'Baltimore Ravens','LAMAR ':'Baltimore Ravens','GUS EDWARDS':'Baltimore Ravens',
  'JOSH ALLEN':'Buffalo Bills','TYLER BASS':'Buffalo Bills',
  'SWIFT ':'Chicago Bears',"D'ANDRE SWIFT":'Chicago Bears','SANTOS ':'Chicago Bears',
  'JOE BURROW':'Cincinnati Bengals','JOE FLACCO':'Cincinnati Bengals',
  'SHEDEUR SANDERS':'Cleveland Browns','JERRY JEUDY':'Cleveland Browns',
  'BRANDON AUBREY':'Dallas Cowboys','JAKE FERGUSON':'Dallas Cowboys','RYAN FLOURNOY':'Dallas Cowboys',
  'COURTLAND SUTTON':'Denver Broncos','JAVONTE WILLIAMS':'Denver Broncos',
  'JAMESON WILLIAMS':'Detroit Lions','JAMO ':'Detroit Lions','JARED GOFF':'Detroit Lions',
  'TANK DELL':'Houston Texans','NICO COLLINS':'Houston Texans',
  'MAHOMES':'Kansas City Chiefs','ISIAH PACHECO':'Kansas City Chiefs','PACHECO ':'Kansas City Chiefs','HARRISON BUTKER':'Kansas City Chiefs',
  'JK DOBBINS':'Los Angeles Chargers','LADD MCCONKEY':'Los Angeles Chargers',
  'TYLER HIGBEE':'Los Angeles Rams','HIGBEE ':'Los Angeles Rams',
  'JULIAN HILL':'Miami Dolphins','JONNU SMITH':'Miami Dolphins',
  'JORDAN ADDISON':'Minnesota Vikings',
  'NELSON AGHOLOR':'New England Patriots','KAYSHON BOUTTE':'New England Patriots',
  'FOSTER MOREAU':'New Orleans Saints','CHRIS OLAVE':'New Orleans Saints','ALVIN KAMARA':'New Orleans Saints',
  "WAN'DALE":'New York Giants','WANDALE':'Washington Commanders','JALIN HYATT':'New York Giants',
  'AJ BROWN':'Philadelphia Eagles',
  'BROCK PURDY':'San Francisco 49ers','CMC ':'San Francisco 49ers','CHRISTIAN MCCAFFREY':'San Francisco 49ers',
  'NOAH FANT':'Seattle Seahawks','KENNETH WALKER':'Seattle Seahawks',
  'TREY PALMER':'Tampa Bay Buccaneers','MIKE EVANS':'Tampa Bay Buccaneers',
  'TONY POLLARD':'Tennessee Titans','POLLARD ':'Tennessee Titans',
  'XAVIER LEGETTE':'Carolina Panthers',
}

function getTeamFromPlayerProp(lock) {
  if (!lock) return null
  const upper = lock.toUpperCase()
  for (const [fragment, team] of Object.entries(PLAYER_TEAM)) {
    if (upper.includes(fragment.trim())) return team
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

  const bsRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`)
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

async function fetchEspnScoreboard(weekKey) {
  const weekNum = parseInt(weekKey.replace(/.*W/, ''), 10)
  const WEEK1_START = new Date('2026-09-10T00:00:00Z')
  const weekStart = new Date(WEEK1_START.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000)
  const weekEnd = new Date(weekStart.getTime() + 8 * 24 * 60 * 60 * 1000)
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
  const dates = `${fmt(weekStart)}-${fmt(weekEnd)}`
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=20`)
  if (!res.ok) return []
  const data = await res.json()
  return data.events || []
}

function findGame(events, gameField) {
  if (!gameField) return null
  const parts = gameField.toUpperCase().split(/\s+(?:VS\.?|@|AT)\s+/)
  if (parts.length < 2) return null
  const [teamA, teamB] = parts
  const normA = TEAM_ALIASES[teamA] || teamA
  const normB = TEAM_ALIASES[teamB] || teamB

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
  if (secret && auth !== `Bearer ${secret}`) {
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

  const settled = []
  const skipped = []

  for (const pick of picks) {
    const { player, lock, game } = pick
    if (!lock) { skipped.push({ player, reason: 'no lock' }); continue }

    const propIntent = parsePropIntent(lock)
    let result = null

    if (propIntent) {
      const team = getTeamFromPlayerProp(lock)
      if (!team) { skipped.push({ player, reason: 'unknown player team' }); continue }

      let gameMatch = null
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
