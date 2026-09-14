import { useState, useMemo, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAdminAuth } from '../useAdminAuth.jsx'
import PickHeatmap from './PickHeatmap.jsx'
import PlayerProfileModal from './PlayerProfileModal.jsx'
import { useScores } from '../useScores.js'
import { findEspnGame, matchPickToScore, buildOutcomeString, findGameForProp } from '../scoreUtils.js'
import { parsePropIntent } from '../teamUtils.js'
import { usePlayerStat } from '../usePlayerStats.js'

import { API } from '../api.js'
const MEDALS = ['🥇', '🥈', '🥉']

const PLAYER_COLORS = {
  BRITTON: '#f59e0b',
  CHRIS: '#3b82f6',
  COLBY: '#10b981',
  NATHAN: '#a855f7',
  SEAN: '#ef4444',
  LUCAS: '#f97316',
  KADEN: '#06b6d4',
}

function getColor(name) {
  return PLAYER_COLORS[name?.trim().toUpperCase()] || '#94a3b8'
}

function formatOdds(odds) {
  if (odds === null || odds === undefined) return '—'
  return odds > 0 ? `+${odds}` : `${odds}`
}

function calcParlayOdds(picks) {
  const withOdds = picks.filter(p => p.odds !== null && p.odds !== undefined)
  if (withOdds.length === 0) return null
  const dec = withOdds.reduce((acc, p) => {
    const d = p.odds > 0 ? p.odds / 100 + 1 : 100 / Math.abs(p.odds) + 1
    return acc * d
  }, 1)
  const american = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1))
  const payout = Math.round((dec - 1) * 100)
  return { american, payout, partial: withOdds.length < picks.length }
}

function getSeasonChampion(season) {
  const wins = {}
  for (const week of season.weeks) {
    for (const pick of week.picks) {
      if (pick.result === 'W') {
        const p = pick.player.trim().toUpperCase()
        wins[p] = (wins[p] || 0) + 1
      }
    }
  }
  const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1])
  if (!sorted.length) return null
  const topWins = sorted[0][1]
  const tied = sorted.filter(([, w]) => w === topWins)
  return { player: tied.length === 1 ? sorted[0][0] : null, wins: topWins, tied: tied.map(([p]) => p) }
}

function buildProgressData(season) {
  const playerSet = new Set()
  season.weeks.forEach(w => w.picks.forEach(p => playerSet.add(p.player.trim().toUpperCase())))
  const players = [...playerSet]
  const totals = {}
  players.forEach(p => (totals[p] = 0))
  const data = []
  for (const week of season.weeks) {
    if (!week.picks.some(p => p.result)) continue
    for (const pick of week.picks) {
      if (pick.result === 'W') totals[pick.player.trim().toUpperCase()]++
    }
    const point = { week: `Wk ${week.weekNum}` }
    players.forEach(p => (point[p] = totals[p]))
    data.push(point)
  }
  return { data, players }
}

function ResultBadge({ result, didNotPlace }) {
  if (didNotPlace) return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">DNP</span>
  if (!result) return <span className="text-slate-600 text-xs">—</span>
  const styles = {
    W: 'bg-green-500/20 text-green-400 border border-green-500/30',
    L: 'bg-red-500/20 text-red-400 border border-red-500/30',
    P: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  }
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${styles[result] || ''}`}>{result}</span>
}

function ScoreInput({ pick, year, weekNum, onSaved }) {
  const [val, setVal] = useState(pick.outcome || '')
  const savedVal = pick.outcome || ''

  useEffect(() => { setVal(pick.outcome || '') }, [pick.outcome])

  async function commit() {
    const trimmed = val.trim()
    if (trimmed === savedVal) return
    await fetch(`${API}/overrides?year=${year}&week=${weekNum}&player=${pick.player.trim().toUpperCase()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: trimmed || null }),
    })
    onSaved()
  }

  return (
    <input
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
      placeholder="final score…"
      className="mt-1 w-full max-w-[160px] bg-transparent text-slate-500 hover:text-slate-400 text-xs border-b border-slate-700/40 focus:border-slate-500 focus:text-slate-300 outline-none placeholder-slate-700 transition-colors"
    />
  )
}

function PropStatLine({ year, weekNum, pick }) {
  const intent = parsePropIntent(pick.lock)
  const { data } = usePlayerStat(year, weekNum, pick.lock, !!intent)
  if (!intent || !data) return null
  if (!data.playerName || data.actual == null) {
    if (!data.gameShortName) return null
    const hit = intent.ou === 'under'
    return (
      <div className="text-xs text-slate-500 mt-0.5">
        {intent.playerFrag}: <span className="text-slate-300 font-medium">DNP</span>
        <span className={`ml-1 ${hit ? 'text-green-400' : 'text-red-400'}`}>{hit ? '· hit' : '· miss'}</span>
      </div>
    )
  }
  const val = parseFloat(data.actual)
  const hit = intent.ou === 'over' ? val > intent.line : val < intent.line
  return (
    <div className="text-xs text-slate-500 mt-0.5">
      {data.playerName}: <span className="text-slate-300 font-medium">{data.actual} {data.label}</span>
      <span className={`ml-1 ${hit ? 'text-green-400' : 'text-red-400'}`}>{hit ? '· hit' : '· miss'}</span>
    </div>
  )
}

