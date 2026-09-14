import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qvzeufyoucfcfvyszlak.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2emV1ZnlvdWNmY2Z2eXN6bGFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk5NzM2MCwiZXhwIjoyMTAyNTczMzYwfQ.PE2uZ6Pum38Jd5Vhdh2wGJI0YfzCD-axCnh4JuFdPQo'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// NFL season opener (Thursday of week 1) for each year
const SEASON_OPENERS = {
  2021: '2021-09-09',
  2022: '2022-09-08',
  2023: '2023-09-07',
  2024: '2024-09-05',
  2025: '2025-09-04',
}

const WEEKS = [
  ...Array.from({length: 14}, (_, i) => ({ year: 2021, week: i + 1 })),
  ...Array.from({length: 18}, (_, i) => ({ year: 2022, week: i + 1 })),
  ...Array.from({length: 18}, (_, i) => ({ year: 2023, week: i + 1 })),
  ...Array.from({length: 18}, (_, i) => ({ year: 2024, week: i + 1 })),
  ...Array.from({length: 18}, (_, i) => ({ year: 2025, week: i + 1 })),
]

function weekDateRange(year, week) {
  const opener = new Date(SEASON_OPENERS[year] + 'T00:00:00Z')
  const weekStart = new Date(opener.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000)
  const weekEnd   = new Date(weekStart.getTime() + 8 * 24 * 60 * 60 * 1000)
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '')
  return `${fmt(weekStart)}-${fmt(weekEnd)}`
}

async function fetchWeek(year, week) {
  const dates = weekDateRange(year, week)
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=20`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`ESPN ${year} W${week}: ${r.status}`)
  const data = await r.json()
  return (data.events || []).map(event => {
    const comp = event.competitions?.[0]
    if (!comp) return null
    const home = comp.competitors?.find(c => c.homeAway === 'home')
    const away = comp.competitors?.find(c => c.homeAway === 'away')
    if (!home || !away) return null
    const done = comp.status?.type?.completed
    return {
      year, week,
      short_name: event.shortName,
      home_abbr: home.team.abbreviation,
      home_name: home.team.displayName,
      home_score: done ? parseInt(home.score) : null,
      away_abbr: away.team.abbreviation,
      away_name: away.team.displayName,
      away_score: done ? parseInt(away.score) : null,
    }
  }).filter(Boolean)
}

let total = 0, errors = 0
for (const { year, week } of WEEKS) {
  try {
    const games = await fetchWeek(year, week)
    if (games.length === 0) { console.log(`  ${year} W${week}: 0 games`); continue }
    const { error } = await supabase
      .from('game_scores')
      .upsert(games, { onConflict: 'year,week,home_abbr,away_abbr' })
    if (error) { console.error(`  ${year} W${week} DB error:`, error.message); errors++; continue }
    total += games.length
    const scored = games.filter(g => g.home_score !== null).length
    console.log(`✓ ${year} W${week}: ${games.length} games (${scored} scored)`)
  } catch (e) {
    console.error(`✗ ${year} W${week}:`, e.message)
    errors++
  }
  await new Promise(r => setTimeout(r, 150))
}

console.log(`\nDone. ${total} games upserted, ${errors} errors.`)
