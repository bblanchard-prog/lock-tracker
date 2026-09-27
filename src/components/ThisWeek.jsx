import { useState, useEffect, useRef } from 'react'
import { getGamesForWeek, NFL_WEEKS, getCurrentNflWeek, CURRENT_SEASON } from '../nflSchedule.js'
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
  s = s.replace(/\bover\s+/gi, 'o').replace(/\bunder\s+/gi, 'u')
  s = s.replace(/\bO(\d)/g, 'o$1').replace(/\bU(\d)/g, 'u$1')
  const STAT_MAP = [
    [/\b(receiving yards|rec yards|rec yds)\b/gi, 'Rec Yds'],
    [/\b(rush(?:ing)? yards?|rush(?:ing)? yds)\b/gi, 'Rush Yds'],
    [/\b(rush(?:ing)? att(?:empts?)?)\b/gi, 'Car'],
    [/\b(pass(?:ing)? yards?|pass yds)\b/gi, 'Pass Yds'],
    [/\b(pass(?:ing)? att(?:empts?)?|pass att)\b/gi, 'Pass Att'],
    [/\b(pass(?:ing)? tds?|td pass(?:es)?)\b/gi, 'Pass TD'],
    [/\b(carries|carry|rushes|rushing|rush)\b/gi, 'Car'],
    [/\b(catches|catch|receptions?)\b/gi, 'Rec'],
    [/\b(touchdowns?|tds?)\b/gi, 'TD'],
    [/\b(completions?|comp|cmp)\b/gi, 'Comp'],
    [/\b(extra points?|pats?|xps?)\b/gi, 'PAT'],
    [/\b(field goals?|fgs?|total fgs?)\b/gi, 'FG'],
  ]
  for (const [re, canonical] of STAT_MAP) {
    s = s.replace(re, canonical)
  }
  const NAME_MAP = [
    [/wan[''’]?dale robinson/gi, "Wan'Dale Robinson"],
    [/wan[''’]?dale/gi, "Wan'Dale"],
    [/mike washington jr\.?/gi, 'Mike Washington Jr.'],
    [/mike washington(?! jr)/gi, 'Mike Washington Jr.'],
  ]
  for (const [re, canonical] of NAME_MAP) {
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
  if (/^.+?\s+(o(?:ver)?|u(?:nder)?)\s*\d+\.?\d*\s+\S.*$/i.test(s)) return 'prop'
  return 'ml'
}

function parseLineMeta(lock) {
  // Extract { ou, line } for total/prop/team_total displays
  const m = lock.match(/(o(?:ver)?|u(?:nder)?)\s*(\d+\.?\d*)/i)
  if (!m) return null
  return { ou: /^o/i.test(m[1]) ? 'over' : 'under', line: parseFloat(m[2]) }
}

const TEAM_KEYWORD_TO_ABBR = {
  'BEARS': 'CHI', 'BENGALS': 'CIN', 'BILLS': 'BUF', 'BRONCOS': 'DEN',
  'BROWNS': 'CLE', 'BUCCANEERS': 'TB', 'BUCS': 'TB', 'CARDINALS': 'ARI',
  'CHARGERS': 'LAC', 'CHIEFS': 'KC', 'COLTS': 'IND', 'COMMANDERS': 'WSH',
  'COWBOYS': 'DAL', 'DOLPHINS': 'MIA', 'EAGLES': 'PHI', 'FALCONS': 'ATL',
  'GIANTS': 'NYG', 'JAGUARS': 'JAX', 'JAGS': 'JAX', 'JETS': 'NYJ',
  'LIONS': 'DET', 'PACKERS': 'GB', 'PANTHERS': 'CAR', 'PATRIOTS': 'NE',
  'PATS': 'NE', 'RAIDERS': 'LV', 'RAMS': 'LAR', 'RAVENS': 'BAL',
  'SAINTS': 'NO', 'SEAHAWKS': 'SEA', 'HAWKS': 'SEA', 'STEELERS': 'PIT',
  'TEXANS': 'HOU', 'TITANS': 'TEN', 'VIKINGS': 'MIN',
  'NINERS': 'SF', '49ERS': 'SF',
}

function resolveTeam(raw) {
  return TEAM_KEYWORD_TO_ABBR[raw] || raw
}

