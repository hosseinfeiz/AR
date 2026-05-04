import { z } from 'zod'

export const ShowingRequestInputSchema = z.object({
  building_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable(),
  slot_id: z.string().uuid().nullable(),
  prospect_name: z.string().min(1).max(120),
  prospect_email: z.string().email(),
  prospect_phone: z.string().min(7).max(32).nullable(),
  preferred_dates: z.array(z.string().date()).max(3).nullable(),
  message: z.string().max(2000).nullable(),
  source: z.enum(['web', 'ios', 'android']),
  turnstile_token: z.string().min(1),
}).refine(
  (v) => v.slot_id !== null || (v.preferred_dates !== null && v.preferred_dates.length >= 1),
  { message: 'Either pick a slot or provide at least one preferred date' }
)
export type ShowingRequestInput = z.infer<typeof ShowingRequestInputSchema>
