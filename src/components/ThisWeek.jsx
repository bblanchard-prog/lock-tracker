import { useState, useEffect, useRef } from 'react'
import { getGamesForWeek, NFL_WEEKS, getCurrentNflWeek } from '../nflSchedule.js'
import { useAdminAuth } from '../useAdminAuth.jsx'
import { API } from '../api.js'
import confetti from 'canvas-confetti'
import { useLiveGame } from '../hooks/useLiveGame.js'
import { usePlayerStat } from '../usePlayerStats.js'

const PLAYER_COLORS = {
  BRITTON: '#f59e0b', CHRIS: '#3b82f6', COLBY: '#10b981',
  NATHAN: '#a855f7', LUCAS: '#f97316', KADEN: '#06b6d4',
}
const KNOWN_PLAYERS = ['BRITTON', 'CHRIS', 'COLBY', 'NATHAN', 'LUCAS', 'KADEN']

function getColor(name) {
  return PLAYER_COLORS[name?.trim().toUpperCase()] || '#94a3b8'
}
function normalizeLockText(raw) {
  if (!raw) return raw
  let s = raw.trim()
  s = s.replace(/\b(\d+\.?\d*)\+/g, 'o$1')
  s = s.replace(/\bover\s+/i, 'o').replace(/\bunder\s+/i, 'u')
  s = s.replace(/\bO(\d)/g, 'o$1').replace(/\bU(\d)/g, 'u$1')
  const STAT_MAP = [
    [/\b(receiving yards|rec yards|rec yds)\b/i, 'Rec Yds'],
    [/\b(rush(?:ing)? yards?|rush(?:ing)? yds)\b/i, 'Rush Yds'],
    [/\b(rush(?:ing)? att(?:empts?)?)\b/i, 'Car'],
    [/\b(pass(?:ing)? yards?|pass yds)\b/i, 'Pass Yds'],
    [/\b(pass(?:ing)? att(?:empts?)?|pass att)\b/i, 'Pass Att'],
    [/\b(pass(?:ing)? tds?|td pass(?:es)?)\b/i, 'Pass TD'],
    [/\b(carries|carry|rushes|rushing|rush)\b/i, 'Car'],
    [/\b(catches|catch|receptions?)\b/i, 'Rec'],
    [/\b(touchdowns?|tds?)\b/i, 'TD'],
    [/\b(completions?|comp|cmp)\b/i, 'Comp'],
    [/\b(extra points?|pats?|xps?)\b/i, 'PAT'],
    [/\b(field goals?|fgs?|total fgs?)\b/i, 'FG'],
  ]
  for (const [re, canonical] of STAT_MAP) {
    s = s.replace(re, canonical)
  }
  return s
}
function normalizeGameString(raw) {
  if (!raw) return raw
  const sep = raw.includes('@') ? '@' : 'vs'
  const parts = raw.split(sep).map(s => s.trim().toUpperCase())
  if (parts.length !== 2 || !parts[0] || !parts[1]) return raw.trim().toUpperCase()
  return `${parts[0]} vs ${parts[1]}`
}
function formatOdds(odds) {
  if (odds === null || odds === undefined || odds === '') return null
  return Number(odds) > 0 ? `+${odds}` : `${odds}`
}
function calcParlayOdds(picks) {
  const withOdds = picks.filter(p => p.odds !== null && p.odds !== undefined)
  if (withOdds.length === 0) return null
  const dec = withOdds.reduce((acc, p) => {
    const d = p.odds > 0 ? p.odds / 100 + 1 : 100 / Math.abs(p.odds) + 1
    return acc * d
  }, 1)
  const american = dec >= 2
    ? Math.round((dec - 1) * 100)
    : Math.round(-100 / (dec - 1))
  const payout100 = Math.round((dec - 1) * 100)
  return { american, payout100 }
}

// ---- Live pick tracking helpers ----

function detectPickType(lock) {
  if (!lock) return null
  const s = lock.trim().replace(/^(take|lock[:\s]*)\s*/i, '').trim()
  if (/\bteam\s+total\b/i.test(s)) return 'team_total'
  if (/^(over|under|o|u)[\/\s]*\d/i.test(s)) return 'total'
  if (/^.+?\s*[+\-]\d+(?:\.\d+)?\s*$/.test(s)) return 'spread'
  if (/^.+?\s+(o(?:ver)?|u(?:nder)?)\s*\d+\.?\d*\s+\S+\s*$/i.test(s)) return 'prop'
  return 'ml'
}

