import React, { useState, useEffect, useRef } from 'react'

// Generate ya retrieve a persistent per-browser user id (not hardcoded)
function getUserId () {
  let id = localStorage.getItem('esim_session_user_id')
  if (!id) {
    id = 'user-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now()
    localStorage.setItem('esim_session_user_id', id)
  }
  return id
}

// Session-manager base URL — configurable, not hardcoded to a fixed session
const SESSION_MANAGER_URL = process.env.REACT_APP_SESSION_MANAGER_URL || 'http://localhost:8001'

const SessionManager = () => {
  const [userId] = useState(getUserId())
  const [sessionData, setSessionData] = useState(null)
  const [status, setStatus] = useState('idle') // idle | starting | running | timeout | error
  const [elapsed, setElapsed] = useState(0)
  const [logMessages, setLogMessages] = useState([])
  const pollRef = useRef(null)
  const startTimeRef = useRef(null)

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString()
    setLogMessages(prev => [...prev, `[${time}] ${msg}`])
  }

  const startSession = async () => {
    setStatus('starting')
    addLog(`Requesting session for user_id=${userId}`)
    try {
      const res = await fetch(`${SESSION_MANAGER_URL}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, namespace: 'default' })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSessionData(data)
      setStatus('running')
      startTimeRef.current = Date.now()
      addLog(`Pod created: ${data.pod_name} (status: ${data.status})`)
      pollRef.current = setInterval(pollStatus, 5000)
    } catch (err) {
      setStatus('error')
      addLog(`ERROR: ${err.message}`)
    }
  }

  const pollStatus = async () => {
    const secs = Math.floor((Date.now() - startTimeRef.current) / 1000)
    setElapsed(secs)
    try {
      const res = await fetch(`${SESSION_MANAGER_URL}/session/${userId}`)
      if (res.status === 404) {
        clearInterval(pollRef.current)
        setStatus('timeout')
        addLog('Session Timeout — Pod Terminated')
        return
      }
      const data = await res.json()
      setSessionData(data)
      addLog(`Status check (t=${secs}s): ${data.status}`)
    } catch (err) {
      addLog(`Poll error: ${err.message}`)
    }
  }

  const stopSession = async () => {
    clearInterval(pollRef.current)
    addLog('Manually stopping session...')
    try {
      const res = await fetch(`${SESSION_MANAGER_URL}/session/${userId}`, { method: 'DELETE' })
      const data = await res.json()
      addLog(`Stopped: ${data.message}`)
      setStatus('idle')
      setSessionData(null)
    } catch (err) {
      addLog(`Stop error: ${err.message}`)
    }
  }

  useEffect(() => {
    return () => clearInterval(pollRef.current)
  }, [])

  return (
    <div style={{ padding: '40px', color: '#fff', background: '#1e1e1e', minHeight: '90vh' }}>
      <h1>Session Manager Integration Test</h1>
      <p>User ID (persisted, not hardcoded): <code>{userId}</code></p>

      <button
        onClick={startSession}
        disabled={status === 'starting' || status === 'running'}
        style={{ padding: '15px 30px', marginRight: '10px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
      >
        START SESSION
      </button>
      <button
        onClick={stopSession}
        disabled={status !== 'running'}
        style={{ padding: '15px 30px', background: '#f44336', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
      >
        STOP SESSION
      </button>

      {status === 'running' && <p style={{ color: '#ffeb3b', fontSize: '20px' }}>Elapsed: {elapsed}s</p>}
      {status === 'timeout' && <h2 style={{ color: '#f44336' }}>⚠ Session Timeout</h2>}

      {sessionData && (
        <pre style={{ background: '#2d2d2d', padding: '15px', borderRadius: '8px' }}>
          {JSON.stringify(sessionData, null, 2)}
        </pre>
      )}

      <h3>Log</h3>
      <div style={{ background: '#111', padding: '10px', height: '200px', overflowY: 'scroll', fontFamily: 'monospace', fontSize: '13px' }}>
        {logMessages.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  )
}

export default SessionManager