import { useState, useMemo } from 'react'
import { buildTeamStats } from '../teamUtils.js'

const NFL_TEAMS = [
  'Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers',
  'Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos',
  'Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars',
  'Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams',
  'Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints',
  'New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers',
  'Seattle Seahawks','San Francisco 49ers','Tampa Bay Buccaneers','Tennessee Titans',
  'Washington Commanders',
]

export default function TeamReport({ seasons }) {
  const [view, setView] = useState('bet') // 'bet' | 'fade'
  const [sort, setSort] = useState('total') // 'total' | 'winpct' | 'wins'
  const [minBets, setMinBets] = useState(2)

  const allStats = useMemo(() => buildTeamStats(seasons), [seasons])

  const displayed = useMemo(() => {
    const filtered = allStats.filter(t =>
      view === 'bet' ? t.betTotal >= minBets : t.fadeTotal >= minBets
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'total') return view === 'bet' ? b.betTotal - a.betTotal : b.fadeTotal - a.fadeTotal
      if (sort === 'winpct') return view === 'bet' ? b.betWinPct - a.betWinPct : b.fadeWinPct - a.fadeWinPct
      if (sort === 'wins') return view === 'bet' ? b.betOn.W - a.betOn.W : b.faded.W - a.faded.W
      return 0
    })
  }, [allStats, view, sort, minBets])

  const topBet = [...allStats].filter(t => t.betTotal >= 3).sort((a, b) => b.betWinPct - a.betWinPct).slice(0, 4)
  const worstBet = [...allStats].filter(t => t.betTotal >= 3).sort((a, b) => a.betWinPct - b.betWinPct).slice(0, 4)
  const topFade = [...allStats].filter(t => t.fadeTotal >= 3).sort((a, b) => b.fadeWinPct - a.fadeWinPct).slice(0, 4)
  const worstFade = [...allStats].filter(t => t.fadeTotal >= 3).sort((a, b) => a.fadeWinPct - b.fadeWinPct).slice(0, 4)

  function shortName(full) {
    return full.split(' ').pop()
  }

  function WinBar({ wins, losses }) {
    const total = wins + losses
    if (!total) return <div className="text-slate-600 text-xs">—</div>
    const pct = Math.round(wins / total * 100)
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs font-bold w-8 text-right ${pct >= 55 ? 'text-green-400' : pct <= 40 ? 'text-red-400' : 'text-slate-400'}`}>{pct}%</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Summary headlines — single column, each tile is a horizontal row */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 divide-y divide-slate-700/50">
        {[
          { label: '💰 Best to Bet On',   data: topBet,    color: 'text-green-400',  sub: (t) => `${t.betWinPct}% (${t.betOn.W}-${t.betOn.L})` },
          { label: '📉 Worst to Bet On',  data: worstBet,  color: 'text-red-400',    sub: (t) => `${t.betWinPct}% (${t.betOn.W}-${t.betOn.L})` },
          { label: '🔥 Best to Fade',     data: topFade,   color: 'text-orange-400', sub: (t) => `${t.fadeWinPct}% (${t.faded.W}-${t.faded.L})` },
          { label: '😬 Worst to Fade',    data: worstFade, color: 'text-blue-400',   sub: (t) => `${t.fadeWinPct}% (${t.faded.W}-${t.faded.L})` },
        ].map(({ label, data, color, sub }) => (
          <div key={label} className="px-4 py-3">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{label}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
              {data.map((t, i) => (
                <div key={t.team} className="flex items-baseline gap-1 min-w-0">
                  <span className={`font-black text-xs shrink-0 ${color}`}>{i + 1}.</span>
                  <span className="text-slate-200 text-sm font-semibold truncate">{shortName(t.team)}</span>
                  <span className={`text-xs font-bold shrink-0 ${color}`}>{sub(t)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Full table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
            <button onClick={() => setView('bet')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'bet' ? 'bg-yellow-500 text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}>Bet On</button>
            <button onClick={() => setView('fade')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'fade' ? 'bg-yellow-500 text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}>Faded</button>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-slate-600 shrink-0">
            <button onClick={() => setSort('total')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${sort === 'total' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>Most</button>
            <button onClick={() => setSort('winpct')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${sort === 'winpct' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>Win %</button>
            <button onClick={() => setSort('wins')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${sort === 'wins' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>Wins</button>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-slate-500 text-xs">Min bets:</span>
            {[2, 3, 5].map(n => (
              <button key={n} onClick={() => setMinBets(n)} className={`w-7 h-6 rounded text-xs font-bold transition-colors ${minBets === n ? 'bg-yellow-500 text-slate-900' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>{n}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs border-b border-slate-700 bg-slate-800/80">
                <th className="text-left px-4 py-2">Team</th>
                <th className="text-center px-3 py-2">W</th>
                <th className="text-center px-3 py-2">L</th>
                <th className="text-center px-3 py-2">P</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-right px-4 py-2 min-w-[120px]">Win %</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(t => {
                const s = view === 'bet' ? t.betOn : t.faded
                const total = view === 'bet' ? t.betTotal : t.fadeTotal
                const pct = view === 'bet' ? t.betWinPct : t.fadeWinPct
                return (
                  <tr key={t.team} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-200">{t.team}</td>
                    <td className="px-3 py-2.5 text-center text-green-400 font-bold">{s.W}</td>
                    <td className="px-3 py-2.5 text-center text-red-400 font-bold">{s.L}</td>
                    <td className="px-3 py-2.5 text-center text-yellow-400">{s.P || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{total}</td>
                    <td className="px-4 py-2.5">
                      <WinBar wins={s.W} losses={s.L} />
                    </td>
                  </tr>
                )
              })}
              {displayed.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">No teams with {minBets}+ bets</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-slate-600 text-xs px-1">Player props counted toward the player's team. Totals, exotic, and non-NFL bets excluded.</p>
    </div>
  )
}
