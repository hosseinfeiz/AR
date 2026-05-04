import { z } from 'zod'

export const IssueType = z.enum(['plumbing','electrical','hvac','appliance','pest','locks','other'])
export const Urgency = z.enum(['low','normal','high','emergency'])

export const MaintenanceRequestInputSchema = z.object({
  building_id: z.string().uuid(),
  unit_number: z.string().min(1).max(32),
  tenant_name: z.string().min(1).max(120),
  tenant_email: z.string().email().nullable(),
  tenant_phone: z.string().min(7).max(32).nullable(),
  issue_type: IssueType,
  urgency: Urgency,
  description: z.string().min(10).max(4000),
  photo_paths: z.array(z.string()).max(5),
  source: z.enum(['web','ios','android']),
  turnstile_token: z.string().min(1),
}).refine(
  (v) => v.tenant_email !== null || v.tenant_phone !== null,
  { message: 'Provide an email or phone number' }
)
export type MaintenanceRequestInput = z.infer<typeof MaintenanceRequestInputSchema>
