import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    const { year } = req.query
    if (!year) return res.status(400).json({ error: 'year required' })

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .like('week', `${year}-%`)
      .order('submitted_at')

    if (error) return res.status(500).json({ error: error.message })

    // Group by week
    const byWeek = {}
    for (const row of (data || [])) {
      if (!byWeek[row.week]) byWeek[row.week] = []
      byWeek[row.week].push({
        player: row.player,
        sport: row.sport,
        game: row.game,
        lock: row.lock,
        odds: row.odds,
        result: row.result || null,
        submittedAt: row.submitted_at,
      })
    }

    const weeks = Object.entries(byWeek).map(([weekKey, picks]) => {
      const match = weekKey.match(/W(\d+)$/)
      return { weekKey, weekNum: match ? parseInt(match[1]) : 0, picks }
    }).sort((a, b) => a.weekNum - b.weekNum)

    return res.json(weeks)
  }

  res.status(405).end()
}
