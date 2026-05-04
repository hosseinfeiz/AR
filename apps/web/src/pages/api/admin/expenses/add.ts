export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import { expenses, type ExpenseCategory } from '../../../../lib/finance-fixtures'

const VALID_CATEGORIES: ExpenseCategory[] = [
  'advertising', 'cleaning_maintenance', 'insurance', 'mortgage_interest',
  'repairs', 'supplies', 'taxes', 'utilities', 'management_fees',
  'professional_fees', 'other',
]

const VALID_METHODS = ['ach', 'card', 'check', 'cash']
const VALID_STATUSES = ['paid', 'pending']
const VALID_BUILDINGS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
]

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const {
    building_id,
    category,
    vendor_id,
    amount_cents,
    expense_date,
    status,
    payment_method,
    description,
    notes,
  } = body

  // Validate
  const errs: string[] = []

  if (typeof building_id !== 'string' || !VALID_BUILDINGS.includes(building_id)) {
    errs.push('Invalid building_id.')
  }
  if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category as ExpenseCategory)) {
    errs.push('Invalid category.')
  }
  if (vendor_id !== null && typeof vendor_id !== 'string') {
    errs.push('vendor_id must be a string or null.')
  }
  if (typeof amount_cents !== 'number' || !Number.isInteger(amount_cents) || amount_cents <= 0) {
    errs.push('amount_cents must be a positive integer.')
  }
  if (typeof expense_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    errs.push('expense_date must be YYYY-MM-DD.')
  } else if (expense_date > '2026-05-04') {
    errs.push('expense_date cannot be in the future.')
  }
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
    errs.push('Invalid status.')
  }
  if (typeof payment_method !== 'string' || !VALID_METHODS.includes(payment_method)) {
    errs.push('Invalid payment_method.')
  }
  if (typeof description !== 'string' || description.trim() === '') {
    errs.push('description is required.')
  }
  if (notes !== null && notes !== undefined && typeof notes !== 'string') {
    errs.push('notes must be a string or null.')
  }

  if (errs.length > 0) {
    return new Response(JSON.stringify({ ok: false, error: errs.join(' ') }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Generate ID
  const id = `exp-new-${Date.now()}`

  expenses.push({
    id,
    building_id: building_id as string,
    vendor_id: (vendor_id as string | null) || null,
    category: category as ExpenseCategory,
    description: (description as string).trim(),
    amount_cents: amount_cents as number,
    expense_date: expense_date as string,
    status: status as 'paid' | 'pending',
    payment_method: payment_method as 'ach' | 'card' | 'check' | 'cash',
    receipt_number: null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    created_at: new Date().toISOString(),
  })

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