function parseLiveMargin(lock, homeAbbr, awayAbbr, homeScore, awayScore) {
  if (!lock || homeScore == null || awayScore == null) return null
  const s = lock.trim().replace(/^(take|lock[:\s]*)\s*/i, '').trim()

  // Spread
  const spreadM = s.match(/^(.+?)\s*([+\-]\d+(?:\.\d+)?)\s*$/)
  if (spreadM) {
    const spread = parseFloat(spreadM[2])
    const teamRaw = resolveTeam(spreadM[1].trim().toUpperCase())
    const ha = homeAbbr?.toUpperCase(), aa = awayAbbr?.toUpperCase()
    const betHome = ha === teamRaw || teamRaw.includes(ha)
    const betAway = aa === teamRaw || teamRaw.includes(aa)
    const betScore = betHome ? homeScore : betAway ? awayScore : null
    const otherScore = betHome ? awayScore : betAway ? homeScore : null
    if (betScore === null) return null
    const margin = (betScore - otherScore) + spread
    return { margin, covered: margin > 0 }
  }

  // ML
  const teamRaw = resolveTeam(s.replace(/\s+ml\s*$/i, '').trim().toUpperCase())
  const ha = homeAbbr?.toUpperCase(), aa = awayAbbr?.toUpperCase()
  const betHome = ha === teamRaw || teamRaw.includes(ha)
  const betAway = aa === teamRaw || teamRaw.includes(aa)
  const betScore = betHome ? homeScore : betAway ? awayScore : null
  const otherScore = betHome ? awayScore : betAway ? homeScore : null
  if (betScore === null) return null
  return { margin: betScore - otherScore, covered: betScore > otherScore }
}

