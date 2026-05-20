import { useMemo, useState } from 'react'
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'

interface Props {
  publishableKey: string
  /** If the tenant already has an active method, we show it as a status badge instead of the setup form. */
  existingMethod?: {
    last4: string | null
    bankName: string | null
    brand: string | null
    type: string
  } | null
  /** Optional override for the API endpoint (used in tests). */
  apiUrl?: string
}

// ---------------------------------------------------------------------------
// Outer wrapper — loads stripe.js lazily and only mounts <Elements> once we
// have a SetupIntent client secret from the server.
// ---------------------------------------------------------------------------

export function StripeAchSetup({ publishableKey, existingMethod, apiUrl = '/api/portal/setup-ach' }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null
    return loadStripe(publishableKey)
  }, [publishableKey])

  async function startSetup() {
    setRequesting(true)
    setError(null)
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentMethodType: 'us_bank_account' }),
      })
      const data = (await res.json()) as {
        ok: boolean
        clientSecret?: string
        error?: string
      }
      if (!data.ok || !data.clientSecret) {
        throw new Error(data.error ?? 'Could not start ACH setup')
      }
      setClientSecret(data.clientSecret)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRequesting(false)
    }
  }

  // ---- Existing method: show status badge ----
  if (existingMethod) {
    const label =
      existingMethod.type === 'card'
        ? `${existingMethod.brand ?? 'Card'} ending in ${existingMethod.last4 ?? '????'}`
        : `${existingMethod.bankName ?? 'Bank account'} ending in ${existingMethod.last4 ?? '????'}`
    return (
      <div className="border border-green-200 bg-green-50 rounded-xl px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Auto-pay active
          </span>
          <span className="text-sm text-gray-700">{label}</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Rent will be debited automatically on the due date. Contact the office to change or remove this method.
        </p>
      </div>
    )
  }

  // ---- Pre-setup CTA ----
  if (!clientSecret) {
    return (
      <div className="border border-gray-200 rounded-xl px-5 py-4">
        <p className="text-sm text-gray-700 mb-3">
          Set up ACH auto-pay to have rent debited automatically each month. Bank transfers are free and clear in 1-3 business days.
        </p>
        {error && (
          <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg px-3 py-2 text-sm mb-3">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={startSetup}
          disabled={requesting || !publishableKey}
          className="text-sm bg-[var(--color-brand)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400 transition"
        >
          {requesting ? 'Starting…' : 'Set up auto-pay'}
        </button>
        {!publishableKey && (
          <p className="text-xs text-amber-700 mt-2">
            Stripe is not configured for this environment.
          </p>
        )}
      </div>
    )
  }

  // ---- Stripe Elements form ----
  if (!stripePromise) {
    return (
      <div className="border border-red-200 bg-red-50 text-red-800 rounded-xl px-5 py-4 text-sm">
        Stripe library failed to load.
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl px-5 py-4">
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
        <ConfirmAchForm clientSecret={clientSecret} />
      </Elements>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inner form — uses useStripe()/useElements() to confirm the SetupIntent.
// Stripe presents the bank-selection UI (Financial Connections) inside the
// PaymentElement; on submit we call confirmSetup() and the mandate is
// captured. The actual `tenant_payment_methods` row is written by our
// webhook on `setup_intent.succeeded` — confirmation here just hands the
// PaymentMethod back to Stripe.
// ---------------------------------------------------------------------------

function ConfirmAchForm({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await confirmSetup(stripe, elements, clientSecret)
      if (result.error) {
        setError(result.error.message ?? 'Could not confirm bank account')
      } else {
        setSucceeded(true)
        // Reload after a beat so the page picks up the new auto-pay state
        // (the webhook may take a moment to populate the row).
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  if (succeeded) {
    return (
      <div className="text-sm text-green-800">
        Bank account verified. Auto-pay will appear on this page once Stripe finishes processing.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="text-sm bg-[var(--color-brand)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400 transition"
      >
        {submitting ? 'Confirming…' : 'Confirm bank account'}
      </button>
    </form>
  )
}

// Thin wrapper so tests/mocks can swap in a stub.
async function confirmSetup(stripe: Stripe, elements: StripeElements, _clientSecret: string) {
  return stripe.confirmSetup({
    elements,
    confirmParams: {
      return_url: window.location.href,
    },
    redirect: 'if_required',
  })
}
