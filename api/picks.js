import webpush from 'web-push'
import { supabase } from './_supabase.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

async function pushToAll(title, body, prefKey = null) {
  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  if (!subs?.length) return
  const targets = prefKey
    ? subs.filter(sub => !sub.prefs || sub.prefs[prefKey] !== false)
    : subs
  const payload = JSON.stringify({ title, body, icon: '/icon-192.png', url: '/' })
  await Promise.allSettled(
    targets.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(async err => {
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      })
    )
  )
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    const week = req.query.week
    if (!week) return res.status(400).json({ error: 'week required' })
    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('week', week)
      .order('submitted_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ week, picks: data.map(row => ({
      player: row.player,
      sport: row.sport,
      game: row.game,
      lock: row.lock,
      odds: row.odds,
      result: row.result || null,
      submittedAt: row.submitted_at,
    }))})
  }

  if (req.method === 'POST') {
    const { week, player, sport, game, lock, odds } = req.body
    if (!week || !player || !lock) return res.status(400).json({ error: 'week, player, lock required' })
    const playerName = player.trim().toUpperCase()
    const { error } = await supabase.from('picks').upsert({
      week,
      player: playerName,
      sport: sport || 'NFL',
      game: game ? game.trim().toUpperCase() : null,
      lock,
      odds: odds !== undefined && odds !== null && odds !== '' ? Number(odds) : null,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'week,player' })
    if (error) return res.status(500).json({ error: error.message })

    // Notify everyone that this player locked in
    const oddsStr = odds ? ` (${Number(odds) > 0 ? '+' : ''}${odds})` : ''
    const gameStr = game ? ` — ${game}` : ''
    pushToAll(
      `🔒 ${playerName} locked in!`,
      `${lock}${oddsStr}${gameStr}`,
      'pickAlerts'
    )

    // Check if all 6 players are now in — fire a separate "all locked in" push
    const ALL_PLAYERS = ['BRITTON', 'CHRIS', 'COLBY', 'NATHAN', 'LUCAS', 'KADEN']
    const { data: allPicks } = await supabase.from('picks').select('player').eq('week', week)
    const submitted = new Set((allPicks || []).map(p => p.player.trim().toUpperCase()))
    if (ALL_PLAYERS.every(p => submitted.has(p))) {
      pushToAll(
        '🔥 All locks are in!',
        "Everyone's locked in for this week — check the parlay!",
        'pickAlerts'
      )
    }

    return res.json({ ok: true })
  }

  if (req.method === 'PATCH') {
    const { week, player, result, lock } = req.body
    if (!week || !player) return res.status(400).json({ error: 'week and player required' })
    const updates = {}
    if (result !== undefined) updates.result = result || null
    if (lock !== undefined) updates.lock = lock
    const { error } = await supabase.from('picks')
      .update(updates)
      .eq('week', week)
      .eq('player', player.trim().toUpperCase())
    if (error) return res.status(500).json({ error: error.message })

    // Fire parlay-hit notification if all picks just settled as W/P
    if (result === 'W' || result === 'P') {
      const { data: allPicks } = await supabase.from('picks').select('result,lock').eq('week', week)
      if (allPicks && allPicks.length >= 4) {
        const noLoss = !allPicks.some(p => p.result === 'L')
        const allDone = allPicks.every(p => p.result === 'W' || p.result === 'P')
        if (noLoss && allDone) {
          pushToAll(
            '🏆 PARLAY HIT!',
            `All ${allPicks.length} picks cashed this week — WE EAT! 💰`,
            'parlay'
          )
        }
      }
    }

    return res.json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const { week, player } = req.query
    if (!week || !player) return res.status(400).json({ error: 'week and player required' })
    const { error } = await supabase.from('picks')
      .delete()
      .eq('week', week)
      .eq('player', player.trim().toUpperCase())
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
