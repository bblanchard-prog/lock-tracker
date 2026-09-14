import { useState, useMemo } from 'react'
import { buildTeamStats } from '../teamUtils.js'
import { computeCoverageMargin, formatMargin } from '../outcomeUtils.js'
import { useMultiYearScores } from '../useScores.js'
import { findEspnGame, matchPickToScore, buildOutcomeString } from '../scoreUtils.js'

const PLAYER_COLORS = {
  BRITTON: '#f59e0b', CHRIS: '#3b82f6', COLBY: '#10b981',
  NATHAN: '#a855f7', SEAN: '#ef4444', LUCAS: '#f97316', KADEN: '#06b6d4',
}
function getColor(name) { return PLAYER_COLORS[name?.trim().toUpperCase()] || '#94a3b8' }
function formatOdds(o) { if (o == null) return '—'; return o > 0 ? `+${o}` : `${o}` }

function YearSection({ year, entries, playerName }) {
  const [open, setOpen] = useState(false)
  const wins = entries.filter(e => e.pick.result === 'W').length
  const losses = entries.filter(e => e.pick.result === 'L').length
  const pushes = entries.filter(e => e.pick.result === 'P').length
  const pct = wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : null
  const validOdds = entries.filter(e => e.pick.odds != null)
  const avgOdds = validOdds.length > 0
    ? Math.round(validOdds.reduce((s, e) => s + e.pick.odds, 0) / validOdds.length)
    : null
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-2.5 bg-slate-700/40 border-b border-t border-slate-700 hover:bg-slate-700/60 transition-colors text-left"
      >
        <span className="text-yellow-400 font-bold text-sm">{year}</span>
        {avgOdds !== null && <span className="text-slate-500 text-xs">{avgOdds > 0 ? `+${avgOdds}` : avgOdds}</span>}
        <span className="text-green-400 text-xs font-semibold">{wins}W</span>
        <span className="text-red-400 text-xs font-semibold">{losses}L</span>
        {pushes > 0 && <span className="text-yellow-400 text-xs font-semibold">{pushes}P</span>}
        {pct !== null && <span className="text-slate-400 text-xs">{pct}%</span>}
        <svg className={`w-3.5 h-3.5 text-slate-500 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <table className="w-full text-sm">
          <tbody>
            {entries.map(({ weekNum, pick, mickeyMouse }, i) => {
              const isMickey = mickeyMouse?.toUpperCase() === playerName
              const coverage = computeCoverageMargin(pick)
              return (
                <tr key={i} className={`border-b border-slate-700/40 ${isMickey ? 'bg-pink-900/15' : ''}`}>
                  <td className="px-4 py-2.5 text-slate-500 text-xs w-12 shrink-0">Wk {weekNum}</td>
                  <td className="px-2 py-2.5">
                    <div className="text-slate-200 text-sm font-medium">{pick.lock || '—'}</div>
                    {pick.game && <div className="text-slate-600 text-xs mt-0.5">{pick.game}</div>}
                    {pick.outcome && (
                      <div className="text-xs mt-1 flex items-center gap-1.5">
                        <span className="text-slate-600">Final:</span>
                        <span className={`font-semibold ${
                          pick.result === 'W' ? 'text-green-400/80' : pick.result === 'L' ? 'text-red-400/80' : 'text-slate-400'
                        }`}>{pick.outcome}</span>
                        {coverage && (
                          <span className={`text-[10px] font-bold ml-1 ${coverage.margin > 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                            ({coverage.margin > 0 ? '+' : ''}{formatMargin(coverage.margin)})
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-xs text-slate-500 shrink-0">{formatOdds(pick.odds)}</td>
                  <td className="px-3 py-2.5 text-right shrink-0">
                    <div className="flex items-center justify-end gap-1.5">
                      {pick.result ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          pick.result === 'W' ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : pick.result === 'L' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        }`}>{pick.result}</span>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                      {isMickey && <span className="text-xs">🐭</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function PlayerProfileModal({ playerName, seasonsWithOverrides, onClose, onOpenShame }) {
  const pData = useMemo(() => {
    const hist = []
    for (const s of seasonsWithOverrides) {
      for (const week of s.weeks) {
        for (const pick of week.picks) {
          if (pick.player.trim().toUpperCase() !== playerName) continue
          if (!pick.result && !pick.lock) continue
          hist.push({ year: s.year, weekNum: week.weekNum, pick, mickeyMouse: week.mickeyMouse })
        }
      }
    }
    return hist
  }, [playerName, seasonsWithOverrides])

  // Only fetch ESPN scores for NFL weeks where at least one pick is missing an outcome
  const yearWeekPairs = useMemo(() => {
    const seen = new Set()
    const pairs = []
    for (const e of pData) {
      if (e.pick.sport && e.pick.sport !== 'NFL') continue
      if (e.pick.outcome) continue
      const key = `${e.year}-${e.weekNum}`
      if (!seen.has(key)) { seen.add(key); pairs.push({ year: e.year, week: e.weekNum }) }
    }
    return pairs
  }, [pData])

  const espnScores = useMultiYearScores(yearWeekPairs)

  const stats = useMemo(() => {
    let wins = 0, losses = 0, pushes = 0, mickeys = 0
    const seasonSet = new Set()
    for (const e of pData) {
      if (e.pick.result === 'W') wins++
      else if (e.pick.result === 'L') losses++
      else if (e.pick.result === 'P') pushes++
      seasonSet.add(e.year)
    }
    for (const s of seasonsWithOverrides) {
      for (const w of s.weeks) {
        if (w.mickeyMouse?.trim().toUpperCase() === playerName) mickeys++
      }
    }
    const winPct = wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : null
    return { wins, losses, pushes, mickeys, seasons: seasonSet.size, winPct }
  }, [pData, playerName, seasonsWithOverrides])

  const streaks = useMemo(() => {
    let winCur = 0, bestWin = 0, lossCur = 0, bestLoss = 0, curType = null
    for (const e of pData) {
      const r = e.pick.result
      if (r === 'W') {
        if (curType === 'W') winCur++
        else { winCur = 1; lossCur = 0 }
        curType = 'W'
        if (winCur > bestWin) bestWin = winCur
      } else if (r === 'L') {
        if (curType === 'L') lossCur++
        else { lossCur = 1; winCur = 0 }
        curType = 'L'
        if (lossCur > bestLoss) bestLoss = lossCur
      }
    }
    const cur = curType === 'W' ? { type: 'W', count: winCur }
              : curType === 'L' ? { type: 'L', count: lossCur } : null
    return { bestWin, bestLoss, cur }
  }, [pData])

  // Enrich pData with ESPN outcomes where available
  const enrichedData = useMemo(() => pData.map(e => {
    const espnOutcome = (() => {
      if (e.pick.outcome) return e.pick.outcome
      if (e.pick.sport && e.pick.sport !== 'NFL') return null
      const key = `${e.year}-${e.weekNum}`
      const games = espnScores[key]
      if (!games?.length) return null
      const espnGame = findEspnGame(games, e.pick.game)
      if (!espnGame) return null
      const matched = matchPickToScore(espnGame, e.pick.game, e.pick.lock)
      return matched?.outcome ?? buildOutcomeString(espnGame)
    })()
    return espnOutcome ? { ...e, pick: { ...e.pick, outcome: espnOutcome } } : e
  }), [pData, espnScores])

  const { highlights, biggestUpsetsWin } = useMemo(() => {
    const oddsWins = enrichedData.filter(e => e.pick.result === 'W' && e.pick.odds != null)
    const biggestUpsetsWin = oddsWins.length
      ? oddsWins.reduce((b, e) => e.pick.odds > b.pick.odds ? e : b)
      : null

    const withMargin = enrichedData.map(e => {
      const m = computeCoverageMargin(e.pick)
      return m ? { ...e, coverage: m } : null
    }).filter(Boolean)

    const covered = withMargin.filter(e => e.coverage.margin > 0)
    const missed  = withMargin.filter(e => e.coverage.margin < 0)

    const noSweat      = covered.length     ? covered.reduce((b, e) => e.coverage.margin > b.coverage.margin ? e : b) : null
    // Only show closest cover if it's a different pick than no sweat
    const closestCoverRaw = covered.length > 1 ? covered.reduce((b, e) => e.coverage.margin < b.coverage.margin ? e : b) : null
    const closestCover = closestCoverRaw && closestCoverRaw !== noSweat ? closestCoverRaw : null
    // Closest miss: negative margin nearest 0
    const closestMissRaw = missed.length ? missed.reduce((b, e) => e.coverage.margin > b.coverage.margin ? e : b) : null
    // Not Even Close: most negative margin — only show if it's a different pick than closest miss
    const notEvenCloseRaw = missed.length ? missed.reduce((b, e) => e.coverage.margin < b.coverage.margin ? e : b) : null
    const closestMiss  = closestMissRaw
    const notEvenClose = notEvenCloseRaw && notEvenCloseRaw !== closestMissRaw ? notEvenCloseRaw : null

    return { highlights: { noSweat, closestCover, closestMiss, notEvenClose }, biggestUpsetsWin }
  }, [enrichedData])

  const teamTendencies = useMemo(() => {
    const fakeSeason = [{ year: 9999, weeks: enrichedData.map(({ weekNum, pick }) => ({ weekNum, picks: [{ ...pick, player: playerName }] })) }]
    const ts = buildTeamStats(fakeSeason)
    const sn = full => full.split(' ').pop()
    return {
      betOnTop:   [...ts].filter(t => t.betTotal >= 3).sort((a, b) => b.betTotal - a.betTotal).slice(0, 4),
      betOnBest:  [...ts].filter(t => t.betTotal >= 3).sort((a, b) => b.betWinPct - a.betWinPct).slice(0, 4),
      betOnWorst: [...ts].filter(t => t.betTotal >= 3).sort((a, b) => a.betWinPct - b.betWinPct).slice(0, 4),
      fadedTop:   [...ts].filter(t => t.fadeTotal >= 3).sort((a, b) => b.fadeTotal - a.fadeTotal).slice(0, 4),
      fadedBest:  [...ts].filter(t => t.fadeTotal >= 3).sort((a, b) => b.fadeWinPct - a.fadeWinPct).slice(0, 4),
      fadedWorst: [...ts].filter(t => t.fadeTotal >= 3).sort((a, b) => a.fadeWinPct - b.fadeWinPct).slice(0, 4),
      sn,
    }
  }, [pData, playerName])

  const byYear = useMemo(() => {
    const m = {}
    enrichedData.forEach(e => { if (!m[e.year]) m[e.year] = []; m[e.year].push(e) })
    return m
  }, [enrichedData])
  const years = Object.keys(byYear).sort((a, b) => b - a)

  function marginSubLabel(cov) {
    const m = formatMargin(cov.margin)
    if (cov.type === 'total') {
      return cov.margin > 0 ? `hit by ${m} (total: ${cov.actual})` : `missed by ${m} (total: ${cov.actual})`
    }
    return cov.margin > 0 ? `covered by ${m}` : `missed cover by ${formatMargin(Math.abs(cov.margin))}`
  }

  const { noSweat, closestCover, closestMiss, notEvenClose } = highlights
  const hasHighlights = noSweat || closestCover || closestMiss || notEvenClose || biggestUpsetsWin
  const tt = teamTendencies
  const hasTendencies = tt.betOnTop.length > 0 || tt.fadedTop.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-start justify-between" style={{ borderLeftColor: getColor(playerName), borderLeftWidth: 4 }}>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-2xl" style={{ color: getColor(playerName) }}>{playerName}</h2>
            <div className="flex flex-wrap gap-3 mt-1 text-sm items-center">
              <span className="text-green-400 font-bold">{stats.wins}W</span>
              <span className="text-red-400 font-bold">{stats.losses}L</span>
              {stats.pushes > 0 && <span className="text-yellow-400 font-bold">{stats.pushes}P</span>}
              {stats.winPct !== null && <span className="text-slate-300 font-bold">{stats.winPct}%</span>}
              <span className="text-slate-500 text-xs">{stats.seasons} season{stats.seasons !== 1 ? 's' : ''}</span>
              {stats.mickeys > 0 && (
                <button
                  onClick={() => { onClose(); onOpenShame(playerName) }}
                  className="text-pink-400 hover:underline font-bold text-xs bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20"
                >
                  🐭 ×{stats.mickeys}
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl ml-3 shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">

          {/* Streak strip */}
          <div className="grid grid-cols-4 divide-x divide-slate-700 border-b border-slate-700 bg-slate-700/20">
            <div className="px-2 py-2.5 text-center">
              <div className="text-orange-400 font-black text-lg">{streaks.bestWin}</div>
              <div className="text-slate-500 text-[10px]">Best W streak</div>
            </div>
            <div className="px-2 py-2.5 text-center">
              <div className="text-blue-400 font-black text-lg">{streaks.bestLoss}</div>
              <div className="text-slate-500 text-[10px]">Worst L streak</div>
            </div>
            <div className="px-2 py-2.5 text-center">
              {streaks.cur
                ? <><div className={`font-black text-lg ${streaks.cur.type === 'W' ? 'text-green-400' : 'text-red-400'}`}>{streaks.cur.count}</div><div className="text-slate-500 text-[10px]">Current {streaks.cur.type}</div></>
                : <><div className="text-slate-500 font-black text-lg">—</div><div className="text-slate-500 text-[10px]">Streak</div></>}
            </div>
            <div className="px-2 py-2.5 text-center">
              {biggestUpsetsWin
                ? <><div className="text-green-400 font-black text-lg">{biggestUpsetsWin.pick.odds > 0 ? `+${biggestUpsetsWin.pick.odds}` : biggestUpsetsWin.pick.odds}</div><div className="text-slate-500 text-[10px]">Best odds W</div></>
                : <><div className="text-slate-500 font-black text-lg">—</div><div className="text-slate-500 text-[10px]">Best odds W</div></>}
            </div>
          </div>

          {/* Pick highlights */}
          {hasHighlights && (
            <div className="border-b border-slate-700 px-4 py-3 space-y-2">
              <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Pick Highlights</div>
              {[
                noSweat       && { label: '🛋️ No Sweat',       sub: marginSubLabel(noSweat.coverage),       e: noSweat,       color: 'green',  badge: `+${formatMargin(noSweat.coverage.margin)}` },
                closestCover  && { label: '😅 Closest W',       sub: marginSubLabel(closestCover.coverage),  e: closestCover,  color: 'green',  badge: `+${formatMargin(closestCover.coverage.margin)}` },
                closestMiss    && { label: '😬 Closest Miss',     sub: marginSubLabel(closestMiss.coverage),    e: closestMiss,    color: 'red', badge: `-${formatMargin(Math.abs(closestMiss.coverage.margin))}` },
                notEvenClose   && { label: '🤦 Not Even Close',  sub: marginSubLabel(notEvenClose.coverage),   e: notEvenClose,   color: 'red', badge: `-${formatMargin(Math.abs(notEvenClose.coverage.margin))}` },
                biggestUpsetsWin && { label: '🚀 Biggest Upset W', sub: 'Biggest underdog win',                e: biggestUpsetsWin, color: 'yellow', badge: biggestUpsetsWin.pick.odds > 0 ? `+${biggestUpsetsWin.pick.odds}` : `${biggestUpsetsWin.pick.odds}` },
              ].filter(Boolean).map(({ label, sub, e, color, badge }) => {
                const borderCls = color === 'green' ? 'border-green-500/20 bg-green-500/5' : color === 'yellow' ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-red-500/20 bg-red-500/5'
                const textCls   = color === 'green' ? 'text-green-400' : color === 'yellow' ? 'text-yellow-400' : 'text-red-400'
                return (
                  <div key={label} className={`border rounded-lg px-3 py-2 ${borderCls}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold shrink-0 ${textCls}`}>{label}</span>
                      <span className="text-slate-500 text-xs shrink-0">{e.year} Wk{e.weekNum}</span>
                      <span className={`font-mono text-xs font-bold ml-auto shrink-0 ${textCls}`}>{badge}</span>
                    </div>
                    <div className="text-slate-200 text-sm font-medium mt-0.5 truncate">{e.pick.lock}</div>
                    <div className="text-slate-500 text-xs">{sub}{e.pick.outcome ? ` · ${e.pick.outcome}` : e.pick.game ? ` · ${e.pick.game}` : ''}</div>
                  </div>
                )
              })}
              {!noSweat && !closestCover && !closestMiss && !notEvenClose && (
                <p className="text-slate-600 text-xs">Add final scores in the Season view to unlock margin-based highlights.</p>
              )}
            </div>
          )}

          {/* Team tendencies */}
          {hasTendencies && (
            <div className="border-b border-slate-700 px-4 py-3">
              <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Team Tendencies <span className="normal-case font-normal text-slate-600">(min 3 bets)</span></div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  { title: '💰 Most bet on',        data: tt.betOnTop,   s: t => t.betOn,  pct: t => t.betWinPct,  pc: 'text-slate-400' },
                  { title: '✅ Best when betting',  data: tt.betOnBest,  s: t => t.betOn,  pct: t => t.betWinPct,  pc: 'text-green-400' },
                  { title: '❌ Worst when betting', data: tt.betOnWorst, s: t => t.betOn,  pct: t => t.betWinPct,  pc: 'text-red-400' },
                  { title: '🔥 Most faded',         data: tt.fadedTop,   s: t => t.faded, pct: t => t.fadeWinPct, pc: 'text-slate-400' },
                  { title: '✅ Best when fading',   data: tt.fadedBest,  s: t => t.faded, pct: t => t.fadeWinPct, pc: 'text-green-400' },
                  { title: '❌ Worst when fading',  data: tt.fadedWorst, s: t => t.faded, pct: t => t.fadeWinPct, pc: 'text-red-400' },
                ].filter(({ data }) => data.length > 0).map(({ title, data, s, pct, pc }) => (
                  <div key={title}>
                    <div className="text-slate-400 text-xs font-semibold mb-1.5">{title}</div>
                    <div className="space-y-1">
                      {data.map(t => {
                        const st = s(t)
                        return (
                          <div key={t.team} className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-200 font-semibold flex-1 truncate">{tt.sn(t.team)}</span>
                            <span className="text-green-400 font-bold">{st.W}W</span>
                            <span className="text-red-400">{st.L}L</span>
                            <span className={`font-bold w-8 text-right ${pc}`}>{pct(t)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pick history by year */}
          {years.map(year => (
            <YearSection key={year} year={Number(year)} entries={byYear[year]} playerName={playerName} />
          ))}

        </div>
      </div>
    </div>
  )
}
