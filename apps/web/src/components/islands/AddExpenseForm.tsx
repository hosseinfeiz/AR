import { useState } from 'react'

const BUILDINGS = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Grass Lake Manor' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Winnetka Manor' },
]

const CATEGORIES = [
  { value: 'advertising', label: 'Advertising' },
  { value: 'cleaning_maintenance', label: 'Cleaning & maintenance' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'mortgage_interest', label: 'Mortgage interest' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'management_fees', label: 'Management fees' },
  { value: 'professional_fees', label: 'Professional fees' },
  { value: 'other', label: 'Other' },
]

const METHODS = [
  { value: 'ach', label: 'ACH' },
  { value: 'card', label: 'Card' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
]

interface Vendor {
  id: string
  name: string
}

interface Props {
  vendors: Vendor[]
  onCancel: () => void
}

type FormErrors = Partial<Record<string, string>>

export function AddExpenseForm({ vendors, onCancel }: Props) {
  const [building, setBuilding] = useState('')
  const [category, setCategory] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('2026-05-04') // today reference
  const [status, setStatus] = useState<'paid' | 'pending'>('paid')
  const [method, setMethod] = useState('check')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function validate(): boolean {
    const errs: FormErrors = {}
    if (!building) errs['building'] = 'Building is required.'
    if (!category) errs['category'] = 'Category is required.'
    if (!description.trim()) errs['description'] = 'Description is required.'
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      errs['amount'] = 'Amount must be a positive number.'
    }
    if (!date) errs['date'] = 'Date is required.'
    else if (date > '2026-05-04') errs['date'] = 'Date cannot be in the future.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setServerError(null)

    const amountCents = Math.round(parseFloat(amount) * 100)

    try {
      const res = await fetch('/api/admin/expenses/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building_id: building,
          category,
          vendor_id: vendorId || null,
          amount_cents: amountCents,
          expense_date: date,
          status,
          payment_method: method,
          description: description.trim(),
          notes: notes.trim() || null,
        }),
      })

      const data = await res.json() as { ok: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setServerError(data.error ?? 'Failed to save expense.')
        setSubmitting(false)
        return
      }

      // Reload to show new row
      window.location.reload()
    } catch {
      setServerError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  function fieldClass(name: string) {
    return `w-full text-sm border rounded px-3 py-2 ${
      errors[name] ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
    } focus:outline-none focus:ring-2 focus:ring-blue-300`
  }

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Add expense</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {/* Building */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Building <span className="text-red-500">*</span>
            </label>
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              className={fieldClass('building')}
            >
              <option value="">Select building…</option>
              {BUILDINGS.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors['building'] && <p className="text-xs text-red-600 mt-1">{errors['building']}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={fieldClass('category')}
            >
              <option value="">Select category…</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {errors['category'] && <p className="text-xs text-red-600 mt-1">{errors['category']}</p>}
          </div>

          {/* Vendor */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Vendor (optional)
            </label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className={fieldClass('vendor')}
            >
              <option value="">— Ad-hoc / no vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Amount ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={fieldClass('amount')}
            />
            {errors['amount'] && <p className="text-xs text-red-600 mt-1">{errors['amount']}</p>}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              max="2026-05-04"
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass('date')}
            />
            {errors['date'] && <p className="text-xs text-red-600 mt-1">{errors['date']}</p>}
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'paid' | 'pending')}
              className={fieldClass('status')}
            >
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={fieldClass('method')}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Brief description of expense…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldClass('description')}
            />
            {errors['description'] && <p className="text-xs text-red-600 mt-1">{errors['description']}</p>}
          </div>

          {/* Notes */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              placeholder="Any additional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${fieldClass('notes')} resize-none`}
            />
          </div>
        </div>

        {serverError && (
          <div className="mb-4 text-sm text-red-700 bg-red-100 border border-red-200 rounded px-3 py-2">
            {serverError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="bg-[var(--color-brand)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-brand-dark)] disabled:opacity-50 transition"
          >
            {submitting ? 'Saving…' : 'Save expense'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:border-gray-400 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// Toggle wrapper exported as default — handles show/hide state
export default function AddExpenseToggle({ vendors }: { vendors: Vendor[] }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-[var(--color-brand)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-brand-dark)] transition"
      >
        + Add expense
      </button>
    )
  }

  return <AddExpenseForm vendors={vendors} onCancel={() => setOpen(false)} />
}
