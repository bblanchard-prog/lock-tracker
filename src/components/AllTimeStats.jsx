import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import TeamReport from './TeamReport.jsx'
import PlayerProfileModal from './PlayerProfileModal.jsx'

import { API } from '../api.js'

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
  if (odds === null || odds === undefined) return null
  return odds > 0 ? `+${odds}` : `${odds}`
}



export default function AllTimeStats({ seasons, liveParlayWins = [] }) {
  const [overrides, setOverrides] = useState({})
  const [shameModal, setShameModal] = useState(null)   // player name
  const [profileModal, setProfileModal] = useState(null) // player name

  useEffect(() => {
    fetch(`${API}/overrides`).then(r => r.json()).then(setOverrides).catch(() => {})
  }, [])

  function getPick(year, weekNum, player) {
    const key = `${year}-${weekNum}-${player.trim().toUpperCase()}`
    return overrides[key] || null
  }

  // Merge overrides into seasons
  const seasonsWithOverrides = seasons.map(s => ({
    ...s,
    weeks: s.weeks.map(w => ({
      ...w,
      picks: w.picks.map(p => {
        const key = `${s.year}-${w.weekNum}-${p.player.trim().toUpperCase()}`
        if (!overrides[key]) return p
        const ov = Object.fromEntries(Object.entries(overrides[key]).filter(([, v]) => v !== null && v !== undefined))
        return { ...p, ...ov }
      }),
    })),
  }))

  // Build per-player all-time stats from picks (not stale standings)
  const playerStats = {}
  for (const season of seasonsWithOverrides) {
    for (const week of season.weeks) {
      for (const pick of week.picks) {
        const p = pick.player.trim().toUpperCase()
        if (!playerStats[p]) playerStats[p] = { wins: 0, losses: 0, pushes: 0, mickeys: 0, seasons: new Set() }
        if (pick.result === 'W') playerStats[p].wins++
        else if (pick.result === 'L') playerStats[p].losses++
        else if (pick.result === 'P') playerStats[p].pushes++
        playerStats[p].seasons.add(season.year)
      }
      if (week.mickeyMouse) {
        const p = week.mickeyMouse.trim().toUpperCase()
        if (!playerStats[p]) playerStats[p] = { wins: 0, losses: 0, pushes: 0, mickeys: 0, seasons: new Set() }
        playerStats[p].mickeys++
      }
    }
  }

  // Compute avg odds per player from all their picks
  const playerOddsSum = {}, playerOddsCount = {}
  for (const season of seasonsWithOverrides) {
    for (const week of season.weeks) {
      for (const pick of week.picks) {
        if (pick.odds === null || pick.odds === undefined) continue
        const p = pick.player.trim().toUpperCase()
        playerOddsSum[p] = (playerOddsSum[p] || 0) + pick.odds
        playerOddsCount[p] = (playerOddsCount[p] || 0) + 1
      }
    }
  }

  const players = Object.entries(playerStats)
    .map(([name, stats]) => ({
      name,
      ...stats,
      seasons: stats.seasons.size,
      total: stats.wins + stats.losses + stats.pushes,
      winPct: stats.wins + stats.losses > 0
        ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
        : 0,
      avgOdds: playerOddsCount[name] > 0
        ? Math.round(playerOddsSum[name] / playerOddsCount[name])
        : null,
    }))
    .sort((a, b) => b.wins - a.wins)

  // Season champions computed from picks (not stale standings field)
  const seasonChampions = seasonsWithOverrides.map(season => {
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
    return {
      year: season.year,
      first: sorted[0],
      second: sorted[1],
      third: sorted[2],
    }
  }).sort((a, b) => b.year - a.year)

  // Mickey history per player
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

  // Full pick history per player
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

  // Weeks where exactly one person won (lone hero) or everyone lost
  const loneHeroWeeks = []
  const everyoneCookedWeeks = []
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      const settled = week.picks.filter(p => p.result === 'W' || p.result === 'L')
      if (settled.length < 2) continue
      const winners = settled.filter(p => p.result === 'W')
      const losers = settled.filter(p => p.result === 'L')
      if (winners.length === 0 && losers.length >= 2) {
        everyoneCookedWeeks.push({ year: s.year, weekNum: week.weekNum, picks: settled })
      } else if (winners.length === 1 && losers.length >= 2) {
        loneHeroWeeks.push({ year: s.year, weekNum: week.weekNum, hero: winners[0], losers, picks: settled })
      }
    }
  }

  // Mickey Mouse leaderboard
  const mickeyLeaders = players.filter(p => p.mickeys > 0).sort((a, b) => b.mickeys - a.mickeys)

  const barData = players.map(p => ({ name: p.name, wins: p.wins, losses: p.losses }))

  // Find the most recent parlay win (historical + live 2026)
  const NFL_SEASON_STARTS = { 2021: '2021-09-09', 2022: '2022-09-08', 2023: '2023-09-07', 2024: '2024-09-05', 2025: '2025-09-04', 2026: '2026-09-04' }
  let lastParlayWin = null
  for (const season of seasonsWithOverrides) {
    for (const week of season.weeks) {
      if (week.parlayResult === 'W') {
        const startStr = NFL_SEASON_STARTS[season.year]
        if (startStr) {
          const start = new Date(startStr + 'T00:00:00Z')
          const weekSunday = new Date(start.getTime() + (week.weekNum - 1) * 7 * 24 * 60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000)
          if (!lastParlayWin || weekSunday > lastParlayWin.date) {
            lastParlayWin = { year: season.year, weekNum: week.weekNum, date: weekSunday, live: false }
          }
        }
      }
    }
  }
  // Check live 2026 wins
  for (const w of liveParlayWins) {
    const start = new Date(NFL_SEASON_STARTS[2026] + 'T00:00:00Z')
    const weekSunday = new Date(start.getTime() + (w.weekNum - 1) * 7 * 24 * 60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000)
    if (!lastParlayWin || weekSunday > lastParlayWin.date) {
      lastParlayWin = { year: 2026, weekNum: w.weekNum, date: weekSunday, live: true }
    }
  }
  let parlayDrought = null
  if (lastParlayWin) {
    const now = new Date()
    const msPerDay = 24 * 60 * 60 * 1000
    const daysSince = Math.floor((now - lastParlayWin.date) / msPerDay)
    let weeksSince = 0
    for (const season of seasonsWithOverrides) {
      const startStr = NFL_SEASON_STARTS[season.year]
      if (!startStr) continue
      const start = new Date(startStr + 'T00:00:00Z')
      for (const week of season.weeks) {
        const weekSunday = new Date(start.getTime() + (week.weekNum - 1) * 7 * 24 * 60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000)
        const isAfter = weekSunday > lastParlayWin.date && weekSunday < now
        const hasSettled = week.picks.some(p => p.result === 'W' || p.result === 'L')
        if (isAfter && hasSettled) weeksSince++
      }
    }
    // Also count live 2026 weeks that are settled and after last win
    for (const w of liveParlayWins) {
      const start = new Date(NFL_SEASON_STARTS[2026] + 'T00:00:00Z')
      const weekSunday = new Date(start.getTime() + (w.weekNum - 1) * 7 * 24 * 60 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000)
      if (weekSunday > lastParlayWin.date && weekSunday < now) weeksSince++
    }
    parlayDrought = daysSince <= 0
      ? null  // won this week — no drought to show
      : { daysSince, weeksSince, lastYear: lastParlayWin.year, lastWeek: lastParlayWin.weekNum, live: lastParlayWin.live }
  }

  function computeStreaks(seasons) {
    const streaks = {}
    for (const season of seasons) {
      for (const week of season.weeks) {
        for (const pick of week.picks) {
          const p = pick.player.trim().toUpperCase()
          if (!streaks[p]) streaks[p] = { winCur: 0, bestWin: 0, lossCur: 0, bestLoss: 0, curType: null }
          const r = pick.result
          if (r === 'W') {
            if (streaks[p].curType === 'W') streaks[p].winCur++
            else { streaks[p].winCur = 1; streaks[p].lossCur = 0 }
            streaks[p].curType = 'W'
            if (streaks[p].winCur > streaks[p].bestWin) streaks[p].bestWin = streaks[p].winCur
          } else if (r === 'L') {
            if (streaks[p].curType === 'L') streaks[p].lossCur++
            else { streaks[p].lossCur = 1; streaks[p].winCur = 0 }
            streaks[p].curType = 'L'
            if (streaks[p].lossCur > streaks[p].bestLoss) streaks[p].bestLoss = streaks[p].lossCur
          }
        }
      }
    }
    return streaks
  }
  const streakData = computeStreaks(seasonsWithOverrides)

  const shameData = shameModal ? (mickeyHistory[shameModal] || []) : []
  const profileData = profileModal ? (playerHistory[profileModal] || []) : []
  const profileByYear = {}
  profileData.forEach(e => {
    if (!profileByYear[e.year]) profileByYear[e.year] = []
    profileByYear[e.year].push(e)
  })

  return (
    <div className="space-y-6">

      {/* Parlay drought tracker */}
      {parlayDrought && (
        <div className="rounded-xl overflow-hidden" style={{
          background: 'linear-gradient(135deg, #1a0a0a 0%, #2d0f0f 40%, #1a0a0a 100%)',
          border: '2px solid #7f1d1d',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
        }}>
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <div className="text-center sm:text-left">
              <div className="text-red-400/60 text-xs font-semibold uppercase tracking-wider mb-1">⏳ Last Group Parlay Hit</div>
              <div className="text-red-300 font-bold text-sm">{parlayDrought.lastYear} · Week {parlayDrought.lastWeek}</div>
            </div>
            <div className="flex gap-6 sm:gap-10 justify-center sm:justify-start">
              <div className="text-center">
                <div className="font-black text-4xl" style={{ color: '#ef4444' }}>{parlayDrought.daysSince}</div>
                <div className="text-red-400/70 text-xs uppercase tracking-wide">days ago</div>
              </div>
              <div className="text-center">
                <div className="font-black text-4xl" style={{ color: '#f97316' }}>{parlayDrought.weeksSince}</div>
                <div className="text-orange-400/70 text-xs uppercase tracking-wide">NFL weeks</div>
              </div>
            </div>
            <div className="flex-1 text-center sm:text-right">
              <div className="text-red-400/50 text-xs">without a group win</div>
            </div>
          </div>
        </div>
      )}

      {/* All-time W/L bar chart */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h2 className="font-semibold text-slate-200 mb-4">All-Time Wins &amp; Losses</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} barCategoryGap="30%">
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} />
            <Bar dataKey="wins" name="Wins" radius={[4, 4, 0, 0]}>
              {barData.map(entry => <Cell key={entry.name} fill={getColor(entry.name)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stat cards — clickable to open profile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {players.map(player => {
          return (
            <button
              key={player.name}
              onClick={() => setProfileModal(player.name)}
              className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-left hover:bg-slate-700/60 transition-colors w-full"
              style={{ borderLeftColor: getColor(player.name), borderLeftWidth: 3 }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold text-lg" style={{ color: getColor(player.name) }}>{player.name}</div>
                {player.mickeys > 0 && <span className="text-pink-400 text-xs font-semibold">🐭×{player.mickeys}</span>}
              </div>
              <div className="text-slate-500 text-xs mb-3">{player.seasons} season{player.seasons !== 1 ? 's' : ''} · tap for profile</div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div>
                  <div className="text-lg font-black text-green-400">{player.wins}</div>
                  <div className="text-slate-500 text-xs">W</div>
                </div>
                <div>
                  <div className="text-lg font-black text-red-400">{player.losses}</div>
                  <div className="text-slate-500 text-xs">L</div>
                </div>
                <div>
                  <div className="text-lg font-black text-yellow-400">{player.winPct > 0 || player.wins + player.losses > 0 ? `${player.winPct}%` : '—'}</div>
                  <div className="text-slate-500 text-xs">Win%</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Best win streaks + longest cold streaks side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold text-slate-200">🔥 Best Win Streaks (All-Time)</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {Object.entries(streakData).sort((a, b) => b[1].bestWin - a[1].bestWin).map(([name, s]) => (
              <div key={name} className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                <div className="w-2 h-8 rounded-full shrink-0" style={{ background: getColor(name) }} />
                <div>
                  <div className="font-semibold text-xs" style={{ color: getColor(name) }}>{name}</div>
                  <div className="text-xl font-black text-orange-400">{s.bestWin}</div>
                  <div className="text-slate-500 text-xs">in a row</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold text-slate-200">🥶 Longest Cold Streaks (All-Time)</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {Object.entries(streakData).sort((a, b) => b[1].bestLoss - a[1].bestLoss).map(([name, s]) => (
              <div key={name} className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                <div className="w-2 h-8 rounded-full shrink-0" style={{ background: getColor(name) }} />
                <div>
                  <div className="font-semibold text-xs" style={{ color: getColor(name) }}>{name}</div>
                  <div className="text-xl font-black text-blue-400">{s.bestLoss}</div>
                  <div className="text-slate-500 text-xs">losses in a row</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Everyone Cooked weeks */}
      {everyoneCookedWeeks.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-red-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/20 bg-red-500/5">
            <h2 className="font-semibold text-red-300">💀 Everyone Got Cooked</h2>
            <p className="text-slate-500 text-xs mt-0.5">Weeks where not a single person won — {everyoneCookedWeeks.length} times</p>
          </div>
          <div className="divide-y divide-slate-700/50">
            {everyoneCookedWeeks.map(({ year, weekNum, picks }) => (
              <div key={`${year}-${weekNum}`} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-slate-500 text-xs w-20 shrink-0">{year} Wk {weekNum}</span>
                <div className="flex flex-wrap gap-1.5">
                  {picks.map(p => (
                    <div key={p.player} className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs" style={{ color: getColor(p.player) }}>{p.player}</span>
                      {p.lock && <span className="text-slate-500 text-xs">{p.lock}</span>}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">L</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season Champions — computed from picks */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-slate-200">🏆 Season Champions</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs border-b border-slate-700">
              <th className="text-left px-4 py-2">Year</th>
              <th className="text-left px-4 py-2">🥇 Champion</th>
              <th className="text-left px-4 py-2">🥈 Runner-Up</th>
              <th className="text-left px-4 py-2">🥉 Third</th>
            </tr>
          </thead>
          <tbody>
            {seasonChampions.map(row => (
              <tr key={row.year} className="border-b border-slate-700/50">
                <td className="px-4 py-3 text-slate-300 font-semibold">{row.year}</td>
                <td className="px-4 py-3">
                  {row.first && (
                    <button onClick={() => setProfileModal(row.first[0])} className="font-bold hover:underline" style={{ color: getColor(row.first[0]) }}>
                      {row.first[0]} <span className="text-yellow-400 text-xs">({row.first[1]}W)</span>
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.second && (
                    <button onClick={() => setProfileModal(row.second[0])} className="text-slate-300 hover:underline">
                      {row.second[0]} <span className="text-slate-500 text-xs">({row.second[1]}W)</span>
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.third && (
                    <button onClick={() => setProfileModal(row.third[0])} className="text-slate-400 hover:underline">
                      {row.third[0]} <span className="text-slate-500 text-xs">({row.third[1]}W)</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mickey Mouse Hall of Shame — tiles are clickable */}
      {mickeyLeaders.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-pink-500/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-pink-500/20 bg-pink-500/5">
            <h2 className="font-semibold text-pink-300">🐭 Hall of Shame — Mickey Mouse Awards</h2>
            <p className="text-slate-400 text-xs mt-0.5">Sole loser of the week. Tap a tile to see the crimes.</p>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {mickeyLeaders.map(player => (
              <button
                key={player.name}
                onClick={() => setShameModal(player.name)}
                className="bg-pink-500/10 border border-pink-500/20 rounded-lg p-3 text-center hover:bg-pink-500/20 transition-colors"
              >
                <div className="text-2xl mb-1">🐭</div>
                <div className="font-bold" style={{ color: getColor(player.name) }}>{player.name}</div>
                <div className="text-pink-300 text-lg font-black">×{player.mickeys}</div>
                <div className="text-pink-500 text-xs mt-1">tap to view</div>
              </button>
            ))}
          </div>

          {/* Lone Hero weeks — inside Hall of Shame */}
          {loneHeroWeeks.length > 0 && (
            <div className="border-t border-pink-500/20">
              <div className="px-4 py-3 border-b border-pink-500/10">
                <h3 className="font-semibold text-slate-300 text-sm">🦸 Lone Hero Weeks</h3>
                <p className="text-slate-500 text-xs mt-0.5">One person got it right while everyone else got cooked — {loneHeroWeeks.length} times</p>
              </div>
              <div className="divide-y divide-slate-700/40">
                {loneHeroWeeks.map(({ year, weekNum, hero, losers }) => (
                  <div key={`${year}-${weekNum}`} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                    <span className="text-slate-500 text-xs w-20 shrink-0">{year} Wk {weekNum}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">W</span>
                      <span className="font-bold text-sm" style={{ color: getColor(hero.player) }}>{hero.player}</span>
                      {hero.lock && <span className="text-slate-400 text-xs">{hero.lock}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {losers.map(l => (
                        <span key={l.player} className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{l.player}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hall of Shame modal */}
      {shameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShameModal(null)}>
          <div className="bg-slate-800 border border-pink-500/40 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-pink-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🐭</span>
                <div>
                  <h2 className="font-black text-lg" style={{ color: getColor(shameModal) }}>{shameModal}</h2>
                  <p className="text-pink-300 text-xs">{shameData.length} mickey{shameData.length !== 1 ? 's' : ''} — Hall of Shame</p>
                </div>
              </div>
              <button onClick={() => setShameModal(null)} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-700/50">
              {shameData.map(({ year, weekNum, pick }, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-yellow-400 font-bold text-sm">{year}</span>
                    <span className="text-slate-500 text-xs">Week {weekNum}</span>
                  </div>
                  {pick ? (
                    <div className="bg-slate-700/40 rounded-lg p-3 space-y-1.5">
                      {pick.game && <div className="text-slate-400 text-xs">{pick.game}</div>}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-semibold text-sm">{pick.lock || '—'}</span>
                        {pick.odds && <span className="font-mono text-xs text-slate-400">{formatOdds(pick.odds)}</span>}
                      </div>
                      {pick.outcome ? (
                        <div className="text-xs bg-slate-800/80 rounded px-2 py-1">
                          <span className="text-slate-500">Final:</span> <span className="text-slate-300">{pick.outcome}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 italic">No final score recorded — use ✎ in Season view to add it</div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30`}>L</span>
                        <span className="text-pink-400 text-xs">← sole loser 🐭</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm italic">Pick not recorded</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {profileModal && (
        <PlayerProfileModal
          playerName={profileModal}
          seasonsWithOverrides={seasonsWithOverrides}
          onClose={() => setProfileModal(null)}
          onOpenShame={name => setShameModal(name)}
        />
      )}
      {/* Team betting report */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-slate-200">🏈 Team Betting Report</h2>
          <p className="text-slate-500 text-xs mt-0.5">Which teams you backed vs faded, all-time</p>
        </div>
        <div className="p-4">
          <TeamReport seasons={seasonsWithOverrides} />
        </div>
      </div>

    </div>
  )
}
