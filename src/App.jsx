import { useState, useEffect, useMemo, useRef } from 'react'
import { seasons } from './data.js'
import SeasonView from './components/SeasonView.jsx'
import AllTimeStats from './components/AllTimeStats.jsx'
import CraziestOdds from './components/CraziestOdds.jsx'
import ThisWeek from './components/ThisWeek.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import { useAdminAuth } from './useAdminAuth.jsx'
import { API } from './api.js'
import confetti from 'canvas-confetti'
import './index.css'

const ADMIN_HASH = 'b48cd264507888552dfc132357c1b5b96a158ec451830850343abecbf4ff6d04'

const TABS = ['This Week', 'Season', 'Leaderboard', 'Stats', 'Crazy Odds']
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function Toggle({ on, onToggle, disabled }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-yellow-500' : 'bg-slate-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function App() {
  const { request: requestAdmin, Modal: AdminModal } = useAdminAuth()
  const [tab, setTab] = useState('This Week')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('darkMode') !== 'false' } catch { return true }
  })
  const [showOdds, setShowOdds] = useState(() => {
    try { const v = localStorage.getItem('showOdds'); return v === null ? true : v !== 'false' } catch { return true }
  })
  const [notifStatus, setNotifStatus] = useState('default')
  const [liveParlayWins, setLiveParlayWins] = useState([])
  const [isGolden, setIsGolden] = useState(false)
  const [live2026Weeks, setLive2026Weeks] = useState([])
  const [showCelebration, setShowCelebration] = useState(false)
  const celebrationFired = useRef(false)
  const [settling, setSettling] = useState(false)
  const [settleMsg, setSettleMsg] = useState(null)
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem('notif-prefs')
      return saved ? JSON.parse(saved) : { reminders: true, pickAlerts: true, results: true, parlay: true }
    } catch { return { reminders: true, pickAlerts: true, results: true, parlay: true } }
  })

  useEffect(() => {
    function fetchLive() {
      fetch(`${API}/season-picks?year=2026`).then(r => r.json()).then(weeks => {
        const wins = []
        for (const w of (weeks || [])) {
          const submitted = w.picks.filter(p => p.lock)
          if (submitted.length < 4) continue
          const allSettled = submitted.every(p => p.result === 'W' || p.result === 'P')
          const anyLoss = submitted.some(p => p.result === 'L')
          if (allSettled && !anyLoss) wins.push(w)
        }
        setLiveParlayWins(wins)

        // Golden: most recent fully-completed parlay win is newer than the most recent loss.
        // A partially-settled week (some picks still pending) doesn't break gold — only an actual L does.
        let mostRecentWinWeek = -1
        let mostRecentLossWeek = -1
        for (const w of (weeks || [])) {
          const submitted = w.picks.filter(p => p.lock)
          const anyLoss = submitted.some(p => p.result === 'L')
          const allSettled = submitted.length >= 4 && submitted.every(p => p.result === 'W' || p.result === 'P')
          if (anyLoss && w.weekNum > mostRecentLossWeek) mostRecentLossWeek = w.weekNum
          if (allSettled && !anyLoss && w.weekNum > mostRecentWinWeek) mostRecentWinWeek = w.weekNum
        }
        const golden = mostRecentWinWeek > -1 && mostRecentWinWeek > mostRecentLossWeek
        setIsGolden(golden)
        // Fire celebration once per device per winning week
        if (golden && mostRecentWinWeek > -1) {
          const key = `goldenCelebrated_W${mostRecentWinWeek}`
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, '1')
            setShowCelebration(true)
          }
        }
        setLive2026Weeks(weeks || [])
      }).catch(() => {})
    }
    fetchLive()
    const id = setInterval(fetchLive, 30000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    try { localStorage.setItem('darkMode', darkMode) } catch {}
  }, [darkMode])

  useEffect(() => {
    try { localStorage.setItem('showOdds', showOdds) } catch {}
  }, [showOdds])

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifStatus('unsupported')
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {})
    if (Notification.permission === 'granted') setNotifStatus('granted')
    else if (Notification.permission === 'denied') setNotifStatus('denied')
  }, [])

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setNotifStatus('denied'); return }
      setNotifStatus('granted')
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await fetch(`${API}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), prefs: notifPrefs }),
      })
    } catch {
      setNotifStatus('denied')
    }
  }

  async function updateNotifPref(key, value) {
    const newPrefs = { ...notifPrefs, [key]: value }
    setNotifPrefs(newPrefs)
    localStorage.setItem('notif-prefs', JSON.stringify(newPrefs))
    if (notifStatus !== 'granted' || !('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch(`${API}/subscribe`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint, prefs: newPrefs }),
        })
      }
    } catch {}
  }

  async function disableNotifications() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch(`${API}/subscribe`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setNotifStatus('default')
    } catch {
      setNotifStatus('default')
    }
  }

  const season2026 = useMemo(() => ({
    year: 2026,
    players: ['BRITTON', 'CHRIS', 'COLBY', 'NATHAN', 'LUCAS', 'KADEN'],
    standings: [],
    weeks: live2026Weeks.map(w => ({
      weekNum: w.weekNum,
      picks: w.picks,
      mickeyMouse: null,
      parlayResult: (() => {
        const submitted = w.picks.filter(p => p.lock)
        if (!submitted.length) return null
        if (submitted.some(p => p.result === 'L')) return 'L'
        if (submitted.every(p => p.result === 'W' || p.result === 'P')) return 'W'
        return null
      })(),
    })),
  }), [live2026Weeks])

  const allSeasons = useMemo(() =>
    [...seasons, ...(season2026.weeks.length > 0 ? [season2026] : [])],
    [season2026]
  )

  // Exclude 2026 from liveParlayWins since it's now computed from allSeasons
  const filteredLiveParlayWins = useMemo(() =>
    liveParlayWins.filter(w => !w.weekKey?.startsWith('2026')),
    [liveParlayWins]
  )

  const dm = darkMode
  const bg = isGolden
    ? 'bg-gradient-to-b from-yellow-900 via-amber-950 to-yellow-950 text-yellow-50'
    : dm ? 'bg-slate-900 text-slate-100' : 'bg-gray-100 text-slate-900'
  const headerBg = isGolden
    ? 'bg-gradient-to-r from-yellow-800 via-amber-700 to-yellow-800 border-yellow-400/80 shadow-lg shadow-yellow-900/50'
    : dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
  const navBg = isGolden
    ? 'bg-yellow-900/90 border-yellow-500/60 shadow-md shadow-yellow-900/40'
    : dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
  const activeTab = isGolden
    ? 'bg-yellow-400 text-yellow-900 font-black shadow shadow-yellow-500/40'
    : dm ? 'bg-yellow-500 text-slate-900' : 'bg-yellow-400 text-slate-900'
  const inactiveTab = isGolden
    ? 'text-yellow-300/80 hover:text-yellow-100 hover:bg-yellow-800/60'
    : dm ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-900 hover:bg-gray-100'
  const drawerBg = dm ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'
  const sectionBg = dm ? 'bg-slate-700/50' : 'bg-gray-50'
  const divider = dm ? 'divide-slate-600/50' : 'divide-gray-200'
  const labelColor = dm ? 'text-slate-400' : 'text-slate-500'
  const borderColor = dm ? 'border-slate-700' : 'border-gray-200'

  // Fire confetti when celebration shows
  useEffect(() => {
    if (!showCelebration || celebrationFired.current) return
    celebrationFired.current = true
    const duration = 4000
    const end = Date.now() + duration
    const colors = ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff', '#fcd34d', '#d97706']
    ;(function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors })
      confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors })
      if (Date.now() < end) requestAnimationFrame(frame)
    })()
    const timer = setTimeout(() => setShowCelebration(false), 5500)
    return () => clearTimeout(timer)
  }, [showCelebration])

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300 ${isGolden ? 'golden' : ''}`}>
      {AdminModal}

      {/* Golden shimmer overlay */}
      {isGolden && (
        <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_at_top,_rgba(234,179,8,0.12)_0%,_transparent_70%)]" />
      )}

      {/* 🏆 Parlay Hit Celebration */}
      {showCelebration && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
          style={{ background: 'radial-gradient(ellipse at center, rgba(120,53,15,0.97) 0%, rgba(30,10,0,0.99) 100%)' }}
          onClick={() => setShowCelebration(false)}
        >
          {/* Gold shimmer rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-96 h-96 rounded-full border-2 border-yellow-400/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute w-64 h-64 rounded-full border-2 border-yellow-300/30 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.3s' }} />
          </div>

          {/* Content */}
          <div className="relative text-center px-8 select-none" style={{ animation: 'celebIn 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div className="text-8xl mb-4" style={{ filter: 'drop-shadow(0 0 30px rgba(234,179,8,0.8))' }}>🏆</div>
            <div
              className="text-5xl font-black tracking-widest uppercase mb-2"
              style={{ color: '#fbbf24', textShadow: '0 0 40px rgba(234,179,8,0.9), 0 0 80px rgba(234,179,8,0.5)', letterSpacing: '0.15em' }}
            >
              WE HIT
            </div>
            <div
              className="text-2xl font-black tracking-widest uppercase mb-6"
              style={{ color: '#fde68a', textShadow: '0 0 20px rgba(234,179,8,0.6)', letterSpacing: '0.2em' }}
            >
              PARLAY CASHED 💰
            </div>
            <div className="text-yellow-400/60 text-sm tracking-widest uppercase">tap to continue</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`${headerBg} border-b px-4 py-4 relative z-10`}>
        {isGolden && (
          <div className="max-w-5xl mx-auto mb-3 rounded-xl bg-gradient-to-r from-yellow-500/30 via-yellow-300/20 to-yellow-500/30 border border-yellow-400/60 px-4 py-3 text-center shadow-inner shadow-yellow-500/20">
            <span className="text-yellow-200 font-black text-base tracking-widest uppercase drop-shadow-sm">🏆 WE HIT · PARLAY CASHED · STAY GOLDEN 🏆</span>
          </div>
        )}
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="w-10" />
          <h1 className={`text-3xl font-bold text-center tracking-tight ${isGolden ? 'text-yellow-300 drop-shadow-[0_0_12px_rgba(234,179,8,0.6)]' : ''}`}>
            {isGolden ? '🏆 Locks 🔒' : 'Locks 🔒'}
          </h1>
          <button
            onClick={() => setSettingsOpen(true)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${dm ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-900 hover:bg-gray-100'}`}
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav className={`${navBg} border-b relative z-20`}>
        <div className="max-w-5xl mx-auto flex gap-1 px-2 py-2 overflow-x-auto scrollbar-none">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${tab === t ? activeTab : inactiveTab}`}
            >{t}</button>
          ))}
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-6 relative z-10">
        {tab === 'This Week' && <ThisWeek darkMode={darkMode} showOdds={showOdds} isGolden={isGolden} />}
        {tab === 'Season' && <SeasonView allSeasons={allSeasons} darkMode={darkMode} liveParlayWins={filteredLiveParlayWins} isGolden={isGolden} />}
        {tab === 'Leaderboard' && <Leaderboard allSeasons={allSeasons} isGolden={isGolden} />}
        {tab === 'Stats' && <AllTimeStats seasons={allSeasons} liveParlayWins={filteredLiveParlayWins} isGolden={isGolden} />}
        {tab === 'Crazy Odds' && <CraziestOdds seasons={allSeasons} isGolden={isGolden} />}
      </main>

      {/* Backdrop */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSettingsOpen(false)} />
      )}

      {/* Settings drawer */}
      <div className={`fixed top-0 right-0 h-full w-80 z-50 shadow-2xl transition-transform duration-300 ${settingsOpen ? 'translate-x-0' : 'translate-x-full'} ${drawerBg}`}>

        <div className={`flex items-center justify-between px-5 py-4 border-b ${borderColor}`}>
          <h2 className="font-bold text-lg">Settings</h2>
          <button onClick={() => setSettingsOpen(false)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-slate-500'}`}
          >✕</button>
        </div>

        <div className="p-5 space-y-7 overflow-y-auto h-full pb-24">

          {/* Notifications */}
          <section>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${labelColor}`}>Notifications</p>
            <div className={`rounded-xl overflow-hidden divide-y ${sectionBg} ${divider}`}>
              {notifStatus === 'unsupported' ? (
                <div className="px-4 py-3.5">
                  <p className="font-semibold text-sm mb-1">Push Notifications</p>
                  <p className={`text-xs leading-relaxed ${labelColor}`}>On iOS: tap Share → Add to Home Screen, then open from your home screen to enable notifications.</p>
                </div>
              ) : notifStatus === 'denied' ? (
                <div className="px-4 py-3.5">
                  <p className="font-semibold text-sm mb-1">Push Notifications</p>
                  <p className={`text-xs ${labelColor}`}>Blocked in browser/device settings — enable there first.</p>
                </div>
              ) : (
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span>🔔</span>
                    <div>
                      <p className="text-sm font-medium">Push Notifications</p>
                      <p className={`text-xs ${labelColor}`}>{notifStatus === 'granted' ? 'Sat 2pm + Sun 10am CST' : 'Tap to enable'}</p>
                    </div>
                  </div>
                  <Toggle
                    on={notifStatus === 'granted'}
                    onToggle={() => notifStatus === 'granted' ? disableNotifications() : enableNotifications()}
                  />
                </div>
              )}
              {notifStatus === 'granted' && (
                <div className="divide-y divide-inherit">
                  {[
                    { key: 'reminders', icon: '📅', label: 'Reminders', desc: 'Sat 2pm + Sun 2pm CST nudges' },
                    { key: 'pickAlerts', icon: '🔒', label: 'Pick Alerts', desc: 'When someone locks in' },
                    { key: 'results', icon: '✅', label: 'Results', desc: 'When any pick settles W/L' },
                    { key: 'parlay', icon: '🏆', label: 'Parlay', desc: 'Group parlay hit or bust' },
                  ].map(({ key, icon, label, desc }) => (
                    <div key={key} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{icon}</span>
                        <div>
                          <p className="text-sm font-medium">{label}</p>
                          <p className={`text-xs ${labelColor}`}>{desc}</p>
                        </div>
                      </div>
                      <Toggle
                        on={notifPrefs[key] !== false}
                        onToggle={() => updateNotifPref(key, !notifPrefs[key])}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Admin */}
          <section>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${labelColor}`}>Admin</p>
            <div className={`rounded-xl overflow-hidden ${sectionBg}`}>
              <div className="px-4 py-3.5">
                <p className="text-sm font-medium mb-1">Manual Settle</p>
                <p className={`text-xs ${labelColor} mb-3`}>Force-run auto-settle right now — use if picks haven't settled after games ended.</p>
                <button
                  onClick={() => requestAdmin(async () => {
                    setSettling(true)
                    setSettleMsg(null)
                    try {
                      const res = await fetch(`${API}/auto-settle`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `AdminHash ${ADMIN_HASH}`,
                          'Content-Type': 'application/json',
                        },
                      })
                      const data = await res.json()
                      setSettleMsg(
                        data.settled != null ? `Settled ${data.settled} pick${data.settled !== 1 ? 's' : ''}`
                        : data.message || 'Done — nothing to settle'
                      )
                    } catch {
                      setSettleMsg('Error — check network')
                    } finally {
                      setSettling(false)
                    }
                  })}
                  disabled={settling}
                  className="w-full py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm text-slate-200 font-semibold disabled:opacity-50 transition-colors"
                >
                  {settling ? '⏳ Settling…' : '⚡ Settle Now'}
                </button>
                {settleMsg && <p className={`text-xs mt-2 text-center ${settleMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{settleMsg}</p>}
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${labelColor}`}>Appearance</p>
            <div className={`rounded-xl overflow-hidden divide-y ${sectionBg} ${divider}`}>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span>{dm ? '🌙' : '☀️'}</span>
                  <span className="text-sm font-medium">{dm ? 'Dark Mode' : 'Light Mode'}</span>
                </div>
                <Toggle on={dm} onToggle={() => setDarkMode(d => !d)} />
              </div>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span>💰</span>
                  <div>
                    <p className="text-sm font-medium">Show Odds</p>
                    <p className={`text-xs ${labelColor}`}>Display odds on pick cards</p>
                  </div>
                </div>
                <Toggle on={showOdds} onToggle={() => setShowOdds(s => !s)} />
              </div>
            </div>
          </section>

          {/* About */}
          <section>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${labelColor}`}>About</p>
            <div className={`rounded-xl overflow-hidden divide-y ${sectionBg} ${divider}`}>
              {[
                { label: 'App', value: 'Viva Las Vegas Lock Tracker' },
                { label: 'Seasons', value: '2021 – 2026' },
                { label: 'Players', value: 'Britton, Chris, Colby, Nathan, Lucas, Kaden' },
                { label: 'Rules', value: 'Odds min -300 • Make money • No fading your friends\' teams' },
              ].map(({ label, value }) => (
                <div key={label} className="px-4 py-3.5">
                  <p className={`text-xs ${labelColor} mb-0.5`}>{label}</p>
                  <p className="text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
