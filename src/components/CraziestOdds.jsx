const PLAYER_COLORS = {
  BRITTON: '#f59e0b', CHRIS: '#3b82f6', COLBY: '#10b981',
  NATHAN: '#a855f7', SEAN: '#ef4444', LUCAS: '#f97316', KADEN: '#06b6d4',
}
function getColor(name) {
  return PLAYER_COLORS[name?.trim().toUpperCase()] || '#94a3b8'
}
function formatOdds(odds) {
  if (odds === null || odds === undefined) return '—'
  return odds > 0 ? `+${odds}` : `${odds}`
}
function impliedProb(odds) {
  if (!odds) return null
  if (odds > 0) return Math.round((100 / (odds + 100)) * 100)
  return Math.round((Math.abs(odds) / (Math.abs(odds) + 100)) * 100)
}

export default function CraziestOdds({ seasons }) {
  // Collect all winning picks with positive (underdog) odds
  const underdogWins = []
  const bigFavWins = []
  const weeklyParlayOdds = []

  for (const season of seasons) {
    for (const week of season.weeks) {
      const completePicks = week.picks.filter(p => p.result && p.odds !== null)
      if (!completePicks.length) continue

      for (const pick of completePicks) {
        if (pick.result === 'W' && pick.odds >= 100) {
          underdogWins.push({ ...pick, year: season.year, weekNum: week.weekNum })
        }
        if (pick.result === 'W' && pick.odds <= -200) {
          bigFavWins.push({ ...pick, year: season.year, weekNum: week.weekNum })
        }
      }

      // Compute the theoretical parlay payout if all picks have odds
      const allHaveOdds = week.picks.every(p => p.odds !== null)
      if (allHaveOdds && week.parlayResult) {
        const payout = week.picks.reduce((acc, p) => {
          const dec = p.odds > 0 ? p.odds / 100 + 1 : 100 / Math.abs(p.odds) + 1
          return acc * dec
        }, 1)
        weeklyParlayOdds.push({
          year: season.year,
          weekNum: week.weekNum,
          payout: Math.round((payout - 1) * 100),
          result: week.parlayResult,
          picks: week.picks,
        })
      }
    }
  }

  underdogWins.sort((a, b) => b.odds - a.odds)
  bigFavWins.sort((a, b) => a.odds - b.odds)
  weeklyParlayOdds.sort((a, b) => b.payout - a.payout)

  const topUnderdogs = underdogWins.slice(0, 10)
  const topParlays = weeklyParlayOdds.slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Top underdog wins */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 bg-gradient-to-r from-green-900/30 to-transparent">
          <h2 className="font-semibold text-green-300">🎰 Biggest Underdog Wins</h2>
          <p className="text-slate-500 text-xs mt-0.5">Picks that hit at +100 or better</p>
        </div>
        {topUnderdogs.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No underdog wins with recorded odds yet</div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {topUnderdogs.map((pick, i) => (
              <div key={`${pick.year}-${pick.weekNum}-${pick.player}`} className="flex items-center gap-3 px-4 py-3">
                <div className="text-slate-500 font-mono text-sm w-6 shrink-0">#{i + 1}</div>
                <div
                  className="w-2 h-10 rounded-full shrink-0"
                  style={{ background: getColor(pick.player) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm" style={{ color: getColor(pick.player) }}>
                      {pick.player}
                    </span>
                    <span className="text-slate-500 text-xs">{pick.year} Wk {pick.weekNum}</span>
                  </div>
                  <div className="text-slate-200 text-sm truncate">{pick.lock}</div>
                  {pick.game && <div className="text-slate-500 text-xs">{pick.game}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-green-400 font-black font-mono text-lg">
                    {formatOdds(pick.odds)}
                  </div>
                  <div className="text-slate-500 text-xs">{impliedProb(pick.odds)}% implied</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Biggest chalk wins (they won but barely deserved praise) */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 bg-gradient-to-r from-pink-900/20 to-transparent">
          <h2 className="font-semibold text-pink-300">🐭 Most Mickey Mouse Picks That Won</h2>
          <p className="text-slate-500 text-xs mt-0.5">Biggest chalk plays (-200 or worse) that technically hit</p>
        </div>
        {bigFavWins.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No heavy chalk wins with recorded odds</div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {bigFavWins.slice(0, 8).map((pick, i) => (
              <div key={`${pick.year}-${pick.weekNum}-${pick.player}`} className="flex items-center gap-3 px-4 py-3">
                <div className="text-slate-500 font-mono text-sm w-6 shrink-0">#{i + 1}</div>
                <div
                  className="w-2 h-10 rounded-full shrink-0"
                  style={{ background: getColor(pick.player) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm" style={{ color: getColor(pick.player) }}>
                      {pick.player}
                    </span>
                    <span className="text-slate-500 text-xs">{pick.year} Wk {pick.weekNum}</span>
                  </div>
                  <div className="text-slate-200 text-sm truncate">{pick.lock}</div>
                  {pick.game && <div className="text-slate-500 text-xs">{pick.game}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-red-400 font-black font-mono text-lg">
                    {formatOdds(pick.odds)}
                  </div>
                  <div className="text-slate-500 text-xs">{impliedProb(pick.odds)}% implied</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Best group parlay weeks */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 bg-gradient-to-r from-yellow-900/20 to-transparent">
          <h2 className="font-semibold text-yellow-300">💰 Biggest Group Parlay Weeks</h2>
          <p className="text-slate-500 text-xs mt-0.5">Combined parlay payout on $100 stake</p>
        </div>
        {topParlays.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No complete weeks with full odds data yet</div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {topParlays.map((w, i) => (
              <div key={`${w.year}-${w.weekNum}`} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono text-sm w-6">#{i + 1}</span>
                    <span className="font-semibold text-slate-200">
                      {w.year} · Week {w.weekNum}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      w.result === 'W'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {w.result === 'W' ? '✅ HIT' : '❌ LOST'}
                    </span>
                  </div>
                  <div className={`font-black font-mono text-xl ${w.result === 'W' ? 'text-green-400' : 'text-slate-500'}`}>
                    +{w.payout}%
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2 ml-8">
                  {w.picks.map(p => (
                    <span key={p.player} className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                      <span style={{ color: getColor(p.player) }}>{p.player}</span>
                      {p.odds ? ` ${formatOdds(p.odds)}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
