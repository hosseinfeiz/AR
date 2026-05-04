import { useEffect, useRef } from 'react'

declare global { interface Window { turnstile?: any } }

interface Props { siteKey: string; onToken: (t: string) => void }

export function TurnstileWidget({ siteKey, onToken }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!document.querySelector('script[data-turnstile]')) {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      s.async = true; s.defer = true
      s.setAttribute('data-turnstile', '1')
      document.head.appendChild(s)
    }
    const id = setInterval(() => {
      if (window.turnstile && ref.current && !ref.current.hasChildNodes()) {
        clearInterval(id)
        window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken })
      }
    }, 100)
    return () => clearInterval(id)
  }, [siteKey, onToken])
  return <div ref={ref} className="my-3" />
}
