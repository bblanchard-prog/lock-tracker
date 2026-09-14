import { supabase } from './_supabase.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'POST') {
    const { endpoint, keys, player, prefs } = req.body
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' })
    }
    const record = {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      player: player || null,
    }
    if (prefs !== undefined) record.prefs = prefs
    const { error } = await supabase.from('push_subscriptions').upsert(record, { onConflict: 'endpoint' })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  if (req.method === 'PATCH') {
    const { endpoint, prefs } = req.body
    if (!endpoint || !prefs) return res.status(400).json({ error: 'endpoint and prefs required' })
    const { error } = await supabase.from('push_subscriptions')
      .update({ prefs })
      .eq('endpoint', endpoint)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' })
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return res.json({ ok: true })
  }

  res.status(405).end()
}
