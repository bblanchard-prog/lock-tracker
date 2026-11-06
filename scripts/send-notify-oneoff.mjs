// One-off: query Supabase for missing Week 9 picks, send push notification.
// Run: node -r dotenv/config scripts/send-notify-oneoff.mjs dotenv_config_path=.env.production
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

const ALL_PLAYERS = ['BRITTON', 'CHRIS', 'COLBY', 'NATHAN', 'LUCAS', 'KADEN']

// Calculate current week key same way notify.js does
const SEASON_OPENERS = { 2026: '2026-09-10' }
const CURRENT_SEASON = 2026
const opener = SEASON_OPENERS[CURRENT_SEASON]
const WEEK1_START = new Date(`${opener}T00:00:00Z`)
const daysSince = (Date.now() - WEEK1_START.getTime()) / (1000 * 60 * 60 * 24)
const weekNum = daysSince < 0 ? 1 : Math.min(18, Math.floor((daysSince + 2) / 7) + 1)
const weekKey = `${CURRENT_SEASON}-NFL-W${String(weekNum).padStart(2, '0')}`

console.log(`Week key: ${weekKey}`)

// Check picks
const { data: picks, error: picksErr } = await supabase.from('picks').select('player').eq('week', weekKey)
if (picksErr) { console.error('picks error:', picksErr.message); process.exit(1) }
const submitted = new Set((picks || []).map(p => p.player.trim().toUpperCase()))
const missing = ALL_PLAYERS.filter(p => !submitted.has(p))
console.log(`Submitted: ${[...submitted].join(', ') || '(none)'}`)
console.log(`Missing:   ${missing.join(', ') || '(none)'}`)

if (missing.length === 0) {
  console.log('Everyone submitted — no notification needed.')
  process.exit(0)
}

// Check subscriptions
const { data: subs, error: subsErr } = await supabase.from('push_subscriptions').select('*')
if (subsErr) { console.error('subscriptions error:', subsErr.message); process.exit(1) }
console.log(`Push subscriptions in DB: ${(subs || []).length}`)
if (!subs?.length) {
  console.log('No subscriptions found — nobody to notify.')
  process.exit(0)
}

const missingNames = missing.join(', ')
const payload = JSON.stringify({
  title: '🔒 Lock Tracker — Get Your Pick In!',
  body: `${missingNames} still ${missing.length === 1 ? 'needs' : 'need'} to submit. Locks close Sunday at noon.`,
  icon: '/icon-192.png',
  url: '/',
})

const targets = subs.filter(sub => !sub.prefs || sub.prefs.reminders !== false)
console.log(`Sending to ${targets.length} subscriber(s)...`)

const results = await Promise.allSettled(
  targets.map(sub =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    ).catch(async err => {
      if (err.statusCode === 410) {
        console.log(`  Removing stale subscription: ${sub.endpoint.slice(0, 60)}...`)
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
      throw err
    })
  )
)

const sent = results.filter(r => r.status === 'fulfilled').length
const failed = results.filter(r => r.status === 'rejected')
console.log(`Sent: ${sent}, Failed: ${failed.length}`)
failed.forEach((f, i) => console.log(`  fail[${i}]: ${f.reason?.statusCode} ${f.reason?.message}`))
