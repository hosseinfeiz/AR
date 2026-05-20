export const prerender = false
import { z } from '@ar/shared'
import { getSession } from '../../../../lib/auth'
import { expenses, type ExpenseCategory } from '../../../../lib/finance-fixtures'
import { apiHandler, forbidden, ok } from '../../../../lib/api-handler'

const VALID_CATEGORIES = [
  'advertising', 'cleaning_maintenance', 'insurance', 'mortgage_interest',
  'repairs', 'supplies', 'taxes', 'utilities', 'management_fees',
  'professional_fees', 'other',
] as const satisfies readonly ExpenseCategory[]

const VALID_METHODS = ['ach', 'card', 'check', 'cash'] as const
const VALID_STATUSES = ['paid', 'pending'] as const
const VALID_BUILDINGS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
] as const

// Matches the legacy hand-rolled validation cut-off. Kept as a constant so it
// is easy to bump or replace with `new Date().toISOString().slice(0, 10)`.
const TODAY = '2026-05-04'

const AddExpenseInputSchema = z.object({
  building_id: z.enum(VALID_BUILDINGS, {
    errorMap: () => ({ message: 'Invalid building_id.' }),
  }),
  category: z.enum(VALID_CATEGORIES, {
    errorMap: () => ({ message: 'Invalid category.' }),
  }),
  vendor_id: z.union([z.string(), z.null()], {
    errorMap: () => ({ message: 'vendor_id must be a string or null.' }),
  }),
  amount_cents: z
    .number({ invalid_type_error: 'amount_cents must be a positive integer.' })
    .int('amount_cents must be a positive integer.')
    .positive('amount_cents must be a positive integer.'),
  expense_date: z
    .string({ invalid_type_error: 'expense_date must be YYYY-MM-DD.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expense_date must be YYYY-MM-DD.')
    .refine((d) => d <= TODAY, { message: 'expense_date cannot be in the future.' }),
  status: z.enum(VALID_STATUSES, {
    errorMap: () => ({ message: 'Invalid status.' }),
  }),
  payment_method: z.enum(VALID_METHODS, {
    errorMap: () => ({ message: 'Invalid payment_method.' }),
  }),
  description: z
    .string({ invalid_type_error: 'description is required.' })
    .refine((s) => s.trim() !== '', { message: 'description is required.' }),
  notes: z
    .union([z.string(), z.null()], {
      errorMap: () => ({ message: 'notes must be a string or null.' }),
    })
    .optional(),
})

export const POST = apiHandler(AddExpenseInputSchema, (data, { cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return forbidden()
  }

  // Validation already happened in `apiHandler` — invalid payloads short-
  // circuit with a 400 + VALIDATION_ERROR before reaching this point.

  const notes = data.notes
  const id = `exp-new-${Date.now()}`

  expenses.push({
    id,
    building_id: data.building_id,
    vendor_id: data.vendor_id || null,
    category: data.category,
    description: data.description.trim(),
    amount_cents: data.amount_cents,
    expense_date: data.expense_date,
    status: data.status,
    payment_method: data.payment_method,
    receipt_number: null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    created_at: new Date().toISOString(),
  })

  return ok({ ok: true, id })
})
