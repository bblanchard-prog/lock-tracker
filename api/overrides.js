import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('overrides').select('*')
    if (error) return res.status(500).json({ error: error.message })
    // Return as flat object keyed by "year-weekNum-PLAYER"
    const out = {}
    for (const row of data) {
      out[row.key] = {
        game: row.game,
        lock: row.lock,
        odds: row.odds,
        result: row.result,
        sport: row.sport,
        outcome: row.outcome,
      }
    }
    return res.json(out)
  }

  if (req.method === 'PUT') {
    const { year, week, player } = req.query
    if (!year || !week || !player) return res.status(400).json({ error: 'year, week, player required' })
    const key = `${year}-${week}-${player.trim().toUpperCase()}`
    const { error } = await supabase.from('overrides').upsert({
      key,
      ...req.body,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, key })
  }

  if (req.method === 'DELETE') {
    const { year, week, player } = req.query
    if (!year || !week || !player) return res.status(400).json({ error: 'year, week, player required' })
    const key = `${year}-${week}-${player.trim().toUpperCase()}`
    const { error } = await supabase.from('overrides').delete().eq('key', key)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
