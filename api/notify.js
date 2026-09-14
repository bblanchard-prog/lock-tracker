import webpush from 'web-push'
import { supabase } from './_supabase.js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

// This endpoint is called by Vercel Cron every Saturday at 2pm CST (20:00 UTC)
export default async function handler(req, res) {
  // Allow manual trigger with secret, or Vercel Cron (which hits with no auth header)
  const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
  if (error) return res.status(500).json({ error: error.message })

  const payload = JSON.stringify({
    title: '🔒 Lock Tracker — Time to Submit!',
    body: "Get your locks in for this week's parlay. Don't be the last one.",
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
        // Remove stale subscriptions (410 = unsubscribed)
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        throw err
      })
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  return res.json({ ok: true, sent, failed })
}
