import { useState } from 'react'

interface Props {
  className?: string
  label?: string
}

export function LogoutButton({ className, label = 'Log out' }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await fetch('/api/logout', { method: 'POST' })
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className ?? 'text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50'}
    >
      {loading ? 'Signing out…' : label}
    </button>
  )
}