function parseLineMeta(lock) {
  // Extract { ou, line } for total/prop/team_total displays
  const m = lock.match(/(o(?:ver)?|u(?:nder)?)\s*(\d+\.?\d*)/i)
  if (!m) return null
  return { ou: /^o/i.test(m[1]) ? 'over' : 'under', line: parseFloat(m[2]) }
}

function parseLiveMargin(lock, homeAbbr, awayAbbr, homeScore, awayScore) {
  // Returns { margin, covered } for spread/ML so we can show coverage context
  const s = lock.trim().replace(/^(take|lock[:\s]*)\s*/i, '').trim()

  // Spread
  const spreadM = s.match(/^(.+?)\s*([+\-]\d+(?:\.\d+)?)\s*$/)
  if (spreadM) {
    const spread = parseFloat(spreadM[2])
    const teamRaw = spreadM[1].trim().toUpperCase()
    const ha = homeAbbr?.toUpperCase(), aa = awayAbbr?.toUpperCase()
    const betHome = ha === teamRaw || homeAbbr?.toUpperCase().includes(teamRaw) || teamRaw.includes(ha)
    const betAway = aa === teamRaw || awayAbbr?.toUpperCase().includes(teamRaw) || teamRaw.includes(aa)
    const betScore = betHome ? homeScore : betAway ? awayScore : null
    const otherScore = betHome ? awayScore : betAway ? homeScore : null
    if (betScore === null) return null
    const margin = (betScore - otherScore) + spread
    return { margin, covered: margin > 0 }
  }

  // ML
  const teamRaw = s.replace(/\s+ml\s*$/i, '').trim().toUpperCase()
  const ha = homeAbbr?.toUpperCase(), aa = awayAbbr?.toUpperCase()
  const betHome = ha === teamRaw || teamRaw.includes(ha)
  const betAway = aa === teamRaw || teamRaw.includes(aa)
  const betScore = betHome ? homeScore : betAway ? awayScore : null
  const otherScore = betHome ? awayScore : betAway ? homeScore : null
  if (betScore === null) return null
  return { margin: betScore - otherScore, covered: betScore > otherScore }
}

function ProgressBar({ current, target, ou }) {
  if (target == null || target === 0) return null
  const pct = Math.min(100, Math.round((current / target) * 100))
  const over = ou === 'over'
  const hit = over ? current > target : current < target
  const barColor = hit ? 'bg-green-400' : current === target ? 'bg-yellow-400' : over ? 'bg-yellow-400' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden w-24">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono ${hit ? 'text-green-400' : 'text-slate-400'}`}>
        {current}{over ? '' : ''} / {over ? 'o' : 'u'}{target}
      </span>
    </div>
  )
}

