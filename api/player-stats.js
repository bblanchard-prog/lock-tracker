// GET /api/player-stats?year=2024&week=5&lock=Santos+O+1.5+PATs
// Returns player stat + game score for prop picks

const SEASON_OPENERS = {
  2021: '2021-09-09', 2022: '2022-09-08', 2023: '2023-09-07',
  2024: '2024-09-05', 2025: '2025-09-04', 2026: '2026-09-10',
}

const PLAYER_TEAM = {
  'KYLER MURRAY': 'Arizona Cardinals', 'MARVIN HARRISON': 'Arizona Cardinals', 'MARVIN HARRISON JR': 'Arizona Cardinals',
  'JAMES CONNER': 'Arizona Cardinals', 'JAMES CONNOR': 'Arizona Cardinals',
  'DRAKE LONDON': 'Atlanta Falcons', 'KOO ': 'Atlanta Falcons', 'YOUNGHOE KOO': 'Atlanta Falcons',
  'LAMAR JACKSON': 'Baltimore Ravens', 'GUS EDWARDS': 'Baltimore Ravens',
  'JOSH ALLEN': 'Buffalo Bills', 'TYLER BASS': 'Buffalo Bills',
  'AJ DILLON': 'Green Bay Packers',
  'SWIFT ': 'Chicago Bears', "D'ANDRE SWIFT": 'Chicago Bears',
  'SANTOS ': 'Chicago Bears', 'CHRIS MOORE': 'Chicago Bears', 'TYLER SCOTT': 'Chicago Bears',
  'JOE BURROW': 'Cincinnati Bengals', 'JOE FLACCO': 'Cincinnati Bengals',
  'SHEDEUR SANDERS': 'Cleveland Browns', 'JERRY JEUDY': 'Cleveland Browns', 'KHADAREAL HODGE': 'Cleveland Browns',
  'BRANDON AUBREY': 'Dallas Cowboys', 'JAKE FERGUSON': 'Dallas Cowboys',
  'COURTLAND SUTTON': 'Denver Broncos', 'JAVONTE WILLIAMS': 'Denver Broncos',
  'JAMESON WILLIAMS': 'Detroit Lions', 'JAMO ': 'Detroit Lions', 'JARED GOFF': 'Detroit Lions',
  'TANK DELL': 'Houston Texans', 'NICO COLLINS': 'Houston Texans', 'NOAH BROWN': 'Houston Texans',
  'MAHOMES': 'Kansas City Chiefs', 'ISIAH PACHECO': 'Kansas City Chiefs', 'PACHECO ': 'Kansas City Chiefs', 'HARRISON BUTKER': 'Kansas City Chiefs',
  'JK DOBBINS': 'Los Angeles Chargers', 'LADD MCCONKEY': 'Los Angeles Chargers',
  'GERALD EVERETT': 'Los Angeles Chargers', 'TYLER HIGBEE': 'Los Angeles Rams', 'HIGBEE ': 'Los Angeles Rams', 'VAN JEFFERSON': 'Los Angeles Rams',
  'JULIAN HILL': 'Miami Dolphins', 'JUSTICE HILL': 'Baltimore Ravens', 'JONNU SMITH': 'Miami Dolphins', 'JASON SANDERS': 'Miami Dolphins',
  'MO ALLIE COX': 'Indianapolis Colts', 'PHILIP RIVERS': 'Indianapolis Colts',
  'JORDAN ADDISON': 'Minnesota Vikings', 'JOSH OLIVER': 'Minnesota Vikings',
  'NELSON AGHOLOR': 'New England Patriots', 'HUNTER HENRY': 'New England Patriots',
  'KAYSHON BOUTTE': 'New England Patriots', 'TREVEYON HENDERSON': 'New England Patriots',
  'FOSTER MOREAU': 'New Orleans Saints', 'CHRIS OLAVE': 'New Orleans Saints', 'OLAVE ': 'New Orleans Saints',
  'ALVIN KAMARA': 'New Orleans Saints',
  "WAN'DALE": 'New York Giants', 'WANDALE': 'New York Giants', 'JALIN HYATT': 'New York Giants',
  'TYLER CONKLIN': 'New York Jets', 'DALVIN COOK': 'New York Jets',
  'AJ BROWN': 'Philadelphia Eagles', 'JAKE MOODY': 'San Francisco 49ers',
  'BROCK PURDY': 'San Francisco 49ers', 'CHRISTIAN MCCAFFREY': 'San Francisco 49ers',
  'KYLE JUSZCZYK': 'San Francisco 49ers', 'MAC JONES': 'San Francisco 49ers',
  'WARREN ': 'Pittsburgh Steelers',
  'NOAH FANT': 'Seattle Seahawks', 'KENNETH WALKER': 'Seattle Seahawks',
  'TREY PALMER': 'Tampa Bay Buccaneers', 'MIKE EVANS': 'Tampa Bay Buccaneers',
  'TONY POLLARD': 'Tennessee Titans', 'POLLARD ': 'Tennessee Titans', 'DYAMI BROWN': 'Washington Commanders',
  'XAVIER LEGETTE': 'Carolina Panthers', 'HUNTER LONG': 'Jacksonville Jaguars',
  'RYAN FLOURNOY': 'Dallas Cowboys',
}

