import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShowingRequestInputSchema, type ShowingRequestInput } from '@ar/shared'
import { createClient } from '@supabase/supabase-js'
import { TurnstileWidget } from './TurnstileWidget'

interface Slot { id: string; starts_at: string; ends_at: string }

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileSiteKey: string
  buildings: { id: string; name: string }[]
  initialUnitId: string | null
  initialBuildingId: string | null
  mockMode?: boolean
}

function mockRefId(): string {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => a[Math.floor(Math.random() * a.length)]).join('')
}

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v)

export function ShowingForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings, initialUnitId, initialBuildingId, mockMode = false }: Props) {
  const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    anonKey || 'placeholder-anon-key',
  )
  const [buildingId, setBuildingId] = useState<string | null>(initialBuildingId)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotId, setSlotId] = useState<string | null>(null)
  const [d1, setD1] = useState(''); const [d2, setD2] = useState(''); const [d3, setD3] = useState('')
  const [turnstile, setTurnstile] = useState<string | null>(mockMode ? 'dev-mock-token' : null)
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, formState: { isSubmitting, errors, submitCount } } = useForm<ShowingRequestInput>({
    resolver: zodResolver(ShowingRequestInputSchema),
    mode: 'onSubmit',
    defaultValues: {
      source: 'web',
      building_id: initialBuildingId ?? (undefined as unknown as string),
      unit_id: initialUnitId,
      slot_id: null,
      preferred_dates: null,
      prospect_name: '',
      prospect_email: '',
      prospect_phone: null,
      message: null,
      turnstile_token: mockMode ? 'dev-mock-token' : '',
    },
  })

  useEffect(() => {
    register('building_id')
    register('unit_id')
    register('slot_id')
    register('preferred_dates')
    register('source')
    register('turnstile_token')
  }, [register])

  useEffect(() => {
    if (!buildingId || mockMode) { setSlots([]); return }
    supabase.from('availability_slots').select('id, starts_at, ends_at')
      .eq('building_id', buildingId).eq('status', 'open').gt('starts_at', new Date().toISOString())
      .order('starts_at').then(({ data }) => setSlots(data ?? []))
  }, [buildingId, mockMode])

  useEffect(() => { if (turnstile) setValue('turnstile_token', turnstile) }, [turnstile, setValue])

  // Sync the three local date inputs into the form's preferred_dates field.
  useEffect(() => {
    const dates = [d1, d2, d3].filter(Boolean)
    if (slotId) {
      setValue('preferred_dates', null)
    } else {
      setValue('preferred_dates', dates.length > 0 ? dates : null, { shouldValidate: submitCount > 0 })
    }
  }, [d1, d2, d3, slotId, setValue, submitCount])

  async function onSubmit(values: ShowingRequestInput) {
    setError(null)
    if (mockMode) {
      await new Promise((r) => setTimeout(r, 500))
      setSubmitted({ ref_id: mockRefId() })
      return
    }
    const { turnstile_token, ...payload } = values
    const finalPayload = {
      ...payload,
      building_id: buildingId!,
      unit_id: initialUnitId,
      slot_id: slotId,
      preferred_dates: slotId ? null : [d1, d2, d3].filter(Boolean),
    }
    const { data, error: err } = await supabase.from('showing_requests').insert(finalPayload).select('ref_id').single()
    if (err) { setError(err.message); return }
    setSubmitted({ ref_id: data!.ref_id })
  }

  if (submitted) {
    return (
      <div className="border border-green-300 bg-green-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-green-900">Showing request received</h2>
        <p className="mt-2 text-green-900">Reference: <strong>{submitted.ref_id}</strong>. We'll confirm a time within one business day.</p>
        <button
          type="button"
          onClick={() => { setSubmitted(null); setSlotId(null); setD1(''); setD2(''); setD3(''); setTurnstile(mockMode ? 'dev-mock-token' : null) }}
          className="mt-4 text-sm text-green-900 underline"
        >
          Submit another request
        </button>
      </div>
    )
  }

  const inputCls = 'block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/40'
  const labelCls = 'block text-sm font-medium mt-4 mb-1'
  const errCls = 'text-sm text-red-600 mt-1'
  const rootError = (errors as any).root?.message ?? (errors as any)['']?.message

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
            onClick={() => { setBuildingId(b.id); setValue('building_id', b.id, { shouldValidate: true }) }}
            className={`px-3 py-1.5 rounded border text-sm ${buildingId === b.id ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300 hover:border-gray-400'}`}
          >
            {b.name}
          </button>
        ))}
      </div>
      {errors.building_id && <p className={errCls}>Pick a building.</p>}

      <label className={labelCls}>Pick a slot</label>
      {slots.length === 0 ? (
        <p className="text-sm text-gray-500">No published slots — propose preferred dates below.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => {
            const t = new Date(s.starts_at)
            const label = t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            const active = slotId === s.id
            return (
              <button key={s.id} type="button"
                      onClick={() => { setSlotId(s.id); setValue('slot_id', s.id); setValue('preferred_dates', null) }}
                      className={`px-3 py-1.5 rounded border text-sm ${active ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300 hover:border-gray-400'}`}>
                {label}
              </button>
            )
          })}
        </div>
      )}

      <label className={labelCls}>…or propose up to 3 preferred dates <span className="text-red-600">*</span></label>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={d1} onChange={(e) => setD1(e.target.value)} className={inputCls + ' max-w-[180px]'} />
        <input type="date" value={d2} onChange={(e) => setD2(e.target.value)} className={inputCls + ' max-w-[180px]'} />
        <input type="date" value={d3} onChange={(e) => setD3(e.target.value)} className={inputCls + ' max-w-[180px]'} />
      </div>
      <p className="text-xs text-gray-500">Pick a slot above OR fill in at least one preferred date.</p>
      {rootError && <p className={errCls}>{rootError}</p>}
      {errors.preferred_dates && <p className={errCls}>Provide at least one preferred date.</p>}

      <label className={labelCls}>Your name <span className="text-red-600">*</span></label>
      <input {...register('prospect_name')} className={inputCls} />
      {errors.prospect_name && <p className={errCls}>Required.</p>}

      <label className={labelCls}>Email <span className="text-red-600">*</span></label>
      <input type="email" autoComplete="email" {...register('prospect_email')} className={inputCls} />
      {errors.prospect_email && <p className={errCls}>Enter a valid email.</p>}

      <label className={labelCls}>Phone <span className="text-gray-500 text-xs">(optional)</span></label>
      <input type="tel" autoComplete="tel" {...register('prospect_phone', { setValueAs: emptyToNull as any })} className={inputCls} />
      {errors.prospect_phone && <p className={errCls}>Enter at least 7 digits.</p>}

      <label className={labelCls}>Message <span className="text-gray-500 text-xs">(optional)</span></label>
      <textarea {...register('message', { setValueAs: emptyToNull as any })} rows={3} className={inputCls} />

      {!mockMode && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstile} />}

      {error && <p className={errCls}>{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400"
      >
        {isSubmitting ? 'Submitting…' : 'Request showing'}
      </button>
    </form>
  )
}