function LivePickStrip({ pick, weekNum }) {
  const type = detectPickType(pick.lock)
  const isProp = type === 'prop'
  const isTotal = type === 'total' || type === 'team_total'

  // Game-score hook for spread/ML/total/team_total
  const gameData = useLiveGame(isProp ? null : pick.game, weekNum)

  // Prop stat hook (live polling every 60s when no result yet)
  const { data: propData } = usePlayerStat(
    2026, weekNum, isProp ? pick.lock : null, isProp, 60000
  )

  if (pick.result) return null

  // ---- Prop picks ----
  if (isProp && propData) {
    const actual = propData.actual != null ? parseFloat(propData.actual) : null
    const { line, ou } = propData
    const gameStatus = propData.gameStatus || 'pre'
    if (gameStatus === 'pre' || actual === null) return null

    const label = propData.label || ''
    const periodStr = propData.period ? `Q${propData.period}` : ''
    const clockStr = propData.clock ? ` ${propData.clock}` : ''
    const liveTag = gameStatus === 'in'
      ? <span className="text-red-400 font-bold text-xs mr-1">● </span>
      : <span className="text-slate-500 text-xs mr-1">FINAL </span>

    return (
      <div className="mt-1">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          {liveTag}
          <span>{propData.playerName || ''}</span>
          {gameStatus === 'in' && periodStr && <span>· {periodStr}{clockStr}</span>}
        </div>
        <ProgressBar current={actual} target={line} ou={ou} />
        <span className="text-xs text-slate-500">{actual} {label}</span>
      </div>
    )
  }

  // ---- Game score picks (spread/ML/total/team_total) ----
  if (!gameData || gameData.status === 'pre') return null

  const { status, homeScore, awayScore, homeAbbr, awayAbbr, period, clock } = gameData
  if (homeScore == null || awayScore == null) return null

  const periodStr = period ? `Q${period}` : ''
  const clockStr = clock ? ` ${clock}` : ''
  const statusStr = status === 'final' ? 'FINAL' : status === 'in' ? `${periodStr}${clockStr}` : ''
  const liveTag = status === 'in'
    ? <span className="text-red-400 font-bold text-xs">● </span>
    : <span className="text-slate-500 text-xs">FINAL · </span>

  // Total picks — show combined score progress bar
  if (isTotal) {
    const meta = parseLineMeta(pick.lock)
    if (!meta) return null
    const isTeamTotal = type === 'team_total'
    const teamAbbr = isTeamTotal
      ? pick.lock.trim().split(/\s+/)[0].toUpperCase()
      : null
    const betTeamScore = isTeamTotal
      ? (homeAbbr?.toUpperCase() === teamAbbr ? homeScore : awayScore)
      : null
    const current = isTeamTotal ? betTeamScore : homeScore + awayScore

    return (
      <div className="mt-1">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          {liveTag}
          <span>{isTeamTotal
            ? `${teamAbbr} ${betTeamScore}`
            : `${homeAbbr} ${homeScore}, ${awayAbbr} ${awayScore} · Total ${homeScore + awayScore}`
          }</span>
          {status === 'in' && <span>· {statusStr}</span>}
        </div>
        <ProgressBar current={current} target={meta.line} ou={meta.ou} />
      </div>
    )
  }

  // Spread / ML — show score + coverage context
  const marginData = parseLiveMargin(pick.lock, homeAbbr, awayAbbr, homeScore, awayScore)
  const coverStr = marginData
    ? marginData.covered
      ? `covering by ${Math.abs(marginData.margin).toFixed(marginData.margin % 1 === 0 ? 0 : 1)}`
      : `trailing by ${Math.abs(marginData.margin).toFixed(Math.abs(marginData.margin) % 1 === 0 ? 0 : 1)}`
    : ''

  return (
    <div className="mt-1 flex items-center gap-2 text-xs">
      {liveTag}
      <span className="text-slate-400">{homeAbbr} {homeScore}, {awayAbbr} {awayScore}</span>
      {status === 'in' && <span className="text-slate-500">· {statusStr}</span>}
      {coverStr && (
        <span className={marginData?.covered ? 'text-green-400' : 'text-orange-400'}>
          · {coverStr}
        </span>
      )}
    </div>
  )
}

const RULES = [
  "Odds minimum -300",
  "Make money",
  "No fading your friends' teams",
  "Sole loser of the week earns the Mickey Mouse 🐭",
]

function groupGamesBySlot(scheduleGames) {
  // Preserve the server's chronological order — group by slot but maintain original sequence
  const groups = {}
  const slotOrder = []
  for (const g of scheduleGames) {
    const slot = g.slot || g.day || 'Other'
    if (!groups[slot]) { groups[slot] = []; slotOrder.push(slot) }
    groups[slot].push(g)
  }
  return slotOrder.map(s => ({ slot: s, games: groups[s] }))
}