function ProgressBar({ current, target, ou, result }) {
  if (target == null || target === 0) return null
  const pct = Math.min(100, Math.round((current / target) * 100))
  let barColor
  if (result === 'W') barColor = 'bg-green-400'
  else if (result === 'L') barColor = 'bg-red-500'
  else if (result === 'P') barColor = 'bg-yellow-400'
  else {
    const over = ou === 'over'
    const crossed = current >= target
    barColor = crossed
      ? (over ? 'bg-green-400' : 'bg-red-500')
      : (over ? 'bg-yellow-400' : 'bg-green-400')
  }
  const textColor = barColor === 'bg-green-400' ? 'text-green-400' : barColor === 'bg-red-500' ? 'text-red-400' : 'text-yellow-400'
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <div className="h-2.5 bg-slate-700 rounded-sm overflow-hidden w-28">
        <div className={`h-full rounded-sm transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>
        {current} / {ou === 'over' ? 'o' : 'u'}{target}
      </span>
    </div>
  )
}

function LivePickStrip({ pick, weekNum, isLocked }) {
  const type = detectPickType(pick.lock)
  const isProp = type === 'prop'
  const isTotal = type === 'total' || type === 'team_total'

  // Game-score hook for spread/ML/total/team_total
  const gameData = useLiveGame(isLocked && !isProp ? pick.game : null, weekNum)

  // Prop stat hook — only poll live when not yet settled
  const { data: propData } = usePlayerStat(
    CURRENT_SEASON, weekNum, isLocked && isProp ? pick.lock : null, isLocked && isProp, pick.result ? null : 60000, pick.game ?? null
  )

  // Nothing renders until picks are locked (games haven't started yet)
  if (!isLocked) return null

  // ---- Settled state ----
  if (pick.result) {
    const fb = <span className="text-xs font-bold bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded tracking-wide">FINAL</span>

    if (isProp && propData) {
      const actual = propData.actual != null ? parseFloat(propData.actual) : null
      const { line, ou, label } = propData
      if (actual !== null) {
        return (
          <div className="mt-1.5">
            <div className="flex items-center gap-1.5">
              {fb}
              <span className="text-xs text-slate-300 font-medium">{propData.playerName || ''} · {actual} {label || ''}</span>
            </div>
            <ProgressBar current={actual} target={line} ou={ou} result={pick.result} />
          </div>
        )
      }
    }

    if (!isProp && gameData && gameData.homeScore != null && gameData.awayScore != null) {
      const { homeScore, awayScore, homeAbbr, awayAbbr } = gameData
      if (isTotal) {
        const meta = parseLineMeta(pick.lock)
        if (meta) {
          const isTeamTotal = type === 'team_total'
          const teamAbbr = isTeamTotal ? pick.lock.trim().split(/\s+/)[0].toUpperCase() : null
          const betTeamScore = isTeamTotal ? (homeAbbr?.toUpperCase() === teamAbbr ? homeScore : awayScore) : null
          const current = isTeamTotal ? betTeamScore : homeScore + awayScore
          return (
            <div className="mt-1.5">
              <div className="flex items-center gap-1.5">
                {fb}
                <span className="text-xs text-slate-300 font-medium">
                  {isTeamTotal ? `${teamAbbr} ${betTeamScore}` : `Total ${homeScore + awayScore}`}
                  <span className="text-slate-500 ml-1">· {meta.ou === 'over' ? 'o' : 'u'}{meta.line}</span>
                </span>
              </div>
              <ProgressBar current={current} target={meta.line} ou={meta.ou} result={pick.result} />
            </div>
          )
        }
      }
      const marginData = parseLiveMargin(pick.lock, homeAbbr, awayAbbr, homeScore, awayScore)
      const absMargin = marginData ? Math.abs(marginData.margin) : 0
      const coverStr = marginData
        ? marginData.covered
          ? `COVERED BY ${absMargin.toFixed(absMargin % 1 === 0 ? 0 : 1)}`
          : `MISSED BY ${absMargin.toFixed(absMargin % 1 === 0 ? 0 : 1)}`
        : ''
      return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {fb}
          <span className="text-xs text-slate-300 font-medium">{homeAbbr} {homeScore} · {awayAbbr} {awayScore}</span>
          {coverStr && <span className={`text-xs font-bold ${marginData?.covered ? 'text-green-400' : 'text-red-400'}`}>{coverStr}</span>}
        </div>
      )
    }

    return <div className="mt-1.5">{fb}</div>
  }

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

function formatSubmittedAt(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}h ago`
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatCountdown(lockTime, nowTs) {
  if (!lockTime) return null
  const diffMs = lockTime - nowTs
  if (diffMs <= 0) return null
  const h = Math.floor(diffMs / 3600000)
  const m = Math.floor((diffMs % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function buildShareText(picks, result, weekKey) {
  const emoji = result === 'W' ? '✅ WIN' : '❌ LOSS'
  const lines = picks.map(p => {
    const r = p.result === 'W' ? '✅' : p.result === 'L' ? '❌' : p.result === 'P' ? '🔁' : '⏳'
    const odds = p.odds ? ` (${p.odds > 0 ? '+' : ''}${p.odds})` : ''
    return `${r} ${p.player}: ${p.lock}${odds}`
  })
  return `Lock Tracker — ${weekKey}\nParlay: ${emoji}\n\n${lines.join('\n')}`
}

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

export default function ThisWeek({ showOdds, isGolden }) {
  const { request, Modal } = useAdminAuth()
  const [selectedWeek, setSelectedWeek] = useState(() => getCurrentNflWeek())
  const [picks, setPicks] = useState([])
  const [serverError, setServerError] = useState(null)
  const [weekStatuses, setWeekStatuses] = useState({})
  const [form, setForm] = useState({ player: '', game: '', lock: '', odds: '' })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [customGame, setCustomGame] = useState('')
  const [scheduleGames, setScheduleGames] = useState(null)
  const [nowTs, setNowTs] = useState(Date.now())
  const [toast, setToast] = useState(null)

  const weekKey = `${CURRENT_SEASON}-NFL-W${String(selectedWeek).padStart(2, '0')}`
  const staticGames = getGamesForWeek(selectedWeek)

  // Parlay lock: all picks lock when the earliest game in the submitted slip kicks off
  // Exclude TNF/Saturday — only Sunday/MNF games are in scope
  const sundayGames = scheduleGames?.filter(g => g.slot !== 'TNF' && g.slot !== 'Saturday')
  const pickedGameLabels = new Set(picks.map(p => normalizeGameString(p.game)).filter(Boolean))
  const slipGames = sundayGames?.filter(g => pickedGameLabels.has(normalizeGameString(g.label)))
  const lockTime = slipGames?.length
    ? Math.min(...slipGames.map(g => g.ts).filter(Boolean))
    : sundayGames?.length
      ? Math.min(...sundayGames.map(g => g.ts).filter(Boolean))
      : null
  const isLocked = lockTime ? nowTs >= lockTime : false

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
    try {
      const res = await fetch(`${API}/picks?week=${wk}`)
      const data = await res.json()
      setPicks(data.picks || [])
      setServerError(null)
    } catch {
      setServerError('Cannot reach server — is the app running with `npm run dev`?')
    }
  }

  async function fetchWeekStatuses() {
    try {
      const res = await fetch(`${API}/season-picks?year=${CURRENT_SEASON}`)
      if (!res.ok) return
      const data = await res.json()
      const statuses = {}
      for (const { weekNum, picks: wPicks } of (Array.isArray(data) ? data : [])) {
        if (!wPicks?.length) continue
        const withLocks = wPicks.filter(p => p.lock)
        if (!withLocks.length) continue
        const anyLoss = withLocks.some(p => p.result === 'L')
        const allDone = withLocks.every(p => p.result === 'W' || p.result === 'P')
        statuses[weekNum] = anyLoss ? 'L' : allDone ? 'W' : null
      }
      setWeekStatuses(statuses)
    } catch { /* silent */ }
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

  useEffect(() => {
    fetchWeekStatuses()
    const id = setInterval(fetchWeekStatuses, 60000)
    return () => clearInterval(id)
  }, [])

  // Keep nowTs fresh so isLocked flips at kickoff automatically
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // Auto-cleanse: clear form when picks lock
  useEffect(() => {
    if (isLocked) setForm({ player: '', game: '', lock: '', odds: '' })
  }, [isLocked])

  // Audit: if previous week has unsettled picks, hold on that week
  useEffect(() => {
    const currentWeek = getCurrentNflWeek()
    if (currentWeek <= 1) return
    const prevKey = `${CURRENT_SEASON}-NFL-W${String(currentWeek - 1).padStart(2, '0')}`
    fetch(`${API}/picks?week=${prevKey}`)
      .then(r => r.json())
      .then(data => {
        const prevPicks = data?.picks || data || []
        const hasUnsettled = prevPicks.some(p => p.lock && !p.result)
        if (hasUnsettled) setSelectedWeek(currentWeek - 1)
      })
      .catch(() => {})
  }, [])

  const isEditing = form.player && submittedPlayers.has(form.player.trim().toUpperCase())

  function validate() {
    if (!form.player) return 'Select your name'
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
      setToast(isEditing ? 'Lock updated!' : 'Locked in!')
      setForm({ player: '', game: '', lock: '', odds: '' })
      setCustomGame('')
      await fetchPicks(weekKey)
      setTimeout(() => setSubmitted(false), 3000)
      setTimeout(() => setToast(null), 2500)
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
    if (isLocked) return
    doDelete(player)
  }

  function handleEdit(pick) {
    setForm({ player: pick.player, game: pick.game || '', lock: pick.lock || '', odds: pick.odds != null ? String(pick.odds) : '' })
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-5">
      {Modal}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 bg-green-600 text-white text-sm font-semibold px-4 py-2.5 rounded-full shadow-lg animate-fade-in-up pointer-events-none">
          ✅ {toast}
        </div>
      )}

      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-4 text-sm">
          {serverError}
        </div>
      )}

      {/* Week selector */}
      <div className={`rounded-xl border p-4 ${isGolden ? 'bg-yellow-900/60 border-yellow-600/40' : 'bg-slate-800 border-slate-700'}`}>
        <label className="text-slate-400 text-xs block mb-2">{CURRENT_SEASON} NFL Season — Select Week</label>
        <div className="flex flex-wrap gap-2">
          {NFL_WEEKS.map(w => {
            const isFuture = w > getCurrentNflWeek()
            const wStatus = weekStatuses[w]
            return (
              <button
                key={w}
                onClick={() => !isFuture && setSelectedWeek(w)}
                disabled={isFuture}
                className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                  selectedWeek === w
                    ? 'bg-yellow-500 text-slate-900'
                    : isFuture
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                      : wStatus === 'W'
                        ? 'bg-green-700/60 text-green-200 hover:bg-green-700/80'
                        : wStatus === 'L'
                          ? 'bg-red-700/60 text-red-200 hover:bg-red-700/80'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {w}
              </button>
            )
          })}
        </div>
      </div>

      {/* Status bar */}
      <div className={`rounded-xl border p-4 flex flex-wrap gap-4 items-center ${isGolden ? 'bg-gradient-to-r from-yellow-900/80 to-amber-900/80 border-yellow-500/50 shadow shadow-yellow-700/30' : 'bg-slate-800 border-slate-700'}`}>
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
              <span key={p} className={`text-xs px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 ${
                !isLocked && lockTime && (lockTime - nowTs) < 3600000 ? 'animate-pulse' : ''
              }`}>
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
          <div className={`rounded-xl border p-5 text-center ${
            parlayResult === 'L'
              ? 'bg-gradient-to-r from-red-900/50 to-red-800/30 border-red-500/40'
              : isGolden
                ? 'bg-gradient-to-r from-yellow-500/30 via-yellow-400/20 to-yellow-500/30 border-yellow-400/70 shadow-lg shadow-yellow-600/30'
                : 'bg-gradient-to-r from-yellow-900/40 to-green-900/30 border-yellow-500/40'
          }`}>
            <div className={`text-sm font-semibold mb-1 ${
              parlayResult === 'L' ? 'text-red-300' : isGolden ? 'text-yellow-300 tracking-widest uppercase' : 'text-yellow-300'
            }`}>
              {parlayResult === 'L' ? '❌ Parlay Lost' : isGolden ? '🏆 GOLDEN PARLAY 🏆' : "💰 This Week's Group Parlay"}
            </div>
            <div className={`text-5xl font-black my-2 ${
              parlayResult === 'L' ? 'text-red-400' : isGolden ? 'text-yellow-300 drop-shadow-[0_0_16px_rgba(234,179,8,0.8)]' : 'text-yellow-400'
            }`}>
              {parlay.american > 0 ? `+${parlay.american}` : parlay.american}
            </div>
            <div className={`text-sm ${parlayResult === 'L' ? 'text-red-400/70' : isGolden ? 'text-yellow-400/70' : 'text-slate-400'}`}>
              ${parlay.payout100} profit on a $100 bet
            </div>
          </div>
        ) : (
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${isGolden ? 'bg-yellow-900/50 border-yellow-600/40' : 'bg-slate-800/60 border-slate-600/40'}`}>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${isGolden ? 'text-yellow-400' : 'text-slate-400'}`}>Running Parlay</div>
              <div className={`text-xs ${isGolden ? 'text-yellow-600' : 'text-slate-500'}`}>{picksWithOdds.length} / {KNOWN_PLAYERS.length} picks locked</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl font-black ${isGolden ? 'text-yellow-300' : 'text-slate-300'}`}>
                {parlay.american > 0 ? `+${parlay.american}` : parlay.american}
              </div>
              <div className={`text-xs ${isGolden ? 'text-yellow-600' : 'text-slate-500'}`}>${parlay.payout100} / $100</div>
            </div>
          </div>
        )
      )}

      {/* Share week results */}
      {(parlayResult === 'W' || parlayResult === 'L') && picks.length > 0 && (
        <div className="text-center">
          <button
            onClick={() => {
              navigator.clipboard.writeText(buildShareText(picks, parlayResult, weekKey)).catch(() => {})
              setToast('Copied!')
              setTimeout(() => setToast(null), 2500)
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline transition-colors"
          >
            📋 Copy week results
          </button>
        </div>
      )}

      {/* Submit form */}
      {isLocked ? (
        <div className={`rounded-xl border p-4 text-center text-sm ${isGolden ? 'border-yellow-600/40 bg-yellow-900/40 text-yellow-400' : 'border-slate-700/50 bg-slate-800/40 text-slate-400'}`}>
          🔒 Picks locked · games are underway
        </div>
      ) : (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h2 className="font-semibold text-slate-200 mb-4">🔒 {isEditing ? 'Update Your Lock' : 'Submit Your Lock'} — Week {selectedWeek}</h2>

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
              {submitting ? 'Saving…' : isEditing ? '✏️ Update Lock' : '🔒 Lock It In'}
            </button>
            {isEditing && !submitting && (
              <button
                type="button"
                onClick={() => { setForm({ player: '', game: '', lock: '', odds: '' }); setFormError(null) }}
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >Cancel</button>
            )}
            {submitted && (
              <span className="text-green-400 text-sm font-semibold">✅ {isEditing ? 'Updated!' : 'Pick locked!'}</span>
            )}
          </div>
        </form>
      </div>
      )}

      {/* Picks board */}
      {picks.length > 0 && (
        <div className={`rounded-xl border overflow-hidden ${isGolden ? 'bg-gradient-to-b from-yellow-900/70 to-amber-950/80 border-yellow-500/50 shadow-lg shadow-yellow-900/40' : 'bg-slate-800 border-slate-700'}`}>
          <div className={`px-4 py-3 border-b flex items-center justify-between ${isGolden ? 'border-yellow-600/40' : 'border-slate-700'}`}>
            <h2 className="font-semibold text-slate-200">Week {selectedWeek} Locks</h2>
            <div className="flex items-center gap-2">
              {!isLocked && lockTime && formatCountdown(lockTime, nowTs) && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  (lockTime - nowTs) < 30 * 60000
                    ? 'bg-red-900/60 text-red-300 border-red-500/30'
                    : (lockTime - nowTs) < 2 * 3600000
                      ? 'bg-amber-900/60 text-amber-300 border-amber-500/30'
                      : 'bg-slate-700/60 text-slate-400 border-slate-600/30'
                }`}>
                  ⏰ {formatCountdown(lockTime, nowTs)}
                </span>
              )}
              {parlayResult && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                  parlayResult === 'W' ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-red-500/20 text-red-300 border-red-500/30'
                }`}>PARLAY {parlayResult}</span>
              )}
            </div>
          </div>
          <div className={`divide-y ${isGolden ? 'divide-yellow-700/30' : 'divide-slate-700/50'}`}>
            {picks.map(pick => (
              <div key={pick.player} className={`flex items-center gap-3 px-4 py-3 ${isGolden ? 'hover:bg-yellow-800/20' : ''}`}>
                <div className="w-2 h-10 rounded-full shrink-0" style={{ background: getColor(pick.player) }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm" style={{ color: getColor(pick.player) }}>
                      {pick.player}
                    </span>
                    {pick.game && (
                      <span className="text-slate-500 text-xs">{pick.game}</span>
                    )}
                  </div>
                  <div className={`text-sm font-medium ${isGolden ? 'text-yellow-100' : 'text-slate-100'}`}>{pick.lock}</div>
                  {pick.submittedAt && (
                    <div className="text-xs text-slate-500 mt-0.5">locked {formatSubmittedAt(pick.submittedAt)}</div>
                  )}
                  <LivePickStrip pick={pick} weekNum={selectedWeek} isLocked={isLocked} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {showOdds !== false && formatOdds(pick.odds) && (
                    <span className={`font-mono font-bold text-sm mr-2 ${pick.odds > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                      {formatOdds(pick.odds)}
                    </span>
                  )}
                  {pick.result ? (
                    <button
                      onClick={() => request(() => setPickResult(pick.player, null))}
                      className={`w-9 h-9 rounded-full text-sm font-black border-2 transition-all ${
                        pick.result === 'W' ? 'bg-green-500/25 text-green-300 border-green-500/60 hover:bg-green-500/40'
                        : pick.result === 'L' ? 'bg-red-500/25 text-red-300 border-red-500/60 hover:bg-red-500/40'
                        : 'bg-yellow-500/25 text-yellow-300 border-yellow-500/60 hover:bg-yellow-500/40'
                      }`}
                      title="Click to clear result (admin)"
                    >{pick.result}</button>
                  ) : (
                    ['W', 'L', 'P'].map(r => (
                      <button key={r} onClick={() => request(() => setPickResult(pick.player, r))}
                        className="text-xs font-bold w-7 h-6 rounded border bg-transparent text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500 transition-all"
                      >{r}</button>
                    ))
                  )}
                </div>
                {!isLocked && (
                  <>
                    <button
                      onClick={() => handleEdit(pick)}
                      className="text-slate-600 hover:text-yellow-400 transition-colors p-1 rounded"
                      title="Edit pick"
                    >✏️</button>
                    <button
                      onClick={() => handleDelete(pick.player)}
                      className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded"
                      title="Remove pick"
                    >✕</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {picks.length === 0 && !serverError && (
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
