// Team normalization and pick parsing utilities

export const TEAM_ALIASES = {
  // Arizona Cardinals
  ARI: 'Arizona Cardinals', AZ: 'Arizona Cardinals', CARDS: 'Arizona Cardinals', CARDINALS: 'Arizona Cardinals',
  // Atlanta Falcons
  ATL: 'Atlanta Falcons', FALCONS: 'Atlanta Falcons',
  // Baltimore Ravens
  BAL: 'Baltimore Ravens', RAVENS: 'Baltimore Ravens',
  // Buffalo Bills
  BUF: 'Buffalo Bills', BILLS: 'Buffalo Bills',
  // Carolina Panthers
  CAR: 'Carolina Panthers', PANTHERS: 'Carolina Panthers',
  // Chicago Bears
  CHI: 'Chicago Bears', BEARS: 'Chicago Bears',
  // Cincinnati Bengals
  CIN: 'Cincinnati Bengals', BENGALS: 'Cincinnati Bengals',
  // Cleveland Browns
  CLE: 'Cleveland Browns', BROWNS: 'Cleveland Browns',
  // Dallas Cowboys
  DAL: 'Dallas Cowboys', COWBOYS: 'Dallas Cowboys', DALLAS: 'Dallas Cowboys',
  // Denver Broncos
  DEN: 'Denver Broncos', BRONCOS: 'Denver Broncos',
  // Detroit Lions
  DET: 'Detroit Lions', LIONS: 'Detroit Lions',
  // Green Bay Packers
  GB: 'Green Bay Packers', PACKERS: 'Green Bay Packers',
  // Houston Texans
  HOU: 'Houston Texans', TEXANS: 'Houston Texans', HOUSTON: 'Houston Texans',
  // Indianapolis Colts
  IND: 'Indianapolis Colts', INDY: 'Indianapolis Colts', COLTS: 'Indianapolis Colts',
  // Jacksonville Jaguars
  JAX: 'Jacksonville Jaguars', JAGUARS: 'Jacksonville Jaguars',
  // Kansas City Chiefs
  KC: 'Kansas City Chiefs', CHIEFS: 'Kansas City Chiefs',
  // Los Angeles Chargers
  LAC: 'Los Angeles Chargers', CHARGERS: 'Los Angeles Chargers',
  // Los Angeles Rams
  LAR: 'Los Angeles Rams', RAMS: 'Los Angeles Rams',
  // Las Vegas Raiders
  LV: 'Las Vegas Raiders', LVR: 'Las Vegas Raiders', RAIDERS: 'Las Vegas Raiders',
  // Miami Dolphins
  MIA: 'Miami Dolphins', DOLPHINS: 'Miami Dolphins',
  // Minnesota Vikings
  MIN: 'Minnesota Vikings', VIKINGS: 'Minnesota Vikings', MINN: 'Minnesota Vikings',
  // New England Patriots
  NE: 'New England Patriots', NEP: 'New England Patriots', PATRIOTS: 'New England Patriots', PATS: 'New England Patriots',
  // New Orleans Saints
  NO: 'New Orleans Saints', NOS: 'New Orleans Saints', SAINTS: 'New Orleans Saints',
  // New York Giants
  NYG: 'New York Giants', GIANTS: 'New York Giants',
  // New York Jets
  NYJ: 'New York Jets', JETS: 'New York Jets',
  // Philadelphia Eagles
  PHI: 'Philadelphia Eagles', EAGLES: 'Philadelphia Eagles',
  // Pittsburgh Steelers
  PIT: 'Pittsburgh Steelers', PITT: 'Pittsburgh Steelers', STEELERS: 'Pittsburgh Steelers',
  // Seattle Seahawks
  SEA: 'Seattle Seahawks', SEAHAWKS: 'Seattle Seahawks',
  // San Francisco 49ers
  SF: 'San Francisco 49ers', '49ERS': 'San Francisco 49ers',
  // Tampa Bay Buccaneers
  TB: 'Tampa Bay Buccaneers', BUCS: 'Tampa Bay Buccaneers', BUCCANEERS: 'Tampa Bay Buccaneers', BUCCS: 'Tampa Bay Buccaneers',
  // Tennessee Titans
  TEN: 'Tennessee Titans', TITANS: 'Tennessee Titans',
  // Washington Commanders
  WAS: 'Washington Commanders', WSH: 'Washington Commanders', WFT: 'Washington Commanders',
  COMMANDERS: 'Washington Commanders', WASHINGTON: 'Washington Commanders',
}

