import { useState, useCallback } from 'react'

const SESSION_KEY = 'vlv_unlocked'
const PW_HASH = 'b48cd264507888552dfc132357c1b5b96a158ec451830850343abecbf4ff6d04'

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useAdminAuth() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [showModal, setShowModal] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)

  const request = useCallback((action) => {
    if (unlocked) { action(); return }
    setPendingAction(() => action)
    setShowModal(true)
    setPwInput('')
    setPwError(false)
  }, [unlocked])

  async function submit() {
    const hash = await sha256(pwInput)
    if (hash === PW_HASH) {
      sessionStorage.setItem(SESSION_KEY, '1')
      setUnlocked(true)
      setShowModal(false)
      if (pendingAction) { pendingAction(); setPendingAction(null) }
    } else {
      setPwError(true)
      setPwInput('')
    }
  }

  function cancel() {
    setShowModal(false)
    setPendingAction(null)
    setPwInput('')
    setPwError(false)
  }

  const Modal = showModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 w-80 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-2xl mb-1">🔒</div>
          <h2 className="text-slate-100 font-bold text-lg">Admin Required</h2>
          <p className="text-slate-400 text-sm mt-1">Enter the password to make changes</p>
        </div>
        {pwError && (
          <div className="mb-3 text-red-400 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-lg p-2">
            Wrong password
          </div>
        )}
        <input
          type="password"
          autoFocus
          value={pwInput}
          onChange={e => { setPwInput(e.target.value); setPwError(false) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Password"
          className="w-full bg-slate-700 text-slate-100 rounded-lg px-3 py-2.5 border border-slate-600 text-sm mb-3"
        />
        <div className="flex gap-2">
          <button onClick={cancel} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
            Cancel
          </button>
          <button onClick={submit} className="flex-1 px-4 py-2 rounded-lg text-sm font-bold bg-yellow-500 text-slate-900 hover:bg-yellow-400 transition-colors">
            Unlock
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { request, Modal, unlocked }
}
