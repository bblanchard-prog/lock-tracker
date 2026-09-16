// POST /api/normalize-picks?week=2026-NFL-W01
// Re-normalizes lock strings for existing picks (one-time migration, admin-gated)
import { supabase } from ‘./_supabase.js’
import { normalizeLock } from ‘./_constants.js’

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const auth = req.headers.authorization || ''
  const secret = process.env.SETTLE_SECRET
  if (secret && auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })

  const { week, year } = req.query

  let query = supabase.from('picks').select('week, player, lock')
  if (week) query = query.eq('week', week)
  else if (year) query = query.like('week', `${year}-%`)
  else return res.status(400).json({ error: 'provide ?week= or ?year=' })

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const updated = []
  const errors = []

  for (const row of data || []) {
    const normalized = normalizeLock(row.lock)
    if (normalized === row.lock) continue

    const { error: patchErr } = await supabase
      .from('picks')
      .update({ lock: normalized })
      .eq('week', row.week)
      .eq('player', row.player)

    if (patchErr) errors.push({ player: row.player, week: row.week, error: patchErr.message })
    else updated.push({ player: row.player, week: row.week, old: row.lock, new: normalized })
  }

  res.status(200).json({ updated, unchanged: (data?.length || 0) - updated.length - errors.length, errors })
}
