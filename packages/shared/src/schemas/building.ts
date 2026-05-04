import { z } from 'zod'

export const BuildingSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  address_line1: z.string().min(1),
  address_line2: z.string().nullable(),
  city: z.string().min(1),
  state: z.string().length(2),
  postal_code: z.string().min(3),
  country: z.string().length(2).default('US'),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  description_md: z.string(),
  neighborhood_md: z.string(),
  amenities: z.array(z.string()),
  hero_photo_path: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().email().nullable(),
  seo_title: z.string().max(60).nullable(),
  seo_description: z.string().max(160).nullable(),
  is_published: z.boolean(),
})
export type Building = z.infer<typeof BuildingSchema>
