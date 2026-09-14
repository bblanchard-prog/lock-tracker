import { useState, useEffect } from 'react'
import { API } from './api.js'

const cache = {}  // key → { data, ts }
const STALE_MS = 60_000

export function usePlayerStat(year, weekNum, lock, enabled, pollInterval = null) {
  const key = `${year}-${weekNum}-${lock}`
  const [data, setData] = useState(cache[key] !== undefined ? cache[key].data : null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !year || !weekNum || !lock) return

    if (cache[key] !== undefined) setData(cache[key].data)

    async function doFetch(force = false) {
      if (!force && cache[key] !== undefined && Date.now() - cache[key].ts < STALE_MS) return
      setLoading(true)
      try {
        const r = await fetch(`${API}/player-stats?year=${year}&week=${weekNum}&lock=${encodeURIComponent(lock)}`)
        const d = r.ok ? await r.json() : null
        cache[key] = { data: d, ts: Date.now() }
        setData(d)
      } catch {
        cache[key] = { data: null, ts: Date.now() }
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    doFetch()
    if (!pollInterval) return
    const id = setInterval(() => doFetch(true), pollInterval)
    return () => clearInterval(id)
  }, [year, weekNum, lock, enabled, pollInterval])

  return { loading, data }
}
