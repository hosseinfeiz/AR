import { z } from 'zod'

export const UnitStatus = z.enum(['available', 'leased', 'coming_soon', 'off_market'])
export type UnitStatusT = z.infer<typeof UnitStatus>

export const UnitSchema = z.object({
  id: z.string().uuid(),
  building_id: z.string().uuid(),
  unit_number: z.string().min(1).max(32),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0).max(10),
  sqft: z.number().int().positive().nullable(),
  monthly_rent_cents: z.number().int().positive(),
  deposit_cents: z.number().int().nonnegative().nullable(),
  available_from: z.string().date().nullable(),
  status: UnitStatus,
  floor_plan_path: z.string().nullable(),
  description_md: z.string(),
  sort_order: z.number().int().default(0),
})
export type Unit = z.infer<typeof UnitSchema>
