import webpush from 'web-push'
import { supabase } from './_supabase.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const WEEK1_START = new Date('2026-09-10T00:00:00Z')
const ALL_PLAYERS = ['BRITTON', 'CHRIS', 'COLBY', 'NATHAN', 'LUCAS', 'KADEN']

// Called by Vercel Cron:
//   0 16 * * 0  — Sunday 10am CST: "locks still missing" reminder
//   30 17 * * 0 — Sunday 11:30am CST (30 min before 1pm games): ?kickoff=1
//   30 23 * * 4 — Thursday 5:30pm CST (30 min before TNF): ?kickoff=1
export default async function handler(req, res) {
  const now = new Date()
  const isKickoff = req.query?.kickoff === '1'
  const daysSince = (now - WEEK1_START) / (1000 * 60 * 60 * 24)
  const weekNum = daysSince < 0 ? 1 : Math.min(18, Math.floor((daysSince + 2) / 7) + 1)
  const weekKey = `2026-NFL-W${String(weekNum).padStart(2, '0')}`

  const { data: picks } = await supabase.from('picks').select('player').eq('week', weekKey)
  const submitted = new Set((picks || []).map(p => p.player.trim().toUpperCase()))
  const missing = ALL_PLAYERS.filter(p => !submitted.has(p))

  const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
  if (error) return res.status(500).json({ error: error.message })

  if (missing.length === 0) {
    return res.json({ ok: true, sent: 0, message: 'Everyone already submitted' })
  }

  const missingNames = missing.join(', ')
  let title, body
  if (isKickoff) {
    const isThursday = now.getUTCDay() === 4
    const slateLabel = isThursday ? 'Thursday Night Football' : 'Sunday 1pm CT games'
    title = '🏈 Locks in 30 min!'
    body = `${slateLabel} kicks off soon — ${missingNames} still need to lock in.`
  } else {
    title = '⏰ Lock Tracker — Locks Still Missing!'
    body = `${missingNames} still haven't submitted their lock for Week ${weekNum}. Games start soon!`
  }

  const pending = (subs || []).filter(sub => !sub.prefs || sub.prefs.reminders !== false)
  const payload = JSON.stringify({ title, body, icon: '/icon-192.png', url: '/' })

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
  return res.json({ ok: true, sent, failed, weekKey, missingPlayers: missing })
}
