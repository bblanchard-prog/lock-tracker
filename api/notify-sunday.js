import webpush from 'web-push'
import { supabase } from './_supabase.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

// Called by Vercel Cron every Sunday at 2pm CST (20:00 UTC)
// Only notifies players who haven't submitted a pick this week
export default async function handler(req, res) {
  // Figure out current NFL week key (2026 season)
  const WEEK_ONE_START = new Date('2026-09-10T00:00:00Z')
  const now = new Date()
  const weekNum = Math.max(1, Math.min(18, Math.ceil((now - WEEK_ONE_START) / (7 * 24 * 60 * 60 * 1000))))
  const weekKey = `2026-NFL-W${String(weekNum).padStart(2, '0')}`

  // Get picks already submitted this week
  const { data: picks } = await supabase.from('picks').select('player').eq('week', weekKey)
  const submitted = new Set((picks || []).map(p => p.player.trim().toUpperCase()))

  const ALL_PLAYERS = ['BRITTON', 'CHRIS', 'COLBY', 'NATHAN', 'LUCAS', 'KADEN']
  const missing = ALL_PLAYERS.filter(p => !submitted.has(p))

  // Get all subscribers
  const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
  if (error) return res.status(500).json({ error: error.message })

  if (missing.length === 0) {
    return res.json({ ok: true, sent: 0, message: 'Everyone already submitted' })
  }

  const missingNames = missing.join(', ')
  const pending = subs.filter(sub => !sub.prefs || sub.prefs.reminders !== false)
  const payload = JSON.stringify({
    title: '⏰ Lock Tracker — Locks Still Missing!',
    body: `${missingNames} still haven't submitted their lock for Week ${weekNum}. Games start soon!`,
    icon: '/icon-192.png',
    url: '/',
  })

  const results = await Promise.allSettled(
    pending.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(async err => {
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        throw err
      })
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  return res.json({ ok: true, sent, failed, weekKey, pendingPlayers: pending.map(s => s.player) })
}
