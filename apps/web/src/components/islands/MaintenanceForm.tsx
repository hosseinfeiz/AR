import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MaintenanceRequestInputSchema, type MaintenanceRequestInput } from '@ar/shared'
import { TurnstileWidget } from './TurnstileWidget'
import { PhotoUploader } from './PhotoUploader'

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileSiteKey: string
  buildings: { id: string; name: string }[]
  mockMode?: boolean
}

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v)

export function MaintenanceForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings, mockMode = false }: Props) {
  const [turnstile, setTurnstile] = useState<string | null>(mockMode ? 'dev-mock-token' : null)
  const [photoPaths, setPhotoPaths] = useState<string[]>([])
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting, submitCount }, setValue, watch } = useForm<MaintenanceRequestInput>({
    resolver: zodResolver(MaintenanceRequestInputSchema),
    mode: 'onSubmit',
    defaultValues: {
      source: 'web',
      photo_paths: [],
      turnstile_token: mockMode ? 'dev-mock-token' : '',
      building_id: undefined as unknown as string,
      unit_number: '',
      tenant_name: '',
      tenant_email: null,
      tenant_phone: null,
      issue_type: undefined as unknown as MaintenanceRequestInput['issue_type'],
      urgency: undefined as unknown as MaintenanceRequestInput['urgency'],
      description: '',
    },
  })

  useEffect(() => { setValue('photo_paths', photoPaths) }, [photoPaths, setValue])
  useEffect(() => { if (turnstile) setValue('turnstile_token', turnstile) }, [turnstile, setValue])

  // Register fields not bound to a normal <input>; needed so RHF tracks/validates them.
  useEffect(() => {
    register('building_id')
    register('issue_type')
    register('urgency')
    register('photo_paths')
    register('turnstile_token')
    register('source')
  }, [register])

  const buildingId = watch('building_id')
  const urgency = watch('urgency')
  const issueType = watch('issue_type')

  async function onSubmit(values: MaintenanceRequestInput) {
    setSubmitError(null)
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setSubmitError(err.error ?? `Submission failed (${res.status}). Please try again.`)
        return
      }
      const data = await res.json() as { ref_id: string }
      setSubmitted({ ref_id: data.ref_id })
    } catch (e) {
      setSubmitError((e as Error).message ?? 'Network error. Please try again.')
    }
  }

  if (submitted) {
    return (
      <div className="border border-green-300 bg-green-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-green-900">Request received</h2>
        <p className="mt-2 text-green-900">Reference: <strong>{submitted.ref_id}</strong>. A property manager will follow up within one business day.</p>
        <button
          type="button"
          onClick={() => { setSubmitted(null); setPhotoPaths([]); setTurnstile(mockMode ? 'dev-mock-token' : null) }}
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

  // Surface the schema-level refine error ("Provide an email or phone").
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
            onClick={() => setValue('building_id', b.id, { shouldValidate: true })}
            className={`px-3 py-1.5 rounded border text-sm ${buildingId === b.id ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300 hover:border-gray-400'}`}
          >
            {b.name}
          </button>
        ))}
      </div>
      {errors.building_id && <p className={errCls}>Pick a building.</p>}

      <label className={labelCls}>Unit number <span className="text-red-600">*</span></label>
      <input {...register('unit_number')} placeholder="e.g. 3B" className={inputCls} />
      {errors.unit_number && <p className={errCls}>{errors.unit_number.message ?? 'Required.'}</p>}

      <label className={labelCls}>Your name <span className="text-red-600">*</span></label>
      <input {...register('tenant_name')} className={inputCls} />
      {errors.tenant_name && <p className={errCls}>{errors.tenant_name.message ?? 'Required.'}</p>}

      <label className={labelCls}>Email <span className="text-gray-500 text-xs">(or phone)</span></label>
      <input
        type="email"
        autoComplete="email"
        className={inputCls}
        {...register('tenant_email', { setValueAs: emptyToNull as any })}
      />
      {errors.tenant_email && <p className={errCls}>Enter a valid email.</p>}

      <label className={labelCls}>Phone <span className="text-gray-500 text-xs">(or email)</span></label>
      <input
        type="tel"
        autoComplete="tel"
        className={inputCls}
        {...register('tenant_phone', { setValueAs: emptyToNull as any })}
      />
      {errors.tenant_phone && <p className={errCls}>Enter at least 7 digits.</p>}

      {rootError && <p className={errCls}>{rootError}</p>}

      <label className={labelCls}>Issue type <span className="text-red-600">*</span></label>
      <select
        className={inputCls}
        value={issueType ?? ''}
        onChange={(e) => setValue('issue_type', e.target.value as MaintenanceRequestInput['issue_type'], { shouldValidate: true })}
      >
        <option value="">Select…</option>
        <option value="plumbing">Plumbing</option>
        <option value="electrical">Electrical</option>
        <option value="hvac">HVAC / heating / cooling</option>
        <option value="appliance">Appliance</option>
        <option value="pest">Pest</option>
        <option value="locks">Locks / keys</option>
        <option value="other">Other</option>
      </select>
      {errors.issue_type && <p className={errCls}>Pick an issue type.</p>}

      <label className={labelCls}>Urgency <span className="text-red-600">*</span></label>
      <div className="flex flex-wrap gap-2">
        {(['low','normal','high','emergency'] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setValue('urgency', u, { shouldValidate: true })}
            className={`px-3 py-1.5 rounded border capitalize text-sm ${urgency === u ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300 hover:border-gray-400'}`}
          >
            {u}
          </button>
        ))}
      </div>
      {errors.urgency && <p className={errCls}>Pick an urgency level.</p>}

      <label className={labelCls}>Description <span className="text-red-600">*</span></label>
      <textarea {...register('description')} rows={4} className={inputCls} placeholder="Describe the issue (at least 10 characters)" />
      {errors.description && <p className={errCls}>{errors.description.message ?? 'Description is required (min 10 characters).'}</p>}

      <label className={labelCls}>Photos <span className="text-gray-500 text-xs">(optional, up to 5)</span></label>
      {mockMode ? (
        <p className="text-xs text-gray-500">Photo upload disabled in dev mock mode.</p>
      ) : (
        <PhotoUploader supabaseUrl={supabaseUrl} anonKey={anonKey} turnstileToken={turnstile} onPathsChange={setPhotoPaths} />
      )}

      {!mockMode && <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstile} />}

      {submitError && <p className={errCls}>{submitError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400"
      >
        {isSubmitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  )
}
