import { useState, useEffect, useMemo } from 'react'
import { seasons } from './data.js'
import SeasonView from './components/SeasonView.jsx'
import AllTimeStats from './components/AllTimeStats.jsx'
import CraziestOdds from './components/CraziestOdds.jsx'
import ThisWeek from './components/ThisWeek.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import { API } from './api.js'
import './index.css'

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
  const [tab, setTab] = useState('This Week')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [showOdds, setShowOdds] = useState(true)
  const [notifStatus, setNotifStatus] = useState('default')
  const [liveParlayWins, setLiveParlayWins] = useState([])
  const [isGolden, setIsGolden] = useState(false)
  const [live2026Weeks, setLive2026Weeks] = useState([])
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
        setIsGolden(mostRecentWinWeek > -1 && mostRecentWinWeek > mostRecentLossWeek)
        setLive2026Weeks(weeks || [])
      }).catch(() => {})
    }
    fetchLive()
    const id = setInterval(fetchLive, 30000)
    return () => clearInterval(id)
  }, [])
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
    ? 'bg-amber-950 text-slate-100'
    : dm ? 'bg-slate-900 text-slate-100' : 'bg-gray-100 text-slate-900'
  const headerBg = isGolden
    ? 'bg-amber-900 border-yellow-500/60'
    : dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
  const navBg = isGolden
    ? 'bg-amber-900/80 border-yellow-500/40'
    : dm ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
  const activeTab = isGolden
    ? 'bg-yellow-400 text-amber-900 font-black'
    : dm ? 'bg-yellow-500 text-slate-900' : 'bg-yellow-400 text-slate-900'
  const inactiveTab = isGolden
    ? 'text-yellow-200/70 hover:text-yellow-100 hover:bg-amber-800/60'
    : dm ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-900 hover:bg-gray-100'
  const drawerBg = dm ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'
  const sectionBg = dm ? 'bg-slate-700/50' : 'bg-gray-50'
  const divider = dm ? 'divide-slate-600/50' : 'divide-gray-200'
  const labelColor = dm ? 'text-slate-400' : 'text-slate-500'
  const borderColor = dm ? 'border-slate-700' : 'border-gray-200'

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-200`}>

      {/* Header */}
      <header className={`${headerBg} border-b px-4 py-4`}>
        {isGolden && (
          <div className="max-w-5xl mx-auto mb-3 rounded-xl bg-yellow-400/20 border border-yellow-400/40 px-4 py-2 text-center">
            <span className="text-yellow-300 font-black text-sm tracking-wide">🏆 WE HIT! PARLAY CASHED — STAY GOLDEN 🏆</span>
          </div>
        )}
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="w-10" />
          <h1 className="text-3xl font-bold text-center tracking-tight">
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
      <nav className={`${navBg} border-b sticky top-0 z-10`}>
        <div className="max-w-5xl mx-auto flex gap-1 px-2 py-2 overflow-x-auto scrollbar-none">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${tab === t ? activeTab : inactiveTab}`}
            >{t}</button>
          ))}
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'This Week' && <ThisWeek darkMode={darkMode} showOdds={showOdds} />}
        {tab === 'Season' && <SeasonView allSeasons={allSeasons} darkMode={darkMode} liveParlayWins={filteredLiveParlayWins} />}
        {tab === 'Leaderboard' && <Leaderboard allSeasons={allSeasons} />}
        {tab === 'Stats' && <AllTimeStats seasons={allSeasons} liveParlayWins={filteredLiveParlayWins} />}
        {tab === 'Crazy Odds' && <CraziestOdds seasons={allSeasons} />}
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
