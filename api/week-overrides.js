import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('week_overrides').select('*')
    if (error) return res.status(500).json({ error: error.message })
    const map = {}
    for (const row of (data || [])) {
      map[`${row.year}-${row.week_num}`] = { parlayResult: row.parlay_result }
    }
    return res.json(map)
  }

  if (req.method === 'PUT') {
    const { year, weekNum, parlayResult } = req.body
    if (!year || !weekNum) return res.status(400).json({ error: 'year and weekNum required' })
    const { error } = await supabase.from('week_overrides').upsert(
      { year: Number(year), week_num: Number(weekNum), parlay_result: parlayResult || null },
      { onConflict: 'year,week_num' }
    )
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
