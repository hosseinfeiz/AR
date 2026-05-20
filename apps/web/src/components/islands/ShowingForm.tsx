import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { TurnstileWidget } from './TurnstileWidget'
import { ShowingPicker, type PickedSlot } from './ShowingPicker'

// New ShowingForm: replaces the "3 preferred dates" UI with a live availability
// picker that posts to /api/showings/book. The previous slot/date selection is
// gone — the picker is now the only way to choose a time.

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileSiteKey: string
  buildings: { id: string; name: string }[]
  initialUnitId: string | null
  initialBuildingId: string | null
  mockMode?: boolean
}

interface FormValues {
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  message: string | null
}

function mockRefId(): string {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => a[Math.floor(Math.random() * a.length)]).join('')
}

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v)

export function ShowingForm({ turnstileSiteKey, buildings, initialUnitId, initialBuildingId, mockMode = false }: Props) {
  const [buildingId, setBuildingId] = useState<string | null>(initialBuildingId)
  const [picked, setPicked] = useState<PickedSlot | null>(null)
  const [turnstile, setTurnstile] = useState<string | null>(mockMode ? 'dev-mock-token' : null)
  const [submitted, setSubmitted] = useState<{ ref_id: string; scheduled_at: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { isSubmitting, errors, submitCount }, getValues } = useForm<FormValues>({
    mode: 'onSubmit',
    defaultValues: {
      prospect_name: '',
      prospect_email: '',
      prospect_phone: null,
      message: null,
    },
  })

  // Reset picked slot when building changes.
  useEffect(() => { setPicked(null) }, [buildingId])

  async function onSubmit(values: FormValues) {
    setError(null)
    if (!buildingId) { setError('Pick a building.'); return }
    if (!picked) { setError('Pick a time slot.'); return }
    if (!turnstile && !mockMode) { setError('Complete the captcha.'); return }
    if (!values.prospect_name || !values.prospect_email) {
      setError('Name and email are required.'); return
    }

    if (mockMode) {
      await new Promise((r) => setTimeout(r, 400))
      setSubmitted({ ref_id: mockRefId(), scheduled_at: picked.start })
      return
    }

    const res = await fetch('/api/showings/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        building_id: buildingId,
        unit_id: initialUnitId,
        prospect_name: values.prospect_name,
        prospect_email: values.prospect_email,
        prospect_phone: values.prospect_phone || null,
        message: values.message || null,
        source: 'web',
        slot_start: picked.start,
        slot_end: picked.end,
        turnstile_token: turnstile ?? 'missing',
      }),
    })
    const j = (await res.json().catch(() => ({}))) as { ref_id?: string; scheduled_at?: string; error?: string }
    if (!res.ok || !j.ref_id) {
      setError(j.error ?? `Request failed (${res.status})`); return
    }
    setSubmitted({ ref_id: j.ref_id, scheduled_at: j.scheduled_at ?? picked.start })
  }

  if (submitted) {
    const when = new Date(submitted.scheduled_at).toLocaleString()
    return (
      <div className="border border-green-300 bg-green-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-green-900">Showing booked</h2>
        <p className="mt-2 text-green-900">
          Reference: <strong>{submitted.ref_id}</strong>. Time: <strong>{when}</strong>.
        </p>
        <p className="mt-2 text-sm text-green-900">Check your email for a calendar invite and the reschedule link.</p>
        <button
          type="button"
          onClick={() => { setSubmitted(null); setPicked(null); setTurnstile(mockMode ? 'dev-mock-token' : null) }}
          className="mt-4 text-sm text-green-900 underline"
        >
          Book another
        </button>
      </div>
    )
  }

  const inputCls = 'block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40'
  const labelCls = 'block text-sm font-medium mt-4 mb-1'
  const errCls = 'text-sm text-red-600 mt-1'

  // Touch getValues so eslint doesn't complain about an unused destructuring.
  void getValues

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2" noValidate>
      {submitCount > 0 && Object.keys(errors).length > 0 && (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded p-3 mb-2 text-sm">
          Please fix the errors below before submitting.
        </div>
      )}

      <label className={labelCls}>Building <span className="text-red-600">*</span></label>
      <div className="flex flex-wrap gap-2">
        {buildings.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBuildingId(b.id)}
            className={`px-3 py-1.5 rounded border text-sm ${buildingId === b.id ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300 hover:border-gray-400'}`}
          >
            {b.name}
          </button>
        ))}
      </div>

      <label className={labelCls}>Pick a time <span className="text-red-600">*</span></label>
      <ShowingPicker
        buildingId={buildingId}
        value={picked}
        onChange={setPicked}
        mockMode={mockMode}
      />

      <label className={labelCls}>Your name <span className="text-red-600">*</span></label>
      <input {...register('prospect_name', { required: true })} className={inputCls} />
      {errors.prospect_name && <p className={errCls}>Required.</p>}

      <label className={labelCls}>Email <span className="text-red-600">*</span></label>
      <input type="email" autoComplete="email" {...register('prospect_email', { required: true })} className={inputCls} />
      {errors.prospect_email && <p className={errCls}>Enter a valid email.</p>}

      <label className={labelCls}>Phone <span className="text-gray-500 text-xs">(optional, used for SMS reminders)</span></label>
      <input type="tel" autoComplete="tel" {...register('prospect_phone', { setValueAs: emptyToNull as any })} className={inputCls} />

      <label className={labelCls}>Message <span className="text-gray-500 text-xs">(optional)</span></label>
      <textarea {...register('message', { setValueAs: emptyToNull as any })} rows={3} className={inputCls} />

      {!mockMode && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstile} />}

      {error && <p className={errCls}>{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting || !picked || !buildingId}
        className="mt-6 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400"
      >
        {isSubmitting ? 'Booking…' : 'Confirm showing'}
      </button>
    </form>
  )
}
