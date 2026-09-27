import { supabase } from './_supabase.js'
import { SEASON_OPENERS } from './_constants.js'

function espnEventToGame(event) {
  const comp = event.competitions?.[0]
  if (!comp) return null
  const home = comp.competitors?.find(c => c.homeAway === 'home')
  const away = comp.competitors?.find(c => c.homeAway === 'away')
  if (!home || !away) return null
  const homeScore = home.score != null ? parseInt(home.score) : null
  const awayScore = away.score != null ? parseInt(away.score) : null
  const completed = comp.status?.type?.completed === true
  return {
    id: `${home.team.abbreviation}-${away.team.abbreviation}`,
    shortName: event.shortName || event.name || '',
    completed,
    home: { abbr: home.team.abbreviation, name: home.team.displayName || home.team.name, score: homeScore },
    away: { abbr: away.team.abbreviation, name: away.team.displayName || away.team.name, score: awayScore },
  }
}

// GET /api/scores?year=2024&week=13
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { year, week } = req.query
  if (!year || !week) return res.status(400).json({ error: 'year and week required' })

  const { data, error } = await supabase
    .from('game_scores')
    .select('*')
    .eq('year', parseInt(year))
    .eq('week', parseInt(week))

  if (error) return res.status(500).json({ error: error.message })

  if (data && data.length > 0) {
    const games = data.map(row => ({
      id: `${row.home_abbr}-${row.away_abbr}`,
      shortName: row.short_name,
      completed: row.home_score !== null && row.away_score !== null,
      home: { abbr: row.home_abbr, name: row.home_name, score: row.home_score },
      away: { abbr: row.away_abbr, name: row.away_name, score: row.away_score },
    }))
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(games)
  }

  // DB empty for this year/week — fall back to ESPN scoreboard
  if (!SEASON_OPENERS[parseInt(year)]) return res.status(200).json([])

  try {
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${parseInt(week)}&year=${parseInt(year)}&limit=20`

    const espnRes = await fetch(espnUrl)
    if (!espnRes.ok) return res.status(200).json([])
    const espnData = await espnRes.json()

    const games = (espnData.events || []).map(espnEventToGame).filter(Boolean)
    // Cache completed weeks longer; in-progress weeks shorter
    const allDone = games.every(g => g.completed)
    res.setHeader('Cache-Control', allDone ? 's-maxage=3600' : 's-maxage=60')
    return res.status(200).json(games)
  } catch {
    return res.status(200).json([])
  }
}
