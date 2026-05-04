import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MaintenanceRequestInputSchema, type MaintenanceRequestInput } from '@ar/shared'
import { createClient } from '@supabase/supabase-js'
import { TurnstileWidget } from './TurnstileWidget'
import { PhotoUploader } from './PhotoUploader'

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileSiteKey: string
  buildings: { id: string; name: string }[]
}

export function MaintenanceForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings }: Props) {
  const supabase = createClient(supabaseUrl, anonKey)
  const [turnstile, setTurnstile] = useState<string | null>(null)
  const [photoPaths, setPhotoPaths] = useState<string[]>([])
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch } = useForm<MaintenanceRequestInput>({
    resolver: zodResolver(MaintenanceRequestInputSchema),
    defaultValues: { source: 'web', photo_paths: [], turnstile_token: '' },
  })

  useEffect(() => { setValue('photo_paths', photoPaths) }, [photoPaths, setValue])
  useEffect(() => { if (turnstile) setValue('turnstile_token', turnstile) }, [turnstile, setValue])

  const buildingId = watch('building_id')
  const urgency = watch('urgency')

  async function onSubmit(values: MaintenanceRequestInput) {
    setSubmitError(null)
    const { turnstile_token, ...payload } = values
    const { data, error } = await supabase.from('maintenance_requests').insert(payload).select('ref_id').single()
    if (error) { setSubmitError(error.message); return }
    setSubmitted({ ref_id: data!.ref_id })
  }

  if (submitted) {
    return (
      <div className="border border-green-300 bg-green-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-green-900">Request received</h2>
        <p className="mt-2 text-green-900">Reference: <strong>{submitted.ref_id}</strong>. A property manager will follow up within one business day.</p>
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
          <button key={b.id} type="button" onClick={() => setValue('building_id', b.id, { shouldValidate: true })}
                  className={`px-3 py-1.5 rounded border ${buildingId === b.id ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
            {b.name}
          </button>
        ))}
      </div>
      {errors.building_id && <p className="text-sm text-red-600">Pick a building</p>}

      <label className={labelCls}>Unit number</label>
      <input {...register('unit_number')} placeholder="e.g. 3B" className={inputCls} />
      {errors.unit_number && <p className="text-sm text-red-600">{errors.unit_number.message}</p>}

      <label className={labelCls}>Your name</label>
      <input {...register('tenant_name')} className={inputCls} />
      {errors.tenant_name && <p className="text-sm text-red-600">{errors.tenant_name.message}</p>}

      <label className={labelCls}>Email</label>
      <input {...register('tenant_email')} type="email" className={inputCls} />
      <label className={labelCls}>Phone (optional if email provided)</label>
      <input {...register('tenant_phone')} type="tel" className={inputCls} />

      <label className={labelCls}>Issue type</label>
      <select {...register('issue_type')} className={inputCls}>
        <option value="">Select…</option>
        <option value="plumbing">Plumbing</option>
        <option value="electrical">Electrical</option>
        <option value="hvac">HVAC / heating / cooling</option>
        <option value="appliance">Appliance</option>
        <option value="pest">Pest</option>
        <option value="locks">Locks / keys</option>
        <option value="other">Other</option>
      </select>

      <label className={labelCls}>Urgency</label>
      <div className="flex flex-wrap gap-2">
        {(['low','normal','high','emergency'] as const).map((u) => (
          <button key={u} type="button" onClick={() => setValue('urgency', u, { shouldValidate: true })}
                  className={`px-3 py-1.5 rounded border capitalize ${urgency === u ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
            {u}
          </button>
        ))}
      </div>

      <label className={labelCls}>Description</label>
      <textarea {...register('description')} rows={4} className={inputCls} />
      {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}

      <label className={labelCls}>Photos (optional, up to 5)</label>
      <PhotoUploader supabaseUrl={supabaseUrl} anonKey={anonKey} turnstileToken={turnstile} onPathsChange={setPhotoPaths} />

      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstile} />

      {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

      <button type="submit" disabled={isSubmitting} className="mt-4 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400">
        {isSubmitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  )
}