function EditRow({ year, week, pick, onSaved, onCancel }) {
  const [form, setForm] = useState({
    game: pick.game || '',
    lock: pick.lock || '',
    odds: pick.odds !== null && pick.odds !== undefined ? String(pick.odds) : '',
    result: pick.result || '',
    sport: pick.sport || 'NFL',
    outcome: pick.outcome || '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const body = {
      game: form.game || null,
      lock: form.lock || null,
      odds: form.odds !== '' ? Number(form.odds) : null,
      result: form.result || null,
      sport: form.sport || null,
      outcome: form.outcome || null,
    }
    await fetch(`${API}/overrides?year=${year}&week=${week}&player=${pick.player}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    onSaved()
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <tr className="border-b border-slate-700/40">
      <td colSpan={7} className="p-0">
        <div className="bg-blue-900/20 border-l-2 border-blue-500 px-4 py-3 space-y-2">
          <div className="text-xs font-semibold text-blue-300 mb-1">
            Editing <span style={{ color: getColor(pick.player) }}>{pick.player}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-slate-500 text-xs block mb-0.5">Sport</label>
              <input value={form.sport} onChange={e => set('sport', e.target.value)} className="w-full bg-slate-700 text-slate-100 rounded px-2 py-1.5 text-xs border border-slate-600" />
            </div>
            <div>
              <label className="text-slate-500 text-xs block mb-0.5">Game</label>
              <input value={form.game} onChange={e => set('game', e.target.value)} placeholder="e.g. KC vs BUF" className="w-full bg-slate-700 text-slate-100 rounded px-2 py-1.5 text-xs border border-slate-600" />
            </div>
            <div>
              <label className="text-slate-500 text-xs block mb-0.5">Pick / Lock</label>
              <input value={form.lock} onChange={e => set('lock', e.target.value)} placeholder="Bills -6.5" className="w-full bg-slate-700 text-slate-100 rounded px-2 py-1.5 text-xs border border-slate-600" />
            </div>
            <div>
              <label className="text-slate-500 text-xs block mb-0.5">Odds</label>
              <input type="number" value={form.odds} onChange={e => set('odds', e.target.value)} placeholder="-110" className="w-full bg-slate-700 text-slate-100 rounded px-2 py-1.5 text-xs border border-slate-600" />
            </div>
            <div>
              <label className="text-slate-500 text-xs block mb-0.5">Result</label>
              <select value={form.result} onChange={e => set('result', e.target.value)} className="w-full bg-slate-700 text-slate-100 rounded px-2 py-1.5 text-xs border border-slate-600">
                <option value="">—</option>
                <option value="W">W</option>
                <option value="L">L</option>
                <option value="P">P</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-slate-500 text-xs block mb-0.5">Final Score / Stat</label>
              <input value={form.outcome} onChange={e => set('outcome', e.target.value)} placeholder="e.g. DET 31, GB 24 or Mahomes 2 TD 280 yds" className="w-full bg-slate-700 text-slate-100 rounded px-2 py-1.5 text-xs border border-slate-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={saving} className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={onCancel} className="text-xs bg-slate-600 hover:bg-slate-500 text-slate-200 px-3 py-1.5 rounded">Cancel</button>
          </div>
        </div>
      </td>
    </tr>
  )
}

function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0f172a',
      border: '1px solid #475569',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
      pointerEvents: 'none',
    }}>
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>Week {label}</p>
      {payload.map(entry => (
        <p key={entry.dataKey} style={{ color: entry.color, fontSize: 12, margin: '2px 0', fontWeight: 600 }}>
          {entry.dataKey}: {entry.value}
        </p>
      ))}
    </div>
  )
}

function WinProgressChart({ progressResult, season }) {
  const [activeTooltip, setActiveTooltip] = useState(null)

  const handleMouseLeave = useCallback(() => setActiveTooltip(null), [])

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <h2 className="font-semibold text-slate-200 mb-4">{season.year} Win Progress</h2>
      <div onMouseLeave={handleMouseLeave} onTouchEnd={handleMouseLeave}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={progressResult.data}
            onMouseLeave={handleMouseLeave}
          >
            <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              content={<CustomChartTooltip />}
              cursor={{ stroke: '#475569', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Legend />
            {progressResult.players.map(p => (
              <Line key={p} type="monotone" dataKey={p} stroke={getColor(p)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function SeasonView({ allSeasons, liveParlayWins = [] }) {
  const years = useMemo(() => allSeasons.map(s => s.year).sort((a, b) => b - a), [allSeasons])
  const [selectedYear, setSelectedYear] = useState(years[0])
  const [expandedWeek, setExpandedWeek] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [editingKey, setEditingKey] = useState(null)
  const [shamePlayer, setShamePlayer] = useState(null)
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [expandedParlay, setExpandedParlay] = useState(null)
  const [weekOverrides, setWeekOverrides] = useState({})
  const { request, Modal } = useAdminAuth()

  useEffect(() => {
    fetch(`${API}/overrides`).then(r => r.json()).then(setOverrides).catch(() => {})
    fetch(`${API}/week-overrides`).then(r => r.json()).then(setWeekOverrides).catch(() => {})
  }, [])

  function reloadOverrides() {
    fetch(`${API}/overrides`).then(r => r.json()).then(setOverrides).catch(() => {})
    fetch(`${API}/week-overrides`).then(r => r.json()).then(setWeekOverrides).catch(() => {})
  }

  async function setParlayResult(year, weekNum, result) {
    await fetch(`${API}/week-overrides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, weekNum, parlayResult: result }),
    })
    reloadOverrides()
  }

  function applyOverrides(year, weekNum, picks) {
    return picks.map(pick => {
      const key = `${year}-${weekNum}-${pick.player.trim().toUpperCase()}`
      if (!overrides[key]) return pick
      const ov = Object.fromEntries(Object.entries(overrides[key]).filter(([, v]) => v !== null && v !== undefined))
      return { ...pick, ...ov, _overridden: true }
    })
  }

  // Seasons with overrides merged in
  const seasonsWithOverrides = useMemo(() => allSeasons.map(s => ({
    ...s,
    weeks: s.weeks.map(w => {
      const wk = `${s.year}-${w.weekNum}`
      const wo = weekOverrides[wk]
      return {
        ...w,
        parlayResult: wo?.parlayResult !== undefined ? wo.parlayResult : w.parlayResult,
        picks: applyOverrides(s.year, w.weekNum, w.picks),
      }
    }),
  })), [allSeasons, overrides, weekOverrides])

  const isAllTime = selectedYear === 'all-time'
  const season = isAllTime ? null : seasonsWithOverrides.find(s => s.year === selectedYear)

  // ── All-time data ──
  const lifetimeWins = {}, lifetimeLosses = {}, lifetimeMickeys = {}
  const oddsSum = {}, oddsCount = {}
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      for (const pick of week.picks) {
        const p = pick.player.trim().toUpperCase()
        if (pick.result === 'W') lifetimeWins[p] = (lifetimeWins[p] || 0) + 1
        if (pick.result === 'L') lifetimeLosses[p] = (lifetimeLosses[p] || 0) + 1
        if (pick.odds !== null && pick.odds !== undefined) {
          const dec = pick.odds > 0 ? pick.odds / 100 + 1 : 100 / Math.abs(pick.odds) + 1
          oddsSum[p] = (oddsSum[p] || 0) + dec
          oddsCount[p] = (oddsCount[p] || 0) + 1
        }
      }
      if (week.mickeyMouse) {
        const p = week.mickeyMouse.trim().toUpperCase()
        lifetimeMickeys[p] = (lifetimeMickeys[p] || 0) + 1
      }
    }
  }

  // ── Current scope standings ──
  const scopeWins = {}, scopeLosses = {}, scopePushes = {}, scopeOddsSum = {}, scopeOddsCount = {}
  const scopeSeasons = isAllTime ? seasonsWithOverrides : [season].filter(Boolean)
  for (const s of scopeSeasons) {
    for (const week of s.weeks) {
      for (const pick of week.picks) {
        const p = pick.player.trim().toUpperCase()
        if (pick.result === 'W') scopeWins[p] = (scopeWins[p] || 0) + 1
        else if (pick.result === 'L') scopeLosses[p] = (scopeLosses[p] || 0) + 1
        else if (pick.result === 'P') scopePushes[p] = (scopePushes[p] || 0) + 1
        if (pick.odds !== null && pick.odds !== undefined) {
          const dec = pick.odds > 0 ? pick.odds / 100 + 1 : 100 / Math.abs(pick.odds) + 1
          scopeOddsSum[p] = (scopeOddsSum[p] || 0) + dec
          scopeOddsCount[p] = (scopeOddsCount[p] || 0) + 1
        }
      }
    }
  }

  function avgOdds(player) {
    if (!scopeOddsCount[player]) return null
    const dec = scopeOddsSum[player] / scopeOddsCount[player]
    return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1))
  }

  const standings = Object.keys({ ...scopeWins, ...scopeLosses, ...scopePushes })
    .map(player => ({
      player,
      wins: scopeWins[player] || 0,
      losses: scopeLosses[player] || 0,
      pushes: scopePushes[player] || 0,
      avgOdds: avgOdds(player),
    }))
    .sort((a, b) => (b.wins) - (a.wins))

  // ── Season champions ──
  const seasonChampions = years.map(y => {
    const s = seasonsWithOverrides.find(x => x.year === y)
    return { year: y, ...getSeasonChampion(s) }
  })

  const allTimeChamp = (() => {
    const sorted = Object.entries(lifetimeWins).sort((a, b) => b[1] - a[1])
    if (!sorted.length) return null
    const topWins = sorted[0][1]
    const tied = sorted.filter(([, w]) => w === topWins)
    return { player: tied.length === 1 ? sorted[0][0] : null, wins: topWins, tied: tied.map(([p]) => p) }
  })()

  // ── Parlay wins wall ──
  const parlayWins = []
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      if (week.parlayResult === 'W') {
        parlayWins.push({ year: s.year, weekNum: week.weekNum, picks: week.picks, parlay: calcParlayOdds(week.picks) })
      }
    }
  }
  // Add live 2026 wins (4+ picks submitted, all W/P)
  for (const w of liveParlayWins) {
    const alreadyIn = parlayWins.some(pw => pw.year === 2026 && pw.weekNum === w.weekNum)
    if (!alreadyIn) {
      parlayWins.push({ year: 2026, weekNum: w.weekNum, picks: w.picks, parlay: calcParlayOdds(w.picks) })
    }
  }
  parlayWins.sort((a, b) => b.year - a.year || b.weekNum - a.weekNum)

  // ── Mickey history ──
  const mickeyHistory = {}
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      if (week.mickeyMouse) {
        const p = week.mickeyMouse.trim().toUpperCase()
        if (!mickeyHistory[p]) mickeyHistory[p] = []
        const losingPick = week.picks.find(pk => pk.player.trim().toUpperCase() === p)
        mickeyHistory[p].push({ year: s.year, weekNum: week.weekNum, pick: losingPick || null })
      }
    }
  }

  // ── Player history ──
  const playerHistory = {}
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      for (const pick of week.picks) {
        if (!pick.result && !pick.lock) continue
        const p = pick.player.trim().toUpperCase()
        if (!playerHistory[p]) playerHistory[p] = []
        playerHistory[p].push({ year: s.year, weekNum: week.weekNum, pick, mickeyMouse: week.mickeyMouse })
      }
    }
  }

  // ── ESPN scores for week deep-dive ──
  const nflWeekNums = useMemo(() => {
    if (!season) return []
    return season.weeks
      .filter(w => w.picks.some(p => !p.sport || p.sport === 'NFL'))
      .map(w => w.weekNum)
  }, [season])
  const espnScores = useScores(season?.year, nflWeekNums)

  function resolveWeekOutcome(pick, weekNum) {
    if (pick.outcome) return pick.outcome
    if (pick.sport && pick.sport !== 'NFL') return null
    const games = espnScores[`${season?.year}-${weekNum}`]
    if (!games?.length) return null
    const espnGame = pick.game
      ? findEspnGame(games, pick.game)
      : findGameForProp(games, pick.lock)
    if (!espnGame) return null
    const matched = matchPickToScore(espnGame, pick.game || '', pick.lock)
    return matched?.outcome ?? buildOutcomeString(espnGame)
  }

  // ── Season-level data ──
  const progressResult = season ? buildProgressData(season) : null
  const completedWeeks = season ? season.weeks.filter(w => w.picks.some(p => p.result)) : []
  const seasonParW = completedWeeks.filter(w => w.parlayResult === 'W').length
  const seasonParL = completedWeeks.filter(w => w.parlayResult === 'L').length

  // Derive players from actual picks (fixes KADEN missing from 2024)
  const heatmapPlayers = season
    ? [...new Set(season.weeks.flatMap(w => w.picks.map(p => p.player.trim().toUpperCase())))]
    : []

  return (
    <div className="space-y-4">
      {Modal}

      {/* Year selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-slate-400 text-sm font-medium">View:</span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setSelectedYear('all-time'); setExpandedWeek(null) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              isAllTime ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >All-Time</button>
          {years.map(y => (
            <button
              key={y}
              onClick={() => { setSelectedYear(y); setExpandedWeek(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                selectedYear === y ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >{y}</button>
          ))}
        </div>
      </div>

      {/* ═══════════════ ALL-TIME VIEW ═══════════════ */}
      {isAllTime && (
        <>
          {/* ── Parlay Wins Wall — hero, top of all-time ── */}
          {parlayWins.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{
              background: 'linear-gradient(135deg, #1a1200 0%, #2d1f00 30%, #1a1200 60%, #2d1f00 100%)',
              border: '2px solid #b8860b',
              boxShadow: '0 0 60px rgba(212,175,55,0.25), 0 0 20px rgba(212,175,55,0.1), inset 0 1px 0 rgba(255,215,0,0.3)',
            }}>
              <div className="px-5 py-5 text-center" style={{
                background: 'linear-gradient(180deg, rgba(212,175,55,0.2) 0%, rgba(212,175,55,0.05) 100%)',
                borderBottom: '1px solid rgba(212,175,55,0.4)',
              }}>
                <div className="text-4xl mb-2">💰</div>
                <h2 className="font-black text-2xl tracking-widest uppercase mb-1" style={{
                  background: 'linear-gradient(90deg, #b8860b, #ffd700, #fff8dc, #ffd700, #b8860b)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>Parlay Wins Wall</h2>
                <p className="text-sm mb-3" style={{ color: '#a0844a' }}>The weeks everyone cashed together</p>
                <span className="font-black text-2xl" style={{ color: '#ffd700' }}>{parlayWins.length}</span>
                <span className="text-sm ml-2" style={{ color: '#a0844a' }}>all-time group wins</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(184,134,11,0.2)' }}>
                {parlayWins.map(({ year, weekNum, picks, parlay }) => {
                  const key = `${year}-${weekNum}`
                  const isOpen = expandedParlay === key
                  return (
                    <div key={key} style={{ borderBottom: '1px solid rgba(184,134,11,0.15)' }}>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                        style={{ background: isOpen ? 'rgba(212,175,55,0.08)' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = isOpen ? 'rgba(212,175,55,0.08)' : 'transparent'}
                        onClick={() => setExpandedParlay(isOpen ? null : key)}
                      >
                        <div className="shrink-0 w-16 text-center">
                          <div className="font-black text-sm" style={{ color: '#ffd700' }}>{year}</div>
                          <div className="text-xs" style={{ color: '#a0844a' }}>Wk {weekNum}</div>
                        </div>
                        <div className="flex gap-1 flex-wrap flex-1">
                          {picks.map(p => (
                            <span key={p.player} className="text-xs px-2 py-0.5 rounded-full font-bold" style={{
                              background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)', color: '#ffd700',
                            }}>
                              {p.player.charAt(0) + p.player.slice(1, 3).toLowerCase()}
                            </span>
                          ))}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {parlay && (
                            <span className="font-mono font-black text-base" style={{ color: '#ffd700' }}>
                              {parlay.american > 0 ? `+${parlay.american}` : parlay.american}
                              {parlay.partial && <span style={{ color: '#7a6020' }}>*</span>}
                            </span>
                          )}
                          <span className="text-xs font-black px-3 py-1 rounded-full tracking-wider" style={{
                            background: 'linear-gradient(135deg, rgba(184,134,11,0.4), rgba(212,175,55,0.2))',
                            border: '1px solid rgba(212,175,55,0.6)', color: '#ffd700',
                          }}>W</span>
                          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: '#a0844a' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid rgba(184,134,11,0.2)', background: 'rgba(0,0,0,0.3)' }}>
                          {parlay && (
                            <div className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-3" style={{
                              background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.3)',
                            }}>
                              <span className="font-semibold text-sm" style={{ color: '#d4af37' }}>💰 Group Parlay:</span>
                              <span className="font-mono font-black text-xl" style={{ color: '#ffd700' }}>{parlay.american > 0 ? `+${parlay.american}` : parlay.american}</span>
                              <span className="text-xs" style={{ color: '#7a6020' }}>(+{parlay.payout}% on $100){parlay.partial && ' *partial'}</span>
                            </div>
                          )}
                          <table className="w-full text-sm mt-2 mb-3">
                            <tbody>
                              {picks.map(pick => (
                                <tr key={pick.player} style={{ borderBottom: '1px solid rgba(184,134,11,0.1)' }}>
                                  <td className="px-4 py-2 font-semibold" style={{ color: getColor(pick.player) }}>{pick.player}</td>
                                  <td className="px-4 py-2 text-xs hidden md:table-cell" style={{ color: '#7a6020' }}>{pick.game || '—'}</td>
                                  <td className="px-4 py-2" style={{ color: '#c8a84b' }}>{pick.lock || '—'}</td>
                                  <td className="px-4 py-2 text-right font-mono text-xs" style={{ color: '#7a6020' }}>{formatOdds(pick.odds)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Hall of Champions */}
          <div className="bg-slate-800 rounded-xl border border-yellow-500/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-yellow-500/20 flex items-center gap-2">
              <span className="text-yellow-400 text-lg">🏆</span>
              <h2 className="font-bold text-yellow-300 tracking-wide">Hall of Champions</h2>
            </div>
            {allTimeChamp && (
              <div className="px-4 py-4 border-b border-slate-700 bg-yellow-500/5">
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">All-Time Leader</div>
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🐐</span>
                  <div>
                    <button onClick={() => setProfilePlayer(allTimeChamp.player || allTimeChamp.tied[0])} className="text-2xl font-black hover:underline" style={{ color: getColor(allTimeChamp.player || allTimeChamp.tied[0]) }}>
                      {allTimeChamp.player || allTimeChamp.tied.join(' & ')}
                    </button>
                    <div className="text-yellow-400 font-bold text-sm">{allTimeChamp.wins} all-time wins</div>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 divide-x divide-slate-700">
              {seasonChampions.map(({ year, player, wins, tied }) => (
                <div key={year} className="px-4 py-4 text-center">
                  <div className="text-slate-400 text-xs font-semibold mb-2">{year}</div>
                  {player ? (
                    <>
                      <div className="text-xl mb-1">🥇</div>
                      <button onClick={() => setProfilePlayer(player)} className="font-black text-sm hover:underline" style={{ color: getColor(player) }}>{player}</button>
                      <div className="text-yellow-400 text-xs mt-0.5 font-semibold">{wins}W</div>
                      {mickeyHistory[player] && <div className="text-pink-400 text-xs mt-0.5">🐭 ×{mickeyHistory[player].length}</div>}
                    </>
                  ) : tied ? (
                    <>
                      <div className="text-xl mb-1">🤝</div>
                      <div className="text-xs text-slate-300 font-semibold leading-tight">
                        {tied.map((p, i) => (
                          <span key={p}>
                            <button onClick={() => setProfilePlayer(p)} className="hover:underline" style={{ color: getColor(p) }}>{p}</button>
                            {i < tied.length - 1 && <span className="text-slate-500"> / </span>}
                          </span>
                        ))}
                      </div>
                      <div className="text-yellow-400 text-xs mt-0.5 font-semibold">{wins}W ea.</div>
                    </>
                  ) : (
                    <div className="text-slate-600 text-xs">No data</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-700">
                  <th className="text-left px-4 py-2">Rank</th>
                  <th className="text-left px-4 py-2">Player</th>
                  <th className="text-right px-4 py-2">W</th>
                  <th className="text-right px-4 py-2">L</th>
                  <th className="text-right px-4 py-2 table-cell">Avg Line</th>
                  <th className="text-right px-4 py-2">🐭</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((p, idx) => (
                  <tr key={p.player} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{MEDALS[idx] ?? idx + 1}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setProfilePlayer(p.player)} className="font-semibold hover:underline" style={{ color: getColor(p.player) }}>{p.player}</button>
                    </td>
                    <td className="px-4 py-3 text-right text-green-400">{p.wins}</td>
                    <td className="px-4 py-3 text-right text-red-400">{p.losses}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-400 table-cell">
                      {p.avgOdds !== null ? (p.avgOdds > 0 ? `+${p.avgOdds}` : p.avgOdds) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(lifetimeMickeys[p.player] || 0) > 0 ? (
                        <button onClick={() => setShamePlayer(p.player)} className="text-pink-400 hover:underline font-semibold">{lifetimeMickeys[p.player]}🐭</button>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}

      {/* ═══════════════ SEASON VIEW ═══════════════ */}
      {season && (
        <>
          {/* Season summary */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-wrap gap-6">
            <div><div className="text-slate-400 text-xs">Season</div><div className="text-2xl font-black">{season.year}</div></div>
            <div><div className="text-slate-400 text-xs">Weeks Played</div><div className="text-2xl font-black">{completedWeeks.length}</div></div>
            <div><div className="text-slate-400 text-xs">Parlay W</div><div className="text-2xl font-black text-green-400">{seasonParW}</div></div>
            <div><div className="text-slate-400 text-xs">Parlay L</div><div className="text-2xl font-black text-red-400">{seasonParL}</div></div>
          </div>

          {/* Season standings table */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="font-semibold text-slate-200">{season.year} Standings</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-700">
                  <th className="text-left px-4 py-2">Rank</th>
                  <th className="text-left px-4 py-2">Player</th>
                  <th className="text-right px-4 py-2">W</th>
                  <th className="text-right px-4 py-2">L</th>
                  <th className="text-right px-4 py-2 table-cell">Avg Line</th>
                  <th className="text-right px-4 py-2">🐭</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((p, idx) => (
                  <tr key={p.player} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{MEDALS[idx] ?? idx + 1}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setProfilePlayer(p.player)} className="font-semibold hover:underline" style={{ color: getColor(p.player) }}>{p.player}</button>
                    </td>
                    <td className="px-4 py-3 text-right text-green-400">{p.wins}</td>
                    <td className="px-4 py-3 text-right text-red-400">{p.losses}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-400 table-cell">
                      {p.avgOdds !== null ? (p.avgOdds > 0 ? `+${p.avgOdds}` : p.avgOdds) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {season.weeks.filter(w => w.mickeyMouse?.toUpperCase() === p.player).length > 0 ? (
                        <button onClick={() => setShamePlayer(p.player)} className="text-pink-400 hover:underline font-semibold">
                          {season.weeks.filter(w => w.mickeyMouse?.toUpperCase() === p.player).length}🐭
                        </button>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Win progress chart */}
          {progressResult && progressResult.data.length > 0 && (
            <WinProgressChart progressResult={progressResult} season={season} />
          )}

          {/* Pick heatmap — players derived from actual picks, not season.players */}
          <PickHeatmap weeks={season.weeks} players={heatmapPlayers} title={`${season.year} Pick Grid`} year={season.year} />

          {/* Week grid */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-slate-200">{season.year} Weeks</h2>
              {expandedWeek && (
                <button onClick={() => setExpandedWeek(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">close ✕</button>
              )}
            </div>
            <div className="p-3 grid grid-cols-6 sm:grid-cols-9 gap-2">
              {[...season.weeks].sort((a, b) => a.weekNum - b.weekNum).map(week => {
                const picks = week.picks
                const hasResults = picks.some(p => p.result)
                const noPlays = picks.every(p => !p.lock && !p.result)
                const isSelected = expandedWeek === week.weekNum
                const pr = hasResults ? week.parlayResult : null

                let tileBg = 'bg-slate-700/50 border-slate-600/50'
                let tileText = 'text-slate-400'
                if (pr === 'W') { tileBg = 'bg-green-500/20 border-green-500/50'; tileText = 'text-green-300' }
                else if (pr === 'L') { tileBg = 'bg-red-500/20 border-red-500/40'; tileText = 'text-red-300' }
                else if (!hasResults && !noPlays) { tileBg = 'bg-yellow-500/10 border-yellow-500/30'; tileText = 'text-yellow-400' }

                return (
                  <button
                    key={week.weekNum}
                    onClick={() => setExpandedWeek(isSelected ? null : week.weekNum)}
                    className={`rounded-lg border p-2 text-center transition-all ${tileBg} ${
                      isSelected ? 'ring-2 ring-white/30 scale-105' : 'hover:brightness-125'
                    }`}
                  >
                    <div className={`font-black text-sm leading-none ${tileText}`}>{week.weekNum}</div>
                    <div className="text-[9px] mt-1 leading-none text-slate-500">
                      {noPlays ? '—' : pr === 'W' ? 'WIN' : pr === 'L' ? 'LOSS' : '···'}
                    </div>
                    {week.mickeyMouse && <div className="text-[9px] mt-0.5">🐭</div>}
                  </button>
                )
              })}
            </div>

            {/* Expanded week detail — inline below grid */}
            {expandedWeek && (() => {
              const week = season.weeks.find(w => w.weekNum === expandedWeek)
              if (!week) return null
              const picks = week.picks
              const isMickey = !!week.mickeyMouse
              const hasResults = picks.some(p => p.result)
              const noPlays = picks.every(p => !p.lock && !p.result)
              const parlayCalc = noPlays ? null : calcParlayOdds(picks)

              return (
                <div className="border-t border-slate-700">
                  <div className="px-4 py-2.5 bg-slate-700/30 flex items-center justify-between">
                    <span className="font-bold text-slate-200">Week {week.weekNum}</span>
                    <div className="flex items-center gap-2">
                      {isMickey && <span className="text-xs bg-pink-500/20 text-pink-300 border border-pink-500/30 px-2 py-0.5 rounded-full">🐭 {week.mickeyMouse}</span>}
                      {parlayCalc && (
                        <span className="text-xs font-mono text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">
                          {parlayCalc.american > 0 ? `+${parlayCalc.american}` : parlayCalc.american}{parlayCalc.partial && '*'}
                        </span>
                      )}
                      {/* Auto-computed parlay result from picks */}
                      {hasResults && (() => {
                        const settled = picks.filter(p => p.result === 'W' || p.result === 'L' || p.result === 'P')
                        if (!settled.length) return null
                        const hasLoss = settled.some(p => p.result === 'L')
                        const allDone = settled.length === picks.filter(p => p.lock).length
                        if (!allDone) return null
                        const pr = hasLoss ? 'L' : 'W'
                        return (
                          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                            pr === 'W' ? 'bg-green-500/20 text-green-300 border-green-500/30'
                            : 'bg-red-500/20 text-red-300 border-red-500/30'
                          }`}>PARLAY {pr}</span>
                        )
                      })()}
                    </div>
                  </div>
                  {noPlays && <div className="mx-4 my-3 p-3 bg-slate-700/40 border border-slate-600/40 rounded-lg text-slate-400 text-sm text-center">No picks were placed this week</div>}
                  {parlayCalc && (
                    <div className="mx-4 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm flex items-center gap-3">
                      <span className="text-yellow-300 font-semibold">💰 Parlay Odds:</span>
                      <span className="font-mono font-black text-yellow-400 text-lg">{parlayCalc.american > 0 ? `+${parlayCalc.american}` : parlayCalc.american}</span>
                      <span className="text-slate-400 text-xs">(+{parlayCalc.payout}% on $100){parlayCalc.partial && ' *partial'}</span>
                    </div>
                  )}
                  {isMickey && (
                    <div className="mx-4 mt-3 p-3 bg-pink-500/10 border border-pink-500/20 rounded-lg text-pink-300 text-sm text-center">
                      🐭 <strong>{week.mickeyMouse}</strong> caught the Mickey Mouse — sole loser!
                    </div>
                  )}

                  {(() => {
                    const hasNonNFL = picks.some(p => p.sport && p.sport !== 'NFL')
                    return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-xs border-b border-slate-700">
                        <th className="text-left px-4 py-2">Player</th>
                        {hasNonNFL && <th className="text-left px-4 py-2">Sport</th>}
                        <th className="text-left px-4 py-2 hidden md:table-cell">Game</th>
                        <th className="text-left px-4 py-2">Pick</th>
                        <th className="text-right px-4 py-2">Odds</th>
                        <th className="text-right px-4 py-2">Result</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {picks.map(pick => {
                        const rowKey = `${season.year}-${week.weekNum}-${pick.player.trim().toUpperCase()}`
                        const isEditing = editingKey === rowKey
                        const dnp = !pick.lock && !pick.result
                        if (isEditing) {
                          return (
                            <EditRow key={rowKey} year={season.year} week={week.weekNum} pick={pick}
                              onSaved={() => { reloadOverrides(); setEditingKey(null) }}
                              onCancel={() => setEditingKey(null)}
                            />
                          )
                        }
                        return (
                          <tr key={pick.player} className={`border-b border-slate-700/40 group ${
                            dnp ? 'bg-yellow-900/10' : pick.player === week.mickeyMouse ? 'bg-pink-900/20' : ''
                          }`}>
                            <td className="px-4 py-2.5 font-semibold" style={{ color: getColor(pick.player) }}>
                              {pick.player}{pick.player === week.mickeyMouse && ' 🐭'}
                              {pick._overridden && <span className="ml-1 text-blue-400 text-xs">✎</span>}
                            </td>
                            {hasNonNFL && (
                              <td className="px-4 py-2.5 text-slate-400">
                                {dnp ? <span className="text-yellow-600 text-xs italic">did not place</span> : pick.sport || '—'}
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-slate-400 hidden md:table-cell">{pick.game || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-200">
                              {dnp ? <span className="text-yellow-500 text-xs italic">no pick</span> : (
                                <div>
                                  <div>{pick.lock || '—'}</div>
                                  {season.year >= 2026 ? (
                                    <ScoreInput pick={pick} year={season.year} weekNum={week.weekNum} onSaved={reloadOverrides} />
                                  ) : (() => {
                                    const score = resolveWeekOutcome(pick, week.weekNum)
                                    return (
                                      <>
                                        {score && <div className="text-slate-500 text-xs mt-0.5">Final: {score}</div>}
                                        <PropStatLine year={season.year} weekNum={week.weekNum} pick={pick} />
                                      </>
                                    )
                                  })()}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-400 font-mono text-xs">{formatOdds(pick.odds)}</td>
                            <td className="px-4 py-2.5 text-right">
                              {season.year >= 2026 && !dnp ? (
                                <div className="flex items-center justify-end gap-1">
                                  {['W', 'L', 'P'].map(r => (
                                    <button key={r} onClick={e => {
                                      e.stopPropagation()
                                      const next = pick.result === r ? null : r
                                      fetch(`${API}/overrides?year=${season.year}&week=${week.weekNum}&player=${pick.player.trim().toUpperCase()}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ result: next }),
                                      }).then(() => reloadOverrides())
                                    }} className={`text-xs font-bold w-7 h-6 rounded border transition-all ${
                                      pick.result === r
                                        ? r === 'W' ? 'bg-green-500/30 text-green-300 border-green-500/50'
                                          : r === 'L' ? 'bg-red-500/30 text-red-300 border-red-500/50'
                                          : 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50'
                                        : 'bg-transparent text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
                                    }`}>{r}</button>
                                  ))}
                                </div>
                              ) : (
                                <ResultBadge result={pick.result} didNotPlace={dnp} />
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              {season.year < 2026 && (
                                <button
                                  onClick={e => { e.stopPropagation(); request(() => setEditingKey(rowKey)) }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-yellow-400 p-1 rounded"
                                  title="Edit pick"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
                                  </svg>
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  )
                })()}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* ═══════════════ SHAME MODAL ═══════════════ */}
      {shamePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShamePlayer(null)}>
          <div className="bg-slate-800 border border-pink-500/40 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-pink-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🐭</span>
                <div>
                  <h2 className="font-black text-lg" style={{ color: getColor(shamePlayer) }}>{shamePlayer}</h2>
                  <p className="text-pink-300 text-xs">{(mickeyHistory[shamePlayer] || []).length} mickey{(mickeyHistory[shamePlayer] || []).length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button onClick={() => setShamePlayer(null)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-700/50">
              {(mickeyHistory[shamePlayer] || []).map(({ year, weekNum, pick }, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-yellow-400 font-bold text-sm">{year}</span>
                    <span className="text-slate-500 text-xs">Week {weekNum}</span>
                  </div>
                  {pick ? (
                    <div className="bg-slate-700/40 rounded-lg p-3 space-y-1.5">
                      {pick.game && <div className="text-slate-400 text-xs">{pick.game}</div>}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-semibold text-sm">{pick.lock || 'No pick recorded'}</span>
                        {pick.odds && <span className="font-mono text-xs text-slate-400">{formatOdds(pick.odds)}</span>}
                      </div>
                      {pick.outcome && (
                        <div className="text-xs text-slate-400 bg-slate-800/60 rounded px-2 py-1">
                          <span className="text-slate-500">Final:</span> {pick.outcome}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">{pick.result || '—'}</span>
                        <span className="text-pink-400 text-xs ml-1">← sole loser 🐭</span>
                      </div>
                    </div>
                  ) : <div className="text-slate-500 text-sm italic">Pick details not recorded</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ PROFILE MODAL ═══════════════ */}
      {profilePlayer && (
        <PlayerProfileModal
          playerName={profilePlayer}
          seasonsWithOverrides={seasonsWithOverrides}
          onClose={() => setProfilePlayer(null)}
          onOpenShame={name => setShamePlayer(name)}
        />
      )}
    </div>
  )
}
