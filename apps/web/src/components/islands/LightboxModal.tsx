import { useCallback, useEffect, useRef, useState } from 'react'

export interface LightboxPhoto {
  src: string
  alt: string
}

interface Props {
  /** Optional initial set of photos rendered immediately (SSR-friendly). */
  photos?: LightboxPhoto[]
  /**
   * DOM id of a sibling element holding `<img data-lightbox-src>` thumbnails.
   * When provided, the island wires up click handlers on those thumbs to open
   * the lightbox at the matching index.
   */
  sourceId?: string
}

interface PinchState {
  startDistance: number
  startScale: number
}

const MAX_SCALE = 4
const MIN_SCALE = 1

export function LightboxModal({ photos: initialPhotos = [], sourceId }: Props) {
  const [photos, setPhotos] = useState<LightboxPhoto[]>(initialPhotos)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [scale, setScale] = useState(1)
  const pinchRef = useRef<PinchState | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  const open = openIndex !== null

  /* Wire up sibling thumbnails (set by PhotoGallery.astro). */
  useEffect(() => {
    if (!sourceId) return
    const host = document.getElementById(sourceId)
    if (!host) return

    const thumbs = Array.from(host.querySelectorAll<HTMLImageElement>('img[data-lightbox-src]'))
    const collected: LightboxPhoto[] = thumbs.map((img) => ({
      src: img.dataset.lightboxSrc ?? img.src,
      alt: img.alt ?? '',
    }))
    if (collected.length > 0) setPhotos(collected)

    const handlers: Array<() => void> = []
    thumbs.forEach((thumb, idx) => {
      const onClick = (event: Event) => {
        event.preventDefault()
        lastFocusedRef.current = thumb
        setOpenIndex(idx)
        setScale(1)
      }
      thumb.style.cursor = 'zoom-in'
      thumb.setAttribute('role', 'button')
      thumb.setAttribute('tabindex', '0')
      thumb.addEventListener('click', onClick)
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick(event)
        }
      }
      thumb.addEventListener('keydown', onKey)
      handlers.push(() => {
        thumb.removeEventListener('click', onClick)
        thumb.removeEventListener('keydown', onKey)
      })
    })
    return () => handlers.forEach((cleanup) => cleanup())
  }, [sourceId])

  const close = useCallback(() => {
    setOpenIndex(null)
    setScale(1)
    /* Restore focus to the thumbnail that opened the lightbox. */
    if (lastFocusedRef.current) {
      lastFocusedRef.current.focus()
    }
  }, [])

  const next = useCallback(() => {
    setOpenIndex((idx) => {
      if (idx === null || photos.length === 0) return idx
      return (idx + 1) % photos.length
    })
    setScale(1)
  }, [photos.length])

  const prev = useCallback(() => {
    setOpenIndex((idx) => {
      if (idx === null || photos.length === 0) return idx
      return (idx - 1 + photos.length) % photos.length
    })
    setScale(1)
  }, [photos.length])

  /* Keyboard navigation + focus trap */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        next()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        prev()
        return
      }
      if (event.key === 'Tab') {
        /* Trap focus inside the dialog. */
        const root = dialogRef.current
        if (!root) return
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (!first || !last) return
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    /* Move focus into the dialog. */
    queueMicrotask(() => {
      const root = dialogRef.current
      if (root) {
        const first = root.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')
        first?.focus()
      }
    })
    /* Disable background scroll while the modal is open. */
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, close, next, prev])

  /* Pinch-zoom: compute scale from two-finger distance. Accept any object
   * with clientX/clientY so React.Touch and DOM Touch both work. */
  function distance(t0: { clientX: number; clientY: number }, t1: { clientX: number; clientY: number }): number {
    const dx = t0.clientX - t1.clientX
    const dy = t0.clientY - t1.clientY
    return Math.hypot(dx, dy)
  }

  function onTouchStart(event: React.TouchEvent<HTMLImageElement>) {
    if (event.touches.length === 2) {
      const t0 = event.touches[0]
      const t1 = event.touches[1]
      if (!t0 || !t1) return
      pinchRef.current = {
        startDistance: distance(t0, t1),
        startScale: scale,
      }
    }
  }

  function onTouchMove(event: React.TouchEvent<HTMLImageElement>) {
    if (event.touches.length === 2 && pinchRef.current) {
      const t0 = event.touches[0]
      const t1 = event.touches[1]
      if (!t0 || !t1) return
      const d = distance(t0, t1)
      const ratio = d / pinchRef.current.startDistance
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchRef.current.startScale * ratio),
      )
      setScale(nextScale)
    }
  }

  function onTouchEnd(event: React.TouchEvent<HTMLImageElement>) {
    if (event.touches.length < 2) pinchRef.current = null
  }

  if (!open || photos.length === 0) return null
  const current = photos[openIndex]
  if (!current) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${openIndex + 1} of ${photos.length}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--color-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close lightbox"
        style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          background: 'transparent',
          color: '#fff',
          fontSize: '1.75rem',
          lineHeight: 1,
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem 0.5rem',
        }}
      >
        ×
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          onClick={prev}
          aria-label="Previous photo"
          style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            fontSize: '1.5rem',
            borderRadius: '999px',
          }}
        >
          ‹
        </button>
      )}
      <img
        src={current.src}
        alt={current.alt}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2))}
        style={{
          maxWidth: '92vw',
          maxHeight: '88vh',
          objectFit: 'contain',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          transition: pinchRef.current ? 'none' : 'transform 120ms ease',
          touchAction: 'none',
        }}
      />
      {photos.length > 1 && (
        <button
          type="button"
          onClick={next}
          aria-label="Next photo"
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem 0.75rem',
            fontSize: '1.5rem',
            borderRadius: '999px',
          }}
        >
          ›
        </button>
      )}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '1rem',
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#fff',
          fontSize: '0.875rem',
          opacity: 0.85,
        }}
      >
        {openIndex + 1} / {photos.length}
      </div>
    </div>
  )
}

export default LightboxModal
