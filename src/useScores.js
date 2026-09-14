import { useState, useEffect, useMemo } from 'react'
import { API } from './api.js'

// Module-level cache: "year-week" → { games, ts }
const cache = {}
const STALE_MS = 60_000 // re-fetch after 60s

function isStale(key) {
  const entry = cache[key]
  return !entry || Date.now() - entry.ts > STALE_MS
}

export function useScores(year, weekNums) {
  const [scores, setScores] = useState(() => {
    if (!year || !weekNums?.length) return {}
    const result = {}
    for (const w of weekNums) {
      const key = `${year}-${w}`
      if (cache[key]) result[key] = cache[key].games
    }
    return result
  })

  useEffect(() => {
    if (!year || !weekNums?.length) return

    // Sync any newly-cached weeks into state (handles weekNums changes after mount)
    const cached = {}
    for (const w of weekNums) {
      const key = `${year}-${w}`
      if (cache[key]) cached[key] = cache[key].games
    }
    if (Object.keys(cached).length > 0) setScores(cached)

    // Fetch stale or missing weeks in background
    const toFetch = weekNums.filter(w => isStale(`${year}-${w}`))
    if (!toFetch.length) return

    Promise.all(toFetch.map(w =>
      fetch(`${API}/scores?year=${year}&week=${w}`)
        .then(r => r.ok ? r.json() : [])
        .then(games => ({ w, games }))
        .catch(() => ({ w, games: cache[`${year}-${w}`]?.games || [] }))
    )).then(results => {
      for (const { w, games } of results) {
        cache[`${year}-${w}`] = { games, ts: Date.now() }
      }
      setScores(prev => {
        const next = { ...prev }
        for (const { w, games } of results) next[`${year}-${w}`] = games
        return next
      })
    })
  }, [year, weekNums?.join(',')])

  return scores
}

// Multi-year version: accepts [{year, week}] pairs, returns same "year-week" → games[] map
export function useMultiYearScores(pairs) {
  const [scores, setScores] = useState(() => {
    const result = {}
    for (const p of (pairs || [])) {
      const key = `${p.year}-${p.week}`
      if (cache[key]) result[key] = cache[key].games
    }
    return result
  })

  const depStr = useMemo(() =>
    (pairs || []).map(p => `${p.year}-${p.week}`).sort().join(','),
    [pairs]
  )

  useEffect(() => {
    if (!pairs?.length) return

    const unique = {}
    for (const p of pairs) {
      const key = `${p.year}-${p.week}`
      if (!unique[key]) unique[key] = p
    }

    // Sync any newly-cached entries into state
    const cached = {}
    for (const key of Object.keys(unique)) {
      if (cache[key]) cached[key] = cache[key].games
    }
    if (Object.keys(cached).length > 0) setScores(cached)

    // Fetch stale or missing entries in background
    const toFetch = Object.entries(unique).filter(([key]) => isStale(key))
    if (!toFetch.length) return

    Promise.all(toFetch.map(([key, p]) =>
      fetch(`${API}/scores?year=${p.year}&week=${p.week}`)
        .then(r => r.ok ? r.json() : [])
        .then(games => ({ key, games }))
        .catch(() => ({ key, games: cache[key]?.games || [] }))
    )).then(results => {
      for (const { key, games } of results) cache[key] = { games, ts: Date.now() }
      setScores(prev => {
        const next = { ...prev }
        for (const { key, games } of results) next[key] = games
        return next
      })
    })
  }, [depStr])

  return scores
}
