import { supabase } from './_supabase.js'

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

  const games = (data || []).map(row => ({
    id: `${row.home_abbr}-${row.away_abbr}`,
    shortName: row.short_name,
    completed: row.home_score !== null && row.away_score !== null,
    home: { abbr: row.home_abbr, name: row.home_name, score: row.home_score },
    away: { abbr: row.away_abbr, name: row.away_name, score: row.away_score },
  }))

  res.setHeader('Cache-Control', 's-maxage=3600')
  res.status(200).json(games)
}
