import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useFocusTrap } from '../hooks/useFocusTrap.js'
import { Icon } from './icons.jsx'

function initials(name) {
  if (!name) return '?'
  const parts = name.replace(/,/g, '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export default function ProfileSwitcher() {
  const { profiles, activeUsername, userName, switchProfile, removeProfile, addAccount, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const close = () => { setOpen(false); setAdding(false); setError(null); setU(''); setP('') }
  const trapRef = useFocusTrap(open, close)

  const submitAdd = async (e) => {
    e.preventDefault()
    if (!u || !p) { setError('Enter a username and password.'); return }
    setBusy(true); setError(null)
    try {
      await addAccount(u.trim(), p)
      close()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="profile-switch">
      {open && <div className="profile-backdrop" onClick={close} />}

      {open && (
        <div className="profile-pop card" ref={trapRef} role="dialog" aria-modal="true" aria-label="Accounts">
          <div className="profile-pop-label">Accounts</div>
          <div className="profile-list">
            {profiles.map((pr) => (
              <div key={pr.username} className={`profile-row ${pr.username === activeUsername ? 'active' : ''}`}>
                <button className="profile-row-main" onClick={() => { switchProfile(pr.username); close() }}>
                  <span className="avatar sm">{initials(pr.userName)}</span>
                  <span className="profile-row-text">
                    <span className="name">{pr.userName || pr.username}</span>
                    <span className="sub">{pr.username}</span>
                  </span>
                  {pr.username === activeUsername && <Icon.check className="profile-check" width={16} height={16} />}
                </button>
                <button className="profile-remove" title="Remove account"
                  onClick={() => { if (confirm(`Remove ${pr.userName || pr.username}?`)) removeProfile(pr.username) }}>
                  <Icon.trash width={14} height={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="profile-divider" />

          {adding ? (
            <form className="profile-add" onSubmit={submitAdd}>
              {error && <div className="profile-err">{error}</div>}
              <input className="input" placeholder="HAC username" autoFocus value={u} onChange={(e) => setU(e.target.value)} autoComplete="off" />
              <input className="input" type="password" placeholder="HAC password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="off" />
              <div className="flex" style={{ gap: 8 }}>
                <button className="btn sm" type="submit" disabled={busy} style={{ flex: 1 }}>{busy ? 'Adding…' : 'Add & switch'}</button>
                <button className="btn ghost sm" type="button" onClick={() => { setAdding(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button className="profile-action" onClick={() => setAdding(true)}>
              <Icon.plus width={16} height={16} /> Add account
            </button>
          )}

          <div className="profile-divider" />
          <button className="profile-action danger" onClick={() => { logout(); close() }}>
            <Icon.chevron width={15} height={15} style={{ transform: 'rotate(180deg)' }} /> Sign out
          </button>
        </div>
      )}

      <button className={`profile-trigger ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initials(userName)}</span>
        <span className="profile-trigger-text">
          <span className="name">{userName || 'Student'}</span>
          <span className="sub">{profiles.length > 1 ? `${profiles.length} accounts` : 'HAC connected'}</span>
        </span>
        <Icon.chevron className={`profile-caret ${open ? 'open' : ''}`} width={16} height={16} />
      </button>
    </div>
  )
}