function getTeamFromPlayerProp(lock) {
  if (!lock) return null
  const upper = lock.toUpperCase()
  for (const [fragment, team] of Object.entries(PLAYER_TEAM)) {
    if (upper.includes(fragment.trim())) return team
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
  else if (/^CATCH|^CATCHES/.test(statKey)) { category = 'receiving'; label = 'REC' }
  else if (/^REC/.test(statKey) && !/YDS|YARD/.test(statKey)) { category = 'receiving'; label = 'REC' }
  else if (/REC.*YDS|REC.*YARD|RECEIVING.*YDS/.test(statKey)) { category = 'receiving'; label = 'YDS' }
  else if (/RUSH.*YDS|RUSH.*YARD/.test(statKey)) { category = 'rushing'; label = 'YDS' }
  else if (/^YDS|^YARD/.test(statKey)) { category = 'receiving'; label = 'YDS' }
  else if (/PASS.*TD|TD.*PASS/.test(statKey)) { category = 'passing'; label = 'TD' }
  else if (/^TD/.test(statKey)) { category = 'receiving'; label = 'TD' }
  else if (/^CAR|^CARR|^CARRIES|RUSH.*ATT|^RUSH/.test(statKey)) { category = 'rushing'; label = 'CAR' }
  else if (/LONG.*REC|LONGEST.*REC|LONGEST|LONG$/.test(statKey)) { category = 'receiving'; label = 'LONG' }
  else if (/^COMP|^CMP/.test(statKey)) { category = 'passing'; label = 'C/ATT' }
  else if (/PASS.*YDS|PASS.*YARD/.test(statKey)) { category = 'passing'; label = 'YDS' }
  else if (/^FG|FIELD.*GOAL/.test(statKey)) { category = 'kicking'; label = 'FG' }
  else if (/PASS.*ATT|^ATT/.test(statKey)) { category = 'passing'; label = 'ATT' }
  else return null
  return { playerFrag, ou, line, category, label }
}

const cache = {}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { year, week, lock } = req.query
  if (!year || !week || !lock) return res.status(200).json(null)

  const cacheKey = `${year}-${week}-${lock}`
  if (cache[cacheKey] !== undefined) return res.status(200).json(cache[cacheKey])

  try {
    const intent = parsePropIntent(lock)
    if (!intent) return res.status(200).json(null)

    const team = getTeamFromPlayerProp(lock)
    if (!team) return res.status(200).json(null)

    const opener = SEASON_OPENERS[parseInt(year)]
    if (!opener) return res.status(200).json(null)

    const openDate = new Date(opener + 'T00:00:00Z')
    const weekStart = new Date(openDate.getTime() + (parseInt(week) - 1) * 7 * 86400000)
    const weekEnd = new Date(weekStart.getTime() + 8 * 86400000)
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
    const dates = `${fmt(weekStart)}-${fmt(weekEnd)}`

    const sbUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=20`
    const sbRes = await fetch(sbUrl)
    if (!sbRes.ok) { cache[cacheKey] = null; return res.status(200).json(null) }
    const sbData = await sbRes.json()

    const teamUpper = team.toUpperCase()
    let gameId = null, gameShortName = null
    let homeScore = null, awayScore = null, homeAbbr = null, awayAbbr = null
    let statusState = 'pre', period = null, clock = null

    for (const event of (sbData.events || [])) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const home = comp.competitors?.find(c => c.homeAway === 'home')
      const away = comp.competitors?.find(c => c.homeAway === 'away')
      if (!home || !away) continue
      const homeFullName = `${home.team.location} ${home.team.name}`.toUpperCase()
      const awayFullName = `${away.team.location} ${away.team.name}`.toUpperCase()
      const homeDisp = home.team.displayName?.toUpperCase() || homeFullName
      const awayDisp = away.team.displayName?.toUpperCase() || awayFullName
      if (homeDisp === teamUpper || awayDisp === teamUpper ||
          homeFullName === teamUpper || awayFullName === teamUpper) {
        gameId = event.id
        gameShortName = event.shortName
        homeScore = home.score != null ? parseInt(home.score) : null
        awayScore = away.score != null ? parseInt(away.score) : null
        homeAbbr = home.team.abbreviation
        awayAbbr = away.team.abbreviation
        statusState = comp.status?.type?.state || 'pre'
        period = comp.status?.period || null
        clock = comp.status?.displayClock || null
        break
      }
    }

    if (!gameId) {
      cache[cacheKey] = null
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
    const searchFrag = SHORT_TO_FULL[playerFrag.toUpperCase()] || playerFrag
    let playerName = null, actual = null

    const playerGroups = bsData.boxscore?.players || []
    outer: for (const group of playerGroups) {
      for (const statGroup of (group.statistics || [])) {
        if (statGroup.name?.toLowerCase() !== category) continue
        // For pass attempts, ESPN stores as C/ATT combined
        const lookupLabel = label === 'ATT' ? 'C/ATT' : label
        const labelIdx = (statGroup.labels || []).indexOf(lookupLabel)
        if (labelIdx === -1) continue
        for (const entry of (statGroup.athletes || [])) {
          const dispName = entry.athlete?.displayName || ''
          if (dispName.toUpperCase().includes(searchFrag.toUpperCase())) {
            playerName = dispName
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

    const result = { playerName, actual, label: intent.label, ou: intent.ou, line: intent.line, gameShortName, homeScore, awayScore, homeAbbr, awayAbbr, gameStatus: statusState, period, clock }
    cache[cacheKey] = result
    res.setHeader('Cache-Control', 's-maxage=60')
    res.status(200).json(result)
  } catch (e) {
    cache[cacheKey] = null
    res.status(200).json(null)
  }
}
