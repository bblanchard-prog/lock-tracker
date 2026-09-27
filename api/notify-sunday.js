import webpush from 'web-push'
import { supabase } from './_supabase.js'
import { CURRENT_SEASON, SEASON_OPENERS } from './_constants.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const ALL_PLAYERS = ['BRITTON', 'CHRIS', 'COLBY', 'NATHAN', 'LUCAS', 'KADEN']

// Cron schedule (vercel.json):
//   0 19 * * 6  — Saturday 2pm CDT: "get your pick in" (notify.js)
//   0 16 * * 0  — Sunday 11am CDT: "locks in 1 hour" (?kickoff unset)
//   0 18 * * 0  — Sunday 1pm ET kickoff: "LOCKS ARE LIVE!" (?kickoff=live)
export default async function handler(req, res) {
  const now = new Date()
  const kickoff = req.query?.kickoff
  const WEEK1_START = new Date(`${SEASON_OPENERS[CURRENT_SEASON]}T00:00:00Z`)
  const daysSince = (now - WEEK1_START) / (1000 * 60 * 60 * 24)
  const weekNum = daysSince < 0 ? 1 : Math.min(18, Math.floor((daysSince + 2) / 7) + 1)
  const weekKey = `${CURRENT_SEASON}-NFL-W${String(weekNum).padStart(2, '0')}`

  const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
  if (error) return res.status(500).json({ error: error.message })

  // "LOCKS ARE LIVE!" — fires at Sunday 1pm ET kickoff, goes to everyone
  if (kickoff === 'live') {
    const { data: picks } = await supabase.from('picks').select('player').eq('week', weekKey)
    if (!picks?.length) return res.json({ ok: true, sent: 0, message: 'No picks this week' })
    const payload = JSON.stringify({
      title: '🏈 LOCKS ARE LIVE!',
      body: `${picks.length} picks locked in — games are underway. Let's get it! 🔒`,
      icon: '/icon-192.png',
      url: '/',
    })
    const targets = (subs || []).filter(sub => !sub.prefs || sub.prefs.reminders !== false)
    const results = await Promise.allSettled(
      targets.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(async err => {
          if (err.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          throw err
        })
      )
    )
    const sent = results.filter(r => r.status === 'fulfilled').length
    return res.json({ ok: true, sent, failed: results.filter(r => r.status === 'rejected').length, weekKey })
  }

  // Reminder path — only nudge players who haven't submitted
  const { data: picks } = await supabase.from('picks').select('player').eq('week', weekKey)
  const submitted = new Set((picks || []).map(p => p.player.trim().toUpperCase()))
  const missing = ALL_PLAYERS.filter(p => !submitted.has(p))

  if (missing.length === 0) {
    return res.json({ ok: true, sent: 0, message: 'Everyone already submitted' })
  }

  const missingNames = missing.join(', ')
  let title, body
  if (kickoff === '1') {
    const isThursday = now.getUTCDay() === 4
    const slateLabel = isThursday ? 'Thursday Night Football' : 'Sunday 1pm CT games'
    title = '🏈 Locks in 30 min!'
    body = `${slateLabel} kicks off soon — ${missingNames} still need to lock in.`
  } else {
    title = '🏈 Locks in 1 hour!'
    body = `${missingNames} still need to lock in before the noon slate kicks off.`
  }

  const pending = (subs || []).filter(sub => !sub.prefs || sub.prefs.reminders !== false)
  const payload = JSON.stringify({ title, body, icon: '/icon-192.png', url: '/' })

  const results = await Promise.allSettled(
    pending.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(async err => {
        if (err.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        throw err
      })
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  return res.json({ ok: true, sent, failed: results.filter(r => r.status === 'rejected').length, weekKey, missingPlayers: missing })
}
