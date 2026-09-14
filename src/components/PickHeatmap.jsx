import { useState, useMemo } from 'react'
import { useScores } from '../useScores.js'
import { findEspnGame, matchPickToScore, buildOutcomeString, findGameForProp } from '../scoreUtils.js'
import { parsePropIntent } from '../teamUtils.js'
import { usePlayerStat } from '../usePlayerStats.js'

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

function PropStatDisplay({ year, weekNum, pick }) {
  const intent = parsePropIntent(pick.lock)
  const { data } = usePlayerStat(year, weekNum, pick.lock, !!intent)
  if (!intent || !data) return null
  if (!data.playerName || data.actual == null) {
    // Game was found but player not in box score (DNP / inactive)
    if (!data.gameShortName) return null
    const hit = intent.ou === 'under'
    return (
      <div className="text-xs bg-slate-700/60 rounded px-2 py-1 mt-1">
        <span className="text-slate-400">{intent.playerFrag}: </span>
        <span className="text-slate-200 font-semibold">DNP</span>
        <span className={`ml-1 ${hit ? 'text-green-400' : 'text-red-400'}`}>{hit ? '· hit' : '· miss'}</span>
      </div>
    )
  }
  const val = parseFloat(data.actual)
  const hit = intent.ou === 'over' ? val > intent.line : val < intent.line
  return (
    <div className="text-xs bg-slate-700/60 rounded px-2 py-1 mt-1">
      <span className="text-slate-400">{data.playerName}: </span>
      <span className="text-slate-200 font-semibold">{data.actual} {data.label}</span>
      <span className={`ml-1 ${hit ? 'text-green-400' : 'text-red-400'}`}>{hit ? '· hit' : '· miss'}</span>
    </div>
  )
}

export default function PickHeatmap({ weeks, players, title = 'Pick Heatmap', year }) {
  const [popover, setPopover] = useState(null) // { player, weekNum, pick, isMickey }

  const sorted = [...weeks].sort((a, b) => a.weekNum - b.weekNum)
  const weekNums = sorted.map(w => w.weekNum)

  const nflWeekNums = useMemo(() => sorted
    .filter(w => w.picks.some(p => !p.sport || p.sport === 'NFL'))
    .map(w => w.weekNum), [sorted])

  const espnScores = useScores(year, nflWeekNums)

  function resolveOutcome(pick, weekNum) {
    if (pick.outcome) return pick.outcome
    if (pick.sport && pick.sport !== 'NFL') return null
    const games = espnScores[`${year}-${weekNum}`]
    if (!games?.length) return null
    const espnGame = pick.game
      ? findEspnGame(games, pick.game)
      : findGameForProp(games, pick.lock)
    if (!espnGame) return null
    const matched = matchPickToScore(espnGame, pick.game || '', pick.lock)
    return matched?.outcome ?? buildOutcomeString(espnGame)
  }

  const lookup = {}
  for (const w of sorted) {
    lookup[w.weekNum] = {}
    for (const p of w.picks) {
      lookup[w.weekNum][p.player.trim().toUpperCase()] = p
    }
  }

  const cellSize = 'w-7 h-7'

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h2 className="font-semibold text-slate-200 text-sm">{title}</h2>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500/70 inline-block" /> W</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/60 inline-block" /> L</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-600/60 inline-block" /> —</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0.5 p-2">
          <thead>
            <tr>
              <th className="text-left pr-3 pb-1 text-slate-500 font-medium text-xs sticky left-0 bg-slate-800 z-10 min-w-[70px]">Player</th>
              {weekNums.map(wn => (
                <th key={wn} className="text-center text-slate-500 font-medium pb-1 px-0.5 min-w-[28px]">{wn}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(player => {
              const p = player.trim().toUpperCase()
              return (
                <tr key={p}>
                  <td className="pr-3 py-0.5 font-semibold sticky left-0 bg-slate-800 z-10" style={{ color: getColor(p) }}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </td>
                  {weekNums.map(wn => {
                    const pick = lookup[wn]?.[p]
                    const week = sorted.find(w => w.weekNum === wn)
                    const isMickey = week?.mickeyMouse?.trim().toUpperCase() === p
                    const result = pick?.result
                    const isSelected = popover?.player === p && popover?.weekNum === wn

                    let bg = 'bg-slate-700/40'
                    if (result === 'W') bg = 'bg-green-500/70'
                    else if (result === 'L') bg = isMickey ? 'bg-red-600/80 ring-1 ring-pink-400' : 'bg-red-500/60'
                    else if (result === 'P') bg = 'bg-slate-500/60'

                    const hasPick = !!(pick?.lock || pick?.result)

                    return (
                      <td key={wn} className="py-0.5 px-0.5 text-center relative">
                        <button
                          className={`${cellSize} rounded-sm ${bg} flex items-center justify-center transition-all ${
                            hasPick ? 'cursor-pointer hover:opacity-80 hover:scale-110' : 'cursor-default'
                          } ${isSelected ? 'ring-2 ring-white/60 scale-110' : ''}`}
                          onClick={() => {
                            if (!hasPick) return
                            setPopover(isSelected ? null : { player: p, weekNum: wn, pick, isMickey })
                          }}
                        >
                          {isMickey && result === 'L' && <span className="text-[9px] leading-none">🐭</span>}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pick detail card */}
      {popover && (
        <div className="border-t border-slate-700 px-4 py-3 bg-slate-900/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-sm" style={{ color: getColor(popover.player) }}>{popover.player}</span>
              <span className="text-slate-500 text-xs">·</span>
              <span className="text-slate-400 text-xs">Week {popover.weekNum}</span>
              {popover.isMickey && <span className="text-pink-400 text-xs">🐭 Mickey Mouse</span>}
            </div>
            <button onClick={() => setPopover(null)} className="text-slate-500 hover:text-slate-300 text-sm shrink-0">✕</button>
          </div>
          <div className="bg-slate-800 rounded-lg p-3 space-y-1.5">
            {popover.pick.game && <div className="text-slate-500 text-xs">{popover.pick.game}</div>}
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-semibold">{popover.pick.lock || '—'}</span>
              {popover.pick.odds && <span className="font-mono text-xs text-slate-400">{formatOdds(popover.pick.odds)}</span>}
            </div>
            {(() => {
              const outcome = resolveOutcome(popover.pick, popover.weekNum)
              return outcome ? (
                <div className="text-xs bg-slate-700/60 rounded px-2 py-1">
                  <span className="text-slate-500">Final:</span>{' '}
                  <span className={`font-semibold ${popover.pick.result === 'W' ? 'text-green-400/80' : popover.pick.result === 'L' ? 'text-red-400/80' : 'text-slate-300'}`}>{outcome}</span>
                </div>
              ) : null
            })()}
            {parsePropIntent(popover.pick.lock) && (
              <PropStatDisplay year={year} weekNum={popover.weekNum} pick={popover.pick} />
            )}
            {popover.pick.result && (
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${
                popover.pick.result === 'W' ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : popover.pick.result === 'L' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
              }`}>{popover.pick.result}{popover.isMickey ? ' 🐭' : ''}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