// Player name fragments → team
const PLAYER_TEAM = {
  'KYLER MURRAY': 'Arizona Cardinals', 'MARVIN HARRISON': 'Arizona Cardinals', 'MARVIN HARRISON JR': 'Arizona Cardinals', 'MARV ': 'Arizona Cardinals',
  'JAMES CONNER': 'Arizona Cardinals', 'JAMES CONNOR': 'Arizona Cardinals',
  'ANDRE BACCELLIA': 'Arizona Cardinals',
  'DRAKE LONDON': 'Atlanta Falcons', 'DYAMI BROWN': 'Atlanta Falcons',
  'KOO ': 'Atlanta Falcons', 'YOUNGHOE KOO': 'Atlanta Falcons', 'DYLAN DRUMMOND': 'Atlanta Falcons',
  'LAMAR JACKSON': 'Baltimore Ravens', 'LAMAR ': 'Baltimore Ravens',
  'GUS EDWARDS': 'Baltimore Ravens',
  'JOSH ALLEN': 'Buffalo Bills', 'TYLER BASS': 'Buffalo Bills', 'MASON KINSEY': 'Buffalo Bills',
  'AJ DILLON': 'Green Bay Packers',
  'SWIFT ': 'Chicago Bears', "D'ANDRE SWIFT": 'Chicago Bears', 'SANTOS ': 'Chicago Bears', 'CHRIS MOORE': 'Chicago Bears', 'TYLER SCOTT': 'Chicago Bears',
  'JOE BURROW': 'Cincinnati Bengals', 'BURROW ': 'Cincinnati Bengals', 'JOE FLACCO': 'Cincinnati Bengals',
  'SHEDEUR SANDERS': 'Cleveland Browns',
  'JERRY JEUDY': 'Cleveland Browns', 'JEUDY ': 'Cleveland Browns', 'KHADAREAL HODGE': 'Cleveland Browns',
  'BRANDON AUBREY': 'Dallas Cowboys', 'JAKE FERGUSON': 'Dallas Cowboys', 'RYAN FLOURNOY': 'Dallas Cowboys',
  'COURTLAND SUTTON': 'Denver Broncos', 'JAVONTE WILLIAMS': 'Denver Broncos',
  'JAMESON WILLIAMS': 'Detroit Lions', 'JAMO ': 'Detroit Lions', 'JARD GOOF': 'Detroit Lions', 'JARED GOFF': 'Detroit Lions',
  'PACKERS': 'Green Bay Packers',
  'TANK DELL': 'Houston Texans', 'NICO COLLINS': 'Houston Texans', 'NOAH BROWN': 'Houston Texans',
  'MAHOMES': 'Kansas City Chiefs', 'ISIAH PACHECO': 'Kansas City Chiefs', 'PACHECO ': 'Kansas City Chiefs', 'HARRISON BUTKER': 'Kansas City Chiefs',
  'JK DOBBINS': 'Los Angeles Chargers', 'LADD MCCONKEY': 'Los Angeles Chargers',
  'GERALD EVERETT': 'Los Angeles Chargers', 'ALEX ERICKSON': 'Los Angeles Chargers',
  'TYLER HIGBEE': 'Los Angeles Rams', 'HIGBEE ': 'Los Angeles Rams', 'VAN JEFFERSON': 'Los Angeles Rams',
  'AIDAN O\'CONNELL': 'Las Vegas Raiders',
  'JULIAN HILL': 'Miami Dolphins', 'JUSTICE HILL': 'Baltimore Ravens', 'JONNU SMITH': 'Miami Dolphins', 'JASON SANDERS': 'Miami Dolphins',
  'MO ALLIE COX': 'Indianapolis Colts', 'PHILIP RIVERS': 'Indianapolis Colts',
  'JORDAN ADDISON': 'Minnesota Vikings', 'JOSH OLIVER': 'Minnesota Vikings',
  'NELSON AGHOLOR': 'New England Patriots', 'HUNTER HENRY': 'New England Patriots',
  'KAYSHON BOUTTE': 'New England Patriots', 'TREVEYON HENDERSON': 'New England Patriots',
  'FOSTER MOREAU': 'New Orleans Saints', 'CHRIS OLAVE': 'New Orleans Saints', 'OLAVE ': 'New Orleans Saints',
  'ALVIN KAMARA': 'New Orleans Saints', 'KAMARA ': 'New Orleans Saints',
  'WAN\'DALE': 'New York Giants', 'JALIN HYATT': 'New York Giants', 'JOE FLACCO': 'New York Giants',
  'TYLER CONKLIN': 'New York Jets', 'DALVIN COOK': 'New York Jets',
  'AJ BROWN': 'Philadelphia Eagles', 'JAKE MOODY': 'San Francisco 49ers',
  'BROCK PURDY': 'San Francisco 49ers', 'CMC ': 'San Francisco 49ers', 'CHRISTIAN MCCAFFREY': 'San Francisco 49ers',
  'KYLE JUSZCZYK': 'San Francisco 49ers', 'MAC JONES': 'San Francisco 49ers',
  'WARREN ': 'Pittsburgh Steelers',
  'NOAH FANT': 'Seattle Seahawks', 'KENNETH WALKER': 'Seattle Seahawks',
  'TREY PALMER': 'Tampa Bay Buccaneers', 'MIKE EVANS': 'Tampa Bay Buccaneers', 'DAVID MOORE': 'Tampa Bay Buccaneers',
  'TONY POLLARD': 'Tennessee Titans', 'POLLARD ': 'Tennessee Titans',
  'DYAMI BROWN': 'Washington Commanders', 'JD MCKISSIC': 'Washington Commanders',
  'XAVIER LEGETTE': 'Carolina Panthers', 'HUNTER LONG': 'Jacksonville Jaguars',
  'RYAN FLOURNOY': 'Dallas Cowboys',
}

