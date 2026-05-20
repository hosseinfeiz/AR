import { useEffect, useState } from 'react'

// Captures the browser's `beforeinstallprompt` and offers an install banner on
// portal routes. Dismissals are remembered in localStorage. iOS Safari never
// fires `beforeinstallprompt`, so we show static "Add to Home Screen"
// instructions for iOS users.

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'ar:install-prompt-dismissed'

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports as Mac, distinguish by touch points
  const iPadOnMac = /Macintosh/.test(ua) && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1
  return /iPhone|iPad|iPod/.test(ua) || iPadOnMac
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    if (isIos()) setShowIosHint(true)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed || isStandalone()) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode */
    }
    setDismissed(true)
  }

  async function install() {
    if (!event) return
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') {
      setEvent(null)
    } else {
      dismiss()
    }
  }

  if (event) {
    return (
      <div
        role="region"
        aria-label="Install A and R Management"
        className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-50 bg-white border border-gray-200 shadow-lg rounded-xl p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-semibold text-sm">Install AR Management</p>
            <p className="text-xs text-gray-600 mt-1">
              Get one-tap access to your portal and offline maintenance requests.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="mt-3 flex gap-2 justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={install}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] rounded"
          >
            Install
          </button>
        </div>
      </div>
    )
  }

  if (showIosHint) {
    return (
      <div
        role="region"
        aria-label="Add to Home Screen instructions"
        className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-50 bg-white border border-gray-200 shadow-lg rounded-xl p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-semibold text-sm">Add to Home Screen</p>
            <p className="text-xs text-gray-600 mt-1">
              Tap the Share icon, then choose <strong>Add to Home Screen</strong> for
              one-tap access.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default InstallPrompt
