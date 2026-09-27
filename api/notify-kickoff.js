import webpush from 'web-push'
import { supabase } from './_supabase.js'
import { CURRENT_SEASON, SEASON_OPENERS } from './_constants.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

// Called by Vercel Cron: "0 18 * * 0" — Sunday 1pm ET / 12pm CT (early slate kickoff)
export default async function handler(req, res) {
  const WEEK1_START = new Date(`${SEASON_OPENERS[CURRENT_SEASON]}T00:00:00Z`)
  const daysSince = (Date.now() - WEEK1_START.getTime()) / (1000 * 60 * 60 * 24)
  const weekNum = daysSince < 0 ? 1 : Math.min(18, Math.floor((daysSince + 2) / 7) + 1)
  const weekKey = `${CURRENT_SEASON}-NFL-W${String(weekNum).padStart(2, '0')}`

  const { data: picks } = await supabase.from('picks').select('player').eq('week', weekKey)
  if (!picks?.length) return res.json({ ok: true, sent: 0, message: 'No picks this week' })

  const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
  if (error) return res.status(500).json({ error: error.message })

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
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        throw err
      })
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  return res.json({ ok: true, sent, failed, weekKey, picksIn: picks.length })
}
