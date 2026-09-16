// Single source of truth for shared NFL constants and helpers
// Used by: player-stats.js, scores.js, auto-settle.js, normalize-picks.js

export const CURRENT_SEASON = 2026

export const SEASON_OPENERS = {
  2021: '2021-09-09', 2022: '2022-09-08', 2023: '2023-09-07',
  2024: '2024-09-05', 2025: '2025-09-04', 2026: '2026-09-10',
}

export const PLAYER_TEAM = {
  'KYLER MURRAY': 'Arizona Cardinals', 'MARVIN HARRISON': 'Arizona Cardinals',
  'MARVIN HARRISON JR': 'Arizona Cardinals', 'MARV ': 'Arizona Cardinals',
  'JAMES CONNER': 'Arizona Cardinals', 'JAMES CONNOR': 'Arizona Cardinals',
  'DRAKE LONDON': 'Atlanta Falcons', 'DYAMI BROWN': 'Atlanta Falcons',
  'KOO ': 'Atlanta Falcons', 'YOUNGHOE KOO': 'Atlanta Falcons',
  'LAMAR JACKSON': 'Baltimore Ravens', 'LAMAR ': 'Baltimore Ravens',
  'GUS EDWARDS': 'Baltimore Ravens', 'JUSTICE HILL': 'Baltimore Ravens',
  'JOSH ALLEN': 'Buffalo Bills', 'TYLER BASS': 'Buffalo Bills',
  'AJ DILLON': 'Green Bay Packers',
  'SWIFT ': 'Chicago Bears', "D'ANDRE SWIFT": 'Chicago Bears',
  'SANTOS ': 'Chicago Bears', 'CHRIS MOORE': 'Chicago Bears', 'TYLER SCOTT': 'Chicago Bears',
  'JOE BURROW': 'Cincinnati Bengals', 'JOE FLACCO': 'Cincinnati Bengals',
  'SHEDEUR SANDERS': 'Cleveland Browns', 'JERRY JEUDY': 'Cleveland Browns',
  'KHADAREAL HODGE': 'Cleveland Browns',
  'BRANDON AUBREY': 'Dallas Cowboys', 'JAKE FERGUSON': 'Dallas Cowboys', 'RYAN FLOURNOY': 'Dallas Cowboys',
  'COURTLAND SUTTON': 'Denver Broncos', 'JAVONTE WILLIAMS': 'Denver Broncos',
  'JAMESON WILLIAMS': 'Detroit Lions', 'JAMO ': 'Detroit Lions', 'JARED GOFF': 'Detroit Lions',
  'TANK DELL': 'Houston Texans', 'NICO COLLINS': 'Houston Texans', 'NOAH BROWN': 'Houston Texans',
  'MAHOMES': 'Kansas City Chiefs', 'ISIAH PACHECO': 'Kansas City Chiefs',
  'PACHECO ': 'Kansas City Chiefs', 'HARRISON BUTKER': 'Kansas City Chiefs',
  'MIKE WASHINGTON': 'Las Vegas Raiders',
  'JK DOBBINS': 'Los Angeles Chargers', 'LADD MCCONKEY': 'Los Angeles Chargers',
  'GERALD EVERETT': 'Los Angeles Chargers',
  'TYLER HIGBEE': 'Los Angeles Rams', 'HIGBEE ': 'Los Angeles Rams', 'VAN JEFFERSON': 'Los Angeles Rams',
  'JULIAN HILL': 'Miami Dolphins', 'JONNU SMITH': 'Miami Dolphins', 'JASON SANDERS': 'Miami Dolphins',
  'MO ALLIE COX': 'Indianapolis Colts', 'PHILIP RIVERS': 'Indianapolis Colts',
  'JORDAN ADDISON': 'Minnesota Vikings', 'JOSH OLIVER': 'Minnesota Vikings',
  'NELSON AGHOLOR': 'New England Patriots', 'HUNTER HENRY': 'New England Patriots',
  'KAYSHON BOUTTE': 'New England Patriots', 'TREVEYON HENDERSON': 'New England Patriots',
  'FOSTER MOREAU': 'New Orleans Saints', 'CHRIS OLAVE': 'New Orleans Saints',
  'OLAVE ': 'New Orleans Saints', 'ALVIN KAMARA': 'New Orleans Saints',
  "WAN'DALE": 'Tennessee Titans', 'WANDALE': 'Tennessee Titans',
  'JALIN HYATT': 'New York Giants',
  'TYLER CONKLIN': 'New York Jets', 'DALVIN COOK': 'New York Jets',
  'AJ BROWN': 'Philadelphia Eagles',
  'JAKE MOODY': 'San Francisco 49ers', 'BROCK PURDY': 'San Francisco 49ers',
  'CMC ': 'San Francisco 49ers', 'CHRISTIAN MCCAFFREY': 'San Francisco 49ers',
  'KYLE JUSZCZYK': 'San Francisco 49ers', 'MAC JONES': 'San Francisco 49ers',
  'WARREN ': 'Pittsburgh Steelers',
  'NOAH FANT': 'Seattle Seahawks', 'KENNETH WALKER': 'Seattle Seahawks',
  'TREY PALMER': 'Tampa Bay Buccaneers', 'MIKE EVANS': 'Tampa Bay Buccaneers',
  'TONY POLLARD': 'Tennessee Titans', 'POLLARD ': 'Tennessee Titans',
  'XAVIER LEGETTE': 'Carolina Panthers', 'HUNTER LONG': 'Jacksonville Jaguars',
}

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

export function normalizeLock(raw) {
  if (!raw) return raw
  let s = raw.trim()
  s = s.replace(/\b(\d+\.?\d*)\+/g, 'o$1')
  s = s.replace(/\bover\s+/gi, 'o').replace(/\bunder\s+/gi, 'u')
  s = s.replace(/\bO(\d)/g, 'o$1').replace(/\bU(\d)/g, 'u$1')
  const STAT_MAP = [
    [/\b(receiving yards|rec yards|rec yds)\b/gi, 'Rec Yds'],
    [/\b(rush(?:ing)? yards?|rush(?:ing)? yds)\b/gi, 'Rush Yds'],
    [/\b(rush(?:ing)? att(?:empts?)?)\b/gi, 'Car'],
    [/\b(pass(?:ing)? yards?|pass yds)\b/gi, 'Pass Yds'],
    [/\b(pass(?:ing)? att(?:empts?)?|pass att)\b/gi, 'Pass Att'],
    [/\b(pass(?:ing)? tds?|td pass(?:es)?)\b/gi, 'Pass TD'],
    [/\b(carries|carry|rushes|rushing|rush)\b/gi, 'Car'],
    [/\b(catches|catch|receptions?)\b/gi, 'Rec'],
    [/\b(touchdowns?|tds?)\b/gi, 'TD'],
    [/\b(completions?|comp|cmp)\b/gi, 'Comp'],
    [/\b(extra points?|pats?|xps?)\b/gi, 'PAT'],
    [/\b(field goals?|fgs?|total fgs?)\b/gi, 'FG'],
  ]
  for (const [re, canonical] of STAT_MAP) s = s.replace(re, canonical)
  const NAME_MAP = [
    [/wan['''']?dale robinson/gi, "Wan'Dale Robinson"],
    [/wan['''']?dale/gi, "Wan'Dale"],
    [/mike washington jr\.?/gi, 'Mike Washington Jr.'],
    [/mike washington(?! jr)/gi, 'Mike Washington Jr.'],
  ]
  for (const [re, canonical] of NAME_MAP) s = s.replace(re, canonical)
  return s
}