function normalizeTeam(raw) {
  if (!raw) return null
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9 ']/g, '')
  return TEAM_ALIASES[key] || null
}

export function getTeamFromPlayerProp(lock) {
  if (!lock) return null
  const upper = lock.toUpperCase()
  for (const [fragment, team] of Object.entries(PLAYER_TEAM)) {
    if (upper.includes(fragment.trim())) return team
  }
  return null
}

// Parse a prop lock string to identify the stat category/label to look up
// e.g. "Santos O 1.5 PATs" → { playerFrag:'Santos', ou:'over', line:1.5, category:'kicking', label:'XP' }
// e.g. "Agholor u1.5 rec"  → { playerFrag:'Nelson Agholor', ou:'under', line:1.5, category:'receiving', label:'REC' }
export function parsePropIntent(lock) {
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

// Parse the game field to get [teamA, teamB]
function parseGameTeams(game) {
  if (!game) return []
  const parts = game.toUpperCase().split(/\s+(?:VS\.?|@|AT)\s+/)
  if (parts.length < 2) return []
  return parts.map(p => normalizeTeam(p.trim())).filter(Boolean)
}

// Parse the lock to determine which team was bet on
function parseLockTeam(lock, gameTeams) {
  if (!lock) return null
  const upper = lock.toUpperCase()

  // Try player prop first
  const propTeam = getTeamFromPlayerProp(lock)
  if (propTeam) return propTeam

  // Try totals / non-team bets
  if (/^(OVER|UNDER|O\d|U\d|^\d|NO SAFE|LONGEST TD|OVER|UNDER)/.test(upper)) return null

  // Try each token in the lock string
  const tokens = upper.split(/[\s\-\+\.\/]+/)
  for (const token of tokens) {
    const team = normalizeTeam(token)
    if (team) return team
  }

  // Handle "LA" ambiguity — check against game teams
  if (upper.startsWith('LA ') || upper === 'LA') {
    if (gameTeams.includes('Los Angeles Rams')) return 'Los Angeles Rams'
    if (gameTeams.includes('Los Angeles Chargers')) return 'Los Angeles Chargers'
    return 'Los Angeles Rams'
  }

  // "NY" ambiguity
  if (upper.startsWith('NY ') || upper === 'NY') {
    if (gameTeams.includes('New York Giants')) return 'New York Giants'
    if (gameTeams.includes('New York Jets')) return 'New York Jets'
  }

  return null
}

export function buildTeamStats(seasons) {
  const stats = {} // teamName → { betOn: {W,L,P}, faded: {W,L,P} }

  function ensure(team) {
    if (!stats[team]) stats[team] = {
      betOn: { W: 0, L: 0, P: 0 },
      faded: { W: 0, L: 0, P: 0 },
    }
  }

  for (const season of seasons) {
    for (const week of season.weeks) {
      for (const pick of week.picks) {
        if (!pick.result || (pick.result !== 'W' && pick.result !== 'L' && pick.result !== 'P')) continue
        if (pick.sport && pick.sport !== 'NFL') continue

        const gameTeams = parseGameTeams(pick.game)
        const betOnTeam = parseLockTeam(pick.lock, gameTeams)
        if (!betOnTeam) continue

        // The faded team is the other team in the game
        const fadedTeam = gameTeams.find(t => t !== betOnTeam) || null

        ensure(betOnTeam)
        stats[betOnTeam].betOn[pick.result]++

        if (fadedTeam) {
          ensure(fadedTeam)
          // When we fade a team and WIN, that team lost; when we fade and LOSE, that team won
          stats[fadedTeam].faded[pick.result]++
        }
      }
    }
  }

  return Object.entries(stats).map(([team, s]) => {
    const betTotal = s.betOn.W + s.betOn.L + s.betOn.P
    const fadeTotal = s.faded.W + s.faded.L + s.faded.P
    const betWinPct = betTotal > 0 ? Math.round(s.betOn.W / (s.betOn.W + s.betOn.L || 1) * 100) : 0
    const fadeWinPct = fadeTotal > 0 ? Math.round(s.faded.W / (s.faded.W + s.faded.L || 1) * 100) : 0
    return { team, ...s, betTotal, fadeTotal, betWinPct, fadeWinPct }
  }).filter(t => t.betTotal + t.fadeTotal >= 2)
   .sort((a, b) => b.betTotal - a.betTotal)
}
