import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

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
  return PLAYER_COLORS[name.trim().toUpperCase()] || '#94a3b8'
}

function buildProgressData(season) {
  const weeks = season.weeks
  const playerSet = new Set()
  weeks.forEach(w => w.picks.forEach(p => playerSet.add(p.player.trim().toUpperCase())))
  const players = [...playerSet]

  const totals = {}
  players.forEach(p => (totals[p] = 0))

  const data = []
  for (const week of weeks) {
    const hasResults = week.picks.some(p => p.result)
    if (!hasResults) continue

    for (const pick of week.picks) {
      if (pick.result === 'W') totals[pick.player.trim().toUpperCase()]++
    }

    const point = { week: `Wk ${week.weekNum}` }
    players.forEach(p => (point[p] = totals[p]))
    data.push(point)
  }
  return { data, players }
}

function formatOdds(odds) {
  if (odds === null || odds === undefined) return null
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

function applyOverridesToPick(pick, year, weekNum, overrides) {
  const key = `${year}-${weekNum}-${pick.player.trim().toUpperCase()}`
  return overrides[key] ? { ...pick, ...overrides[key] } : pick
}

export default function Leaderboard({ allSeasons }) {
  const years = allSeasons.map(s => s.year).sort((a, b) => b - a)
  const [selectedYear, setSelectedYear] = useState('all-time')
  const [shamePlayer, setShamePlayer] = useState(null)
  const [profilePlayer, setProfilePlayer] = useState(null)
  const [expandedParlay, setExpandedParlay] = useState(null)
  const [overrides, setOverrides] = useState({})

  useEffect(() => {
    fetch(`${API}/overrides`).then(r => r.json()).then(setOverrides).catch(() => {})
  }, [])

  const season = selectedYear === 'all-time' ? null : allSeasons.find(s => s.year === selectedYear)

  // Merge overrides into all seasons' picks for downstream use
  const seasonsWithOverrides = allSeasons.map(s => ({
    ...s,
    weeks: s.weeks.map(w => ({
      ...w,
      picks: w.picks.map(p => applyOverridesToPick(p, s.year, w.weekNum, overrides)),
    })),
  }))

  // All-time wins
  const lifetimeWins = {}
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      for (const pick of week.picks) {
        if (pick.result === 'W') {
          const p = pick.player.trim().toUpperCase()
          lifetimeWins[p] = (lifetimeWins[p] || 0) + 1
        }
      }
    }
  }

  // All-time losses
  const lifetimeLosses = {}
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      for (const pick of week.picks) {
        if (pick.result === 'L') {
          const p = pick.player.trim().toUpperCase()
          lifetimeLosses[p] = (lifetimeLosses[p] || 0) + 1
        }
      }
    }
  }

  // All-time mickeys
  const lifetimeMickeys = {}
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      if (week.mickeyMouse) {
        const p = week.mickeyMouse.trim().toUpperCase()
        lifetimeMickeys[p] = (lifetimeMickeys[p] || 0) + 1
      }
    }
  }

  // Compute standings from picks for the selected scope
  const seasonWins = {}
  const seasonLosses = {}
  const seasonPushes = {}
  const oddsSum = {}
  const oddsCount = {}
  const sourceSeason = season
    ? [seasonsWithOverrides.find(s => s.year === season.year)]
    : seasonsWithOverrides
  for (const s of sourceSeason) {
    for (const week of s.weeks) {
      for (const pick of week.picks) {
        const p = pick.player.trim().toUpperCase()
        if (pick.result === 'W') seasonWins[p] = (seasonWins[p] || 0) + 1
        else if (pick.result === 'L') seasonLosses[p] = (seasonLosses[p] || 0) + 1
        else if (pick.result === 'P') seasonPushes[p] = (seasonPushes[p] || 0) + 1
        if (pick.odds !== null && pick.odds !== undefined) {
          // convert to decimal implied probability for averaging, then back
          const dec = pick.odds > 0 ? pick.odds / 100 + 1 : 100 / Math.abs(pick.odds) + 1
          oddsSum[p] = (oddsSum[p] || 0) + dec
          oddsCount[p] = (oddsCount[p] || 0) + 1
        }
      }
    }
  }

  function avgOddsAmerican(player) {
    if (!oddsCount[player]) return null
    const dec = oddsSum[player] / oddsCount[player]
    const american = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1))
    return american
  }

  const standings = Object.keys({ ...seasonWins, ...seasonLosses, ...seasonPushes })
    .map(player => ({
      player,
      wins: seasonWins[player] || 0,
      losses: seasonLosses[player] || 0,
      pushes: seasonPushes[player] || 0,
      points: seasonWins[player] || 0,
      avgOdds: avgOddsAmerican(player),
    }))
    .sort((a, b) => b.points - a.points)

  // All parlay wins across all seasons, with full picks (overrides applied)
  const parlayWins = []
  for (const s of seasonsWithOverrides) {
    for (const week of s.weeks) {
      if (week.parlayResult === 'W') {
        const parlay = calcParlayOdds(week.picks)
        parlayWins.push({ year: s.year, weekNum: week.weekNum, picks: week.picks, parlay })
      }
    }
  }
  parlayWins.sort((a, b) => b.year - a.year || b.weekNum - a.weekNum)

  // All mickey instances across all seasons, keyed by player (overrides applied)
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

  // All picks per player across all seasons (overrides applied), for profile modal
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

  // Season champions for Hall of Champions
  const seasonChampions = years.map(y => {
    const s = seasonsWithOverrides.find(x => x.year === y)
    return { year: y, ...getSeasonChampion(s) }
  })

  // All-time champion (lifetimeWins already uses seasonsWithOverrides)
  const allTimeChamp = (() => {
    const sorted = Object.entries(lifetimeWins).sort((a, b) => b[1] - a[1])
    if (!sorted.length) return null
    const topWins = sorted[0][1]
    const tied = sorted.filter(([, w]) => w === topWins)
    return { player: tied.length === 1 ? sorted[0][0] : null, wins: topWins, tied: tied.map(([p]) => p) }
  })()

  const progressResult = season ? buildProgressData(season) : null
  const progressData = progressResult?.data ?? null
  const progressPlayers = progressResult?.players ?? []
  const hasProgress = progressData && progressData.length > 0
  const title = season ? `${season.year} Standings` : 'All-Time Standings'

  return (
    <div className="space-y-6">
      {/* Season selector */}
      <div className="flex items-center gap-3">
        <span className="text-slate-400 text-sm font-medium">View:</span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedYear('all-time')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              selectedYear === 'all-time'
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            All-Time
          </button>
          {years.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                selectedYear === y
                  ? 'bg-yellow-500 text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Hall of Champions — all-time view only */}
      {!season && (
        <div className="bg-slate-800 rounded-xl border border-yellow-500/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-yellow-500/20 flex items-center gap-2">
            <span className="text-yellow-400 text-lg">🏆</span>
            <h2 className="font-bold text-yellow-300 tracking-wide">Hall of Champions</h2>
          </div>

          {/* All-time banner */}
          {allTimeChamp && (
            <div className="px-4 py-4 border-b border-slate-700 bg-yellow-500/5">
              <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">All-Time Leader</div>
              <div className="flex items-center gap-3">
                <span className="text-4xl">🐐</span>
                <div>
                  {allTimeChamp.player ? (
                    <div className="text-2xl font-black" style={{ color: getColor(allTimeChamp.player) }}>
                      {allTimeChamp.player}
                    </div>
                  ) : (
                    <div className="text-2xl font-black text-slate-300">
                      {allTimeChamp.tied.join(' & ')}
                    </div>
                  )}
                  <div className="text-yellow-400 font-bold text-sm">{allTimeChamp.wins} all-time wins</div>
                </div>
              </div>
            </div>
          )}

          {/* Per-season champions grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 divide-x divide-slate-700">
            {seasonChampions.map(({ year, player, wins, tied }) => (
              <div key={year} className="px-4 py-4 text-center">
                <div className="text-slate-400 text-xs font-semibold mb-2">{year}</div>
                {player ? (
                  <>
                    <div className="text-xl mb-1">🥇</div>
                    <button
                      onClick={() => mickeyHistory[player] && setShamePlayer(player)}
                      className={`font-black text-sm ${mickeyHistory[player] ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                      style={{ color: getColor(player) }}
                    >{player}</button>
                    <div className="text-yellow-400 text-xs mt-0.5 font-semibold">{wins}W</div>
                    {mickeyHistory[player] && (
                      <div className="text-pink-400 text-xs mt-0.5">🐭 ×{mickeyHistory[player].length}</div>
                    )}
                  </>
                ) : tied ? (
                  <>
                    <div className="text-xl mb-1">🤝</div>
                    <div className="text-xs text-slate-300 font-semibold leading-tight">
                      {tied.map((p, i) => (
                        <span key={p}>
                          <button
                            onClick={() => mickeyHistory[p] && setShamePlayer(p)}
                            className={mickeyHistory[p] ? 'hover:underline cursor-pointer' : 'cursor-default'}
                            style={{ color: getColor(p) }}
                          >{p}</button>
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
      )}

      {/* Podium */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {standings.slice(0, 3).map((player, idx) => (
          <div
            key={player.player}
            className={`rounded-xl p-5 border text-center ${
              idx === 0
                ? 'bg-yellow-500/10 border-yellow-500 ring-1 ring-yellow-500/60 shadow-lg shadow-yellow-500/10'
                : idx === 1
                ? 'bg-slate-400/10 border-slate-400/40'
                : 'bg-orange-700/10 border-orange-700/40'
            }`}
          >
            <div className="text-3xl mb-1">{MEDALS[idx]}</div>
            <button
              onClick={() => setProfilePlayer(player.player)}
              className="text-xl font-bold hover:underline transition-colors"
              style={{ color: getColor(player.player) }}
            >
              {player.player}
            </button>
            <div className="text-3xl font-black mt-2">{player.points}</div>
            <div className="text-slate-400 text-xs mt-1">wins</div>
            <div className="text-slate-500 text-xs mt-2">
              {player.wins}W – {player.losses}L
              {player.pushes > 0 ? ` – ${player.pushes}P` : ''}
            </div>
            {lifetimeMickeys[player.player] > 0 && (
              <button
                onClick={() => setShamePlayer(player.player)}
                className="mt-2 text-xs text-pink-400 hover:text-pink-300 hover:underline block w-full transition-colors"
              >
                🐭 ×{lifetimeMickeys[player.player]} lifetime
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Full standings table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-slate-200">{title}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs border-b border-slate-700">
              <th className="text-left px-4 py-2">Rank</th>
              <th className="text-left px-4 py-2">Player</th>
              <th className="text-right px-4 py-2">W</th>
              <th className="text-right px-4 py-2">L</th>
              {season && <th className="text-right px-4 py-2">P</th>}
              <th className="text-right px-4 py-2">Points</th>
              <th className="text-right px-4 py-2 hidden sm:table-cell">Avg Line</th>
              <th className="text-right px-4 py-2">🐭</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((player, idx) => (
              <tr
                key={player.player}
                className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
              >
                <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setProfilePlayer(player.player)}
                    className="font-semibold hover:underline transition-colors"
                    style={{ color: getColor(player.player) }}
                  >
                    {player.player}
                  </button>
                </td>
                <td className="px-4 py-3 text-right text-green-400">{player.wins}</td>
                <td className="px-4 py-3 text-right text-red-400">{player.losses}</td>
                {season && <td className="px-4 py-3 text-right text-slate-400">{player.pushes || 0}</td>}
                <td className="px-4 py-3 text-right font-bold text-yellow-400">{player.points}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-400 hidden sm:table-cell">
                  {player.avgOdds !== null
                    ? (player.avgOdds > 0 ? `+${player.avgOdds}` : player.avgOdds)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {(season
                    ? season.weeks.filter(w => w.mickeyMouse?.toUpperCase() === player.player).length
                    : lifetimeMickeys[player.player] || 0) > 0 ? (
                    <button
                      onClick={() => setShamePlayer(player.player)}
                      className="text-pink-400 hover:text-pink-300 hover:underline font-semibold transition-colors"
                      title="View Hall of Shame"
                    >
                      {season
                        ? season.weeks.filter(w => w.mickeyMouse?.toUpperCase() === player.player).length
                        : lifetimeMickeys[player.player]}
                      🐭
                    </button>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Season Progress Chart — only when a season is selected */}
      {hasProgress && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h2 className="font-semibold text-slate-200 mb-4">{season.year} Win Progress</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={progressData}>
              <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Legend />
              {progressPlayers.map(p => (
                <Line
                  key={p}
                  type="monotone"
                  dataKey={p}
                  stroke={getColor(p)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Parlay Wins Wall — all-time view only */}
      {!season && parlayWins.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-green-500/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-green-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-lg">💰</span>
              <h2 className="font-bold text-green-300 tracking-wide">Parlay Wins Wall</h2>
            </div>
            <span className="text-green-400 text-sm font-bold">{parlayWins.length} all-time</span>
          </div>
          <div className="divide-y divide-slate-700/50">
            {parlayWins.map(({ year, weekNum, picks, parlay }) => {
              const key = `${year}-${weekNum}`
              const isOpen = expandedParlay === key
              return (
                <div key={key}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/30 transition-colors text-left"
                    onClick={() => setExpandedParlay(isOpen ? null : key)}
                  >
                    <div className="shrink-0 text-center w-16">
                      <div className="text-yellow-400 font-black text-sm">{year}</div>
                      <div className="text-slate-400 text-xs">Wk {weekNum}</div>
                    </div>
                    <div className="flex gap-1 flex-wrap flex-1">
                      {picks.map(p => (
                        <span key={p.player} className="text-xs px-2 py-0.5 rounded-full font-semibold border border-green-500/40 bg-green-500/10 text-green-300">
                          {p.player.charAt(0) + p.player.slice(1, 3).toLowerCase()}
                        </span>
                      ))}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {parlay && (
                        <span className="font-mono font-black text-green-400 text-sm">
                          {parlay.american > 0 ? `+${parlay.american}` : parlay.american}
                          {parlay.partial && <span className="text-green-700">*</span>}
                        </span>
                      )}
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                        PARLAY W
                      </span>
                      <svg className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-700/50 bg-slate-900/30">
                      {parlay && (
                        <div className="mx-4 mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm flex items-center gap-3">
                          <span className="text-green-300 font-semibold">💰 Group Parlay Odds:</span>
                          <span className="font-mono font-black text-green-400 text-lg">
                            {parlay.american > 0 ? `+${parlay.american}` : parlay.american}
                          </span>
                          <span className="text-slate-400 text-xs">
                            (+{parlay.payout}% on $100){parlay.partial && ' *partial odds data'}
                          </span>
                        </div>
                      )}
                      <table className="w-full text-sm mt-2 mb-2">
                        <thead>
                          <tr className="text-slate-500 text-xs border-b border-slate-700/50">
                            <th className="text-left px-4 py-1.5">Player</th>
                            <th className="text-left px-4 py-1.5 hidden md:table-cell">Game</th>
                            <th className="text-left px-4 py-1.5">Pick</th>
                            <th className="text-right px-4 py-1.5">Odds</th>
                          </tr>
                        </thead>
                        <tbody>
                          {picks.map(pick => (
                            <tr key={pick.player} className="border-b border-slate-700/30">
                              <td className="px-4 py-2 font-semibold" style={{ color: getColor(pick.player) }}>
                                {pick.player}
                              </td>
                              <td className="px-4 py-2 text-slate-400 text-xs hidden md:table-cell">
                                {pick.game || '—'}
                              </td>
                              <td className="px-4 py-2 text-slate-200">{pick.lock || '—'}</td>
                              <td className="px-4 py-2 text-right font-mono text-xs text-slate-400">
                                {formatOdds(pick.odds) || '—'}
                              </td>
                              {pick.outcome && (
                                <td className="px-4 py-2 text-slate-400 text-xs italic hidden lg:table-cell">
                                  {pick.outcome}
                                </td>
                              )}
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

      {/* Hall of Shame modal */}
      {shamePlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShamePlayer(null)}
        >
          <div
            className="bg-slate-800 border border-pink-500/40 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-pink-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🐭</span>
                <div>
                  <h2 className="font-black text-lg" style={{ color: getColor(shamePlayer) }}>
                    {shamePlayer}
                  </h2>
                  <p className="text-pink-300 text-xs">Hall of Shame — {(mickeyHistory[shamePlayer] || []).length} mickey{(mickeyHistory[shamePlayer] || []).length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                onClick={() => setShamePlayer(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors text-xl leading-none"
              >
                ✕
              </button>
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
                      {pick.game && (
                        <div className="text-slate-400 text-xs">{pick.game}</div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-semibold text-sm">{pick.lock || 'No pick recorded'}</span>
                        {pick.odds && (
                          <span className="font-mono text-xs text-slate-400">{formatOdds(pick.odds)}</span>
                        )}
                      </div>
                      {pick.outcome && (
                        <div className="text-xs text-slate-400 bg-slate-800/60 rounded px-2 py-1">
                          <span className="text-slate-500">Final:</span> {pick.outcome}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-xs">Result:</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          pick.result === 'L'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-slate-600/40 text-slate-400'
                        }`}>
                          {pick.result || '—'}
                        </span>
                        <span className="text-pink-400 text-xs ml-1">← sole loser 🐭</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm italic">Pick details not recorded</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Player profile modal */}
      {profilePlayer && (() => {
        const history = playerHistory[profilePlayer] || []
        const pw = lifetimeWins[profilePlayer] || 0
        const pl = lifetimeLosses[profilePlayer] || 0
        const pm = lifetimeMickeys[profilePlayer] || 0
        // group by year
        const byYear = {}
        history.forEach(entry => {
          if (!byYear[entry.year]) byYear[entry.year] = []
          byYear[entry.year].push(entry)
        })
        const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a)
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setProfilePlayer(null)}
          >
            <div
              className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between" style={{ borderLeftColor: getColor(profilePlayer), borderLeftWidth: 4 }}>
                <div>
                  <h2 className="font-black text-2xl" style={{ color: getColor(profilePlayer) }}>{profilePlayer}</h2>
                  <div className="flex gap-4 mt-1 text-sm">
                    <span className="text-green-400 font-bold">{pw}W</span>
                    <span className="text-red-400 font-bold">{pl}L</span>
                    {pm > 0 && (
                      <button onClick={() => { setProfilePlayer(null); setShamePlayer(profilePlayer) }} className="text-pink-400 hover:underline font-bold">
                        🐭 ×{pm}
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={() => setProfilePlayer(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
              </div>

              {/* Pick history grouped by year */}
              <div className="overflow-y-auto flex-1">
                {sortedYears.map(year => (
                  <div key={year}>
                    <div className="px-5 py-2 bg-slate-700/40 border-b border-t border-slate-700 text-yellow-400 font-bold text-sm sticky top-0">
                      {year}
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {byYear[year].map(({ weekNum, pick, mickeyMouse }, i) => {
                          const isMickey = mickeyMouse?.toUpperCase() === profilePlayer
                          return (
                            <tr key={i} className={`border-b border-slate-700/40 ${isMickey ? 'bg-pink-900/15' : ''}`}>
                              <td className="px-4 py-2.5 text-slate-500 text-xs w-14 shrink-0">Wk {weekNum}</td>
                              <td className="px-2 py-2.5 text-slate-400 text-xs hidden sm:table-cell">{pick.game || '—'}</td>
                              <td className="px-2 py-2.5">
                                <div className="text-slate-200 text-sm font-medium">{pick.lock || '—'}</div>
                                {pick.outcome && (
                                  <div className="text-slate-500 text-xs mt-0.5">Final: {pick.outcome}</div>
                                )}
                              </td>
                              <td className="px-2 py-2.5 text-right font-mono text-xs text-slate-500">{formatOdds(pick.odds) || '—'}</td>
                              <td className="px-4 py-2.5 text-right">
                                {pick.result ? (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                    pick.result === 'W' ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : pick.result === 'L' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                  }`}>{pick.result}{isMickey ? ' 🐭' : ''}</span>
                                ) : <span className="text-slate-600 text-xs">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
