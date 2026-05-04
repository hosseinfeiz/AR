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
}

export function ShowingForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings, initialUnitId, initialBuildingId }: Props) {
  const supabase = createClient(supabaseUrl, anonKey)
  const [buildingId, setBuildingId] = useState<string | null>(initialBuildingId)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotId, setSlotId] = useState<string | null>(null)
  const [d1, setD1] = useState(''); const [d2, setD2] = useState(''); const [d3, setD3] = useState('')
  const [turnstile, setTurnstile] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm<ShowingRequestInput>({
    resolver: zodResolver(ShowingRequestInputSchema),
    defaultValues: {
      source: 'web',
      building_id: initialBuildingId ?? '',
      unit_id: initialUnitId,
      slot_id: null,
      preferred_dates: null,
      turnstile_token: '',
    },
  })

  useEffect(() => {
    if (!buildingId) { setSlots([]); return }
    supabase.from('availability_slots').select('id, starts_at, ends_at')
      .eq('building_id', buildingId).eq('status', 'open').gt('starts_at', new Date().toISOString())
      .order('starts_at').then(({ data }) => setSlots(data ?? []))
  }, [buildingId])

  useEffect(() => { if (turnstile) setValue('turnstile_token', turnstile) }, [turnstile, setValue])

  async function onSubmit(values: ShowingRequestInput) {
    setError(null)
    const dates = [d1, d2, d3].filter(Boolean)
    const { turnstile_token, ...payload } = values
    const finalPayload = {
      ...payload,
      building_id: buildingId!,
      unit_id: initialUnitId,
      slot_id: slotId,
      preferred_dates: slotId ? null : dates,
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
      </div>
    )
  }

  const inputCls = 'block w-full border border-gray-300 rounded px-3 py-2'
  const labelCls = 'block text-sm font-medium mt-4 mb-1'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      <label className={labelCls}>Building</label>
      <div className="flex flex-wrap gap-2">
        {buildings.map((b) => (
          <button key={b.id} type="button" onClick={() => { setBuildingId(b.id); setValue('building_id', b.id) }}
                  className={`px-3 py-1.5 rounded border ${buildingId === b.id ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
            {b.name}
          </button>
        ))}
      </div>

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
                      className={`px-3 py-1.5 rounded border ${active ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
                {label}
              </button>
            )
          })}
        </div>
      )}

      <label className={labelCls}>…or propose up to 3 preferred dates</label>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={d1} onChange={(e) => setD1(e.target.value)} className={inputCls + ' max-w-[160px]'} />
        <input type="date" value={d2} onChange={(e) => setD2(e.target.value)} className={inputCls + ' max-w-[160px]'} />
        <input type="date" value={d3} onChange={(e) => setD3(e.target.value)} className={inputCls + ' max-w-[160px]'} />
      </div>

      <label className={labelCls}>Your name</label>
      <input {...register('prospect_name')} className={inputCls} />

      <label className={labelCls}>Email</label>
      <input {...register('prospect_email')} type="email" className={inputCls} />

      <label className={labelCls}>Phone (optional)</label>
      <input {...register('prospect_phone')} type="tel" className={inputCls} />

      <label className={labelCls}>Message (optional)</label>
      <textarea {...register('message')} rows={3} className={inputCls} />

      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstile} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={isSubmitting} className="mt-4 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400">
        {isSubmitting ? 'Submitting…' : 'Request showing'}
      </button>
    </form>
  )
}
