import { useState, useRef } from 'react'

interface DemoAccount {
  label: string
  username: string
  password: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Admin', username: 'admin', password: 'admin' },
  { label: 'Sarah Jensen (GLM #2A)', username: 'sarah.jensen@demo.test', password: 'tenant123' },
  { label: 'Marcus Lee (GLM #3B)', username: 'marcus.lee@demo.test', password: 'tenant123' },
  { label: 'Emma Rodriguez (GLM #1D)', username: 'emma.rodriguez@demo.test', password: 'tenant123' },
  { label: 'Priya Patel (WM #1C)', username: 'priya.patel@demo.test', password: 'tenant123' },
  { label: 'David Chen (WM #4A)', username: 'david.chen@demo.test', password: 'tenant123' },
  { label: 'James Anderson (WM #2B)', username: 'james.anderson@demo.test', password: 'tenant123' },
]

interface Props {
  redirect?: string
}

export function LoginForm({ redirect }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, redirect }),
      })
      const data = await res.json() as { ok: boolean; redirect?: string; error?: string }
      if (data.ok && data.redirect) {
        window.location.href = data.redirect
      } else {
        setError(data.error ?? 'Login failed. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function signInAs(account: DemoAccount) {
    setUsername(account.username)
    setPassword(account.password)
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password, redirect }),
      })
      const data = await res.json() as { ok: boolean; redirect?: string; error?: string }
      if (data.ok && data.redirect) {
        window.location.href = data.redirect
      } else {
        setError(data.error ?? 'Login failed.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'block w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40 focus:border-[var(--color-brand)]'

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="border border-gray-200 rounded-xl p-8 shadow-sm bg-white">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Tenant portal &amp; admin access</p>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="username">
              Email / username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-brand)] text-white px-4 py-2.5 rounded-lg font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400 transition"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      {/* Demo accounts panel */}
      <div className="mt-6 border border-gray-200 rounded-xl p-5 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Demo accounts</p>
        <div className="space-y-2">
          {DEMO_ACCOUNTS.map((account) => (
            <div key={account.username} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{account.label}</p>
                <p className="text-xs text-gray-500 truncate">{account.username}</p>
              </div>
              <button
                type="button"
                onClick={() => signInAs(account)}
                disabled={loading}
                className="shrink-0 text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition disabled:opacity-50"
              >
                Sign in as…
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