export default function ThisWeek({ compactMode, showOdds }) {
  const { request, Modal } = useAdminAuth()
  const [selectedWeek, setSelectedWeek] = useState(() => getCurrentNflWeek())
  const [picks, setPicks] = useState([])
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [form, setForm] = useState({ player: '', game: '', lock: '', odds: '' })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [customGame, setCustomGame] = useState('')
  const [scheduleGames, setScheduleGames] = useState(null)

  const weekKey = `2026-NFL-W${String(selectedWeek).padStart(2, '0')}`
  const staticGames = getGamesForWeek(selectedWeek)
  const submittedPlayers = new Set(picks.map(p => p.player.trim().toUpperCase()))
  const waiting = KNOWN_PLAYERS.filter(p => !submittedPlayers.has(p))
  const allIn = waiting.length === 0 && picks.length === KNOWN_PLAYERS.length
  const picksWithOdds = picks.filter(p => p.odds !== null && p.odds !== undefined)
  const parlay = picksWithOdds.length > 0 ? calcParlayOdds(picks) : null

  // Auto-compute parlay result
  // L: as soon as any pick loses
  // W: all submitted picks settled as W or P (no requirement for all 6 to submit)
  const anyLoss = picks.some(p => p.result === 'L')
  const allSettled = picks.length > 0 && picks.every(p => p.result === 'W' || p.result === 'P')
  const parlayResult = anyLoss ? 'L' : allSettled ? 'W' : null

  async function setPickResult(player, result) {
    const res = await fetch(`${API}/picks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week: weekKey, player, result }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      console.error('PATCH picks failed:', res.status, d)
    }
    await fetchPicks(weekKey)
  }
  const prevPicksLength = useRef(null)

  useEffect(() => {
    if (
      prevPicksLength.current !== null &&
      picks.length === KNOWN_PLAYERS.length &&
      prevPicksLength.current === KNOWN_PLAYERS.length - 1
    ) {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#f97316', '#06b6d4'] })
    }
    prevPicksLength.current = picks.length
  }, [picks])

  async function fetchPicks(wk) {
    setLoading(true)
    try {
      const res = await fetch(`${API}/picks?week=${wk}`)
      const data = await res.json()
      setPicks(data.picks || [])
      setServerError(null)
    } catch {
      setServerError('Cannot reach server — is the app running with `npm run dev`?')
    } finally {
      setLoading(false)
    }
  }

  async function fetchSchedule(week) {
    try {
      const res = await fetch(`${API}/schedule?week=${week}`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      const games = Array.isArray(data) ? data : Array.isArray(data?.games) ? data.games : null
      setScheduleGames(games)
    } catch {
      setScheduleGames(null)
    }
  }

  useEffect(() => {
    fetchPicks(weekKey)
    const id = setInterval(() => fetchPicks(weekKey), 8000)
    return () => clearInterval(id)
  }, [weekKey])

  useEffect(() => {
    setScheduleGames(null)
    fetchSchedule(selectedWeek)
  }, [selectedWeek])

  function validate() {
    if (!form.player) return 'Select your name'
    if (submittedPlayers.has(form.player.trim().toUpperCase())) {
      return `${form.player} already has a lock in for Week ${selectedWeek}. Remove it first to change.`
    }
    const rawGame = form.game === '__other__' ? customGame.trim() : form.game
    const gameVal = normalizeGameString(rawGame)
    if (!gameVal) return 'Pick a game'
    if (!form.lock.trim()) return 'Enter your lock'
    if (form.odds) {
      const o = Number(form.odds)
      if (isNaN(o)) return 'Odds must be a number (e.g. -110 or +150)'
      if (o < -300) return 'Odds minimum is -300 — no chalk locks!'
      if (o > -100 && o < 100) return 'Odds must be -100 or lower, or +100 or higher'
    }
    return null
  }

  async function doSubmit() {
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError(null)
    setSubmitting(true)
    const gameVal = normalizeGameString(form.game === '__other__' ? customGame.trim() : form.game)
    try {
      const res = await fetch(`${API}/picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week: weekKey,
          player: form.player,
          sport: 'NFL',
          game: gameVal,
          lock: normalizeLockText(form.lock.trim()),
          odds: form.odds ? Number(form.odds) : null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setFormError(d.error || 'Submit failed')
        return
      }
      setSubmitted(true)
      setForm({ player: '', game: '', lock: '', odds: '' })
      setCustomGame('')
      await fetchPicks(weekKey)
      setTimeout(() => setSubmitted(false), 3000)
    } catch {
      setFormError('Submit failed — server may be down')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    doSubmit()
  }

  async function doDelete(player) {
    await fetch(`${API}/picks?week=${encodeURIComponent(weekKey)}&player=${encodeURIComponent(player)}`, {
      method: 'DELETE',
    })
    await fetchPicks(weekKey)
  }

  function handleDelete(player) {
    doDelete(player)
  }

  return (
    <div className="space-y-5">
      {Modal}
      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">
          {serverError}
        </div>
      )}

      {/* Week selector */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="text-slate-400 text-xs block mb-2">2026 NFL Season — Select Week</label>
        <div className="flex flex-wrap gap-2">
          {NFL_WEEKS.map(w => (
            <button
              key={w}
              onClick={() => setSelectedWeek(w)}
              className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                selectedWeek === w
                  ? 'bg-yellow-500 text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-wrap gap-4 items-center">
        <div>
          <div className="text-slate-400 text-xs">Week</div>
          <div className="text-2xl font-black text-yellow-400">{selectedWeek}</div>
        </div>
        <div>
          <div className="text-slate-400 text-xs">Picks In</div>
          <div className="text-2xl font-black text-green-400">{picks.length} / {KNOWN_PLAYERS.length}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-slate-400 text-xs mb-1">
            {waiting.length > 0 ? 'Waiting on:' : ''}
          </div>
          <div className="flex flex-wrap gap-1">
            {waiting.map(p => (
              <span key={p} className="text-xs px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300">
                {p}
              </span>
            ))}
            {allIn && (
              <span className="text-green-400 font-semibold text-sm">✅ All locks in!</span>
            )}
          </div>
        </div>
      </div>

      {/* Parlay — running when partial, full reveal when all 6 in */}
      {parlay && (
        allIn ? (
          <div className="bg-gradient-to-r from-yellow-900/40 to-green-900/30 rounded-xl border border-yellow-500/40 p-5 text-center">
            <div className="text-yellow-300 text-sm font-semibold mb-1">💰 This Week's Group Parlay</div>
            <div className="text-5xl font-black text-yellow-400 my-2">
              {parlay.american > 0 ? `+${parlay.american}` : parlay.american}
            </div>
            <div className="text-slate-400 text-sm">
              ${parlay.payout100} profit on a $100 bet
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/60 rounded-xl border border-slate-600/40 p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-0.5">Running Parlay</div>
              <div className="text-slate-500 text-xs">{picksWithOdds.length} / {KNOWN_PLAYERS.length} picks locked</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-black text-slate-300">
                {parlay.american > 0 ? `+${parlay.american}` : parlay.american}
              </div>
              <div className="text-slate-500 text-xs">${parlay.payout100} / $100</div>
            </div>
          </div>
        )
      )}

      {/* Submit form */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="font-semibold text-slate-200 mb-4">🔒 Submit Your Lock — Week {selectedWeek}</h2>

        {formError && (
          <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-3 text-sm">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Player */}
            <div>
              <label className="text-slate-400 text-xs block mb-1">Your Name</label>
              <select
                value={form.player}
                onChange={e => { setForm(f => ({ ...f, player: e.target.value })); setFormError(null) }}
                className="w-full bg-slate-700 text-slate-100 rounded-lg px-3 py-2.5 border border-slate-600 text-sm"
              >
                <option value="">— select —</option>
                {KNOWN_PLAYERS.map(p => {
                  const alreadyIn = submittedPlayers.has(p)
                  return (
                    <option key={p} value={p}>
                      {p}{alreadyIn ? ' ✓' : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Odds */}
            <div>
              <label className="text-slate-400 text-xs block mb-1">
                Odds <span className="text-slate-500">(-300 min, e.g. -110 or +150)</span>
              </label>
              <input
                type="number"
                value={form.odds}
                onChange={e => { setForm(f => ({ ...f, odds: e.target.value })); setFormError(null) }}
                placeholder="-110"
                className="w-full bg-slate-700 text-slate-100 rounded-lg px-3 py-2.5 border border-slate-600 text-sm"
              />
            </div>

            {/* Game picker */}
            <div className="sm:col-span-2">
              <label className="text-slate-400 text-xs block mb-1">Game</label>
              <select
                value={form.game}
                onChange={e => { setForm(f => ({ ...f, game: e.target.value })); setFormError(null) }}
                className="w-full bg-slate-700 text-slate-100 rounded-lg px-3 py-2.5 border border-slate-600 text-sm"
              >
                <option value="">— pick a game —</option>
                {scheduleGames ? (
                  groupGamesBySlot(scheduleGames).map(({ slot, games: slotGames }) => (
                    <optgroup key={slot} label={slot}>
                      {slotGames.map(g => {
                        const label = g.label || ''
                        const displayTime = g.timeET && g.timeCT ? `  •  ${g.timeET} ET / ${g.timeCT} CT` : ''
                        return (
                          <option key={label} value={label}>
                            {label}{displayTime}
                          </option>
                        )
                      })}
                    </optgroup>
                  ))
                ) : (
                  staticGames.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))
                )}
                <option value="__other__">Other / type in</option>
              </select>
              {form.game === '__other__' && (
                <input
                  type="text"
                  value={customGame}
                  onChange={e => { setCustomGame(e.target.value); setFormError(null) }}
                  placeholder="Type matchup (e.g. KC vs BUF)"
                  className="w-full mt-2 bg-slate-700 text-slate-100 rounded-lg px-3 py-2.5 border border-slate-600 text-sm"
                />
              )}
            </div>

            {/* Lock */}
            <div className="sm:col-span-2">
              <label className="text-slate-400 text-xs block mb-1">
                Your Lock <span className="text-slate-500">(e.g. KC ML, Bills -6.5, Mahomes o2.5 TD)</span>
              </label>
              <input
                type="text"
                value={form.lock}
                onChange={e => { setForm(f => ({ ...f, lock: e.target.value })); setFormError(null) }}
                placeholder="Your pick"
                className="w-full bg-slate-700 text-slate-100 rounded-lg px-3 py-2.5 border border-slate-600 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              {submitting ? 'Locking in…' : '🔒 Lock It In'}
            </button>
            {submitted && (
              <span className="text-green-400 text-sm font-semibold">✅ Pick locked!</span>
            )}
          </div>
        </form>
      </div>

      {/* Picks board */}
      {picks.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-200">Week {selectedWeek} Locks</h2>
            <div className="flex items-center gap-2">
              {parlayResult && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                  parlayResult === 'W' ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
                }`}>PARLAY {parlayResult}</span>
              )}
              {loading && <span className="text-slate-500 text-xs">refreshing…</span>}
            </div>
          </div>
          <div className="divide-y divide-slate-700/50">
            {picks.map(pick => (
              <div key={pick.player} className={`flex items-center gap-3 px-4 ${compactMode ? 'py-2' : 'py-3'}`}>
                <div className={`w-2 rounded-full shrink-0 ${compactMode ? 'h-7' : 'h-10'}`} style={{ background: getColor(pick.player) }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm" style={{ color: getColor(pick.player) }}>
                      {pick.player}
                    </span>
                    {pick.game && (
                      <span className="text-slate-500 text-xs">{pick.game}</span>
                    )}
                  </div>
                  <div className="text-slate-100 text-sm font-medium">{pick.lock}</div>
                  <LivePickStrip pick={pick} weekNum={selectedWeek} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {showOdds !== false && formatOdds(pick.odds) && (
                    <span className={`font-mono font-bold text-sm mr-2 ${pick.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                      {formatOdds(pick.odds)}
                    </span>
                  )}
                  {['W', 'L', 'P'].map(r => (
                    <button key={r} onClick={() => setPickResult(pick.player, pick.result === r ? null : r)}
                      className={`text-xs font-bold w-7 h-6 rounded border transition-all ${
                        pick.result === r
                          ? r === 'W' ? 'bg-green-500/30 text-green-300 border-green-500/50'
                            : r === 'L' ? 'bg-red-500/30 text-red-300 border-red-500/50'
                            : 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50'
                          : 'bg-transparent text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
                      }`}>{r}</button>
                  ))}
                </div>
                <button
                  onClick={() => handleDelete(pick.player)}
                  className="text-slate-600 hover:text-red-400 transition-colors ml-1 p-1 rounded"
                  title="Remove pick"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {picks.length === 0 && !loading && !serverError && (
        <div className="text-center py-10 text-slate-500">
          No picks yet for Week {selectedWeek}. Be the first to lock in ☝️
        </div>
      )}

      {/* Rules */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Rules</h3>
        <ul className="space-y-1.5">
          {RULES.map((r, i) => (
            <li key={i} className="text-slate-400 text-sm flex gap-2">
              <span className="text-yellow-500 shrink-0">•</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
