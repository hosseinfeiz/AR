// Tenant portal mock data — cookie-based auth demo, no real Supabase Auth.

export interface Tenant {
  id: string
  name: string
  email: string
  phone: string | null
  building_id: string
  unit_id: string
  unit_label: string
  move_in_date: string
  password: string
  avatar_initials: string
}

export interface Lease {
  id: string
  tenant_id: string
  unit_id: string
  start_date: string
  end_date: string
  monthly_rent_cents: number
  security_deposit_cents: number
  status: 'active' | 'ended'
}

export interface Charge {
  id: string
  lease_id: string
  tenant_id: string
  description: string
  amount_cents: number
  due_date: string
  status: 'paid' | 'due' | 'overdue'
  paid_payment_id: string | null
}

export interface Payment {
  id: string
  tenant_id: string
  charge_id: string
  amount_cents: number
  paid_at: string
  method: 'ach' | 'card'
  receipt_number: string
}

export interface Message {
  id: string
  tenant_id: string
  from_name: string
  subject: string
  body: string
  sent_at: string
  read: boolean
  category: 'announcement' | 'lease' | 'payment' | 'maintenance' | 'general'
}

export interface TenantMaintenanceRequest {
  id: string
  ref_id: string
  tenant_id: string
  building_id: string
  unit_label: string
  issue_type: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'pest' | 'locks' | 'other'
  urgency: 'low' | 'normal' | 'high' | 'emergency'
  description: string
  status: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
  manager_notes: string | null
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export const tenants: Tenant[] = [
  // Grass Lake Manor (3 tenants)
  {
    id: 'tenant-0001-0000-0000-000000000001',
    name: 'Sarah Jensen',
    email: 'sarah.jensen@demo.test',
    phone: '(612) 555-0201',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_id: 'aaaa1111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #2A',
    move_in_date: '2025-09-01',
    password: 'tenant123',
    avatar_initials: 'SJ',
  },
  {
    id: 'tenant-0002-0000-0000-000000000002',
    name: 'Marcus Lee',
    email: 'marcus.lee@demo.test',
    phone: '(612) 555-0202',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_id: 'aaaa2222-2222-2222-2222-222222222222',
    unit_label: 'Grass Lake Manor #3B',
    move_in_date: '2025-10-01',
    password: 'tenant123',
    avatar_initials: 'ML',
  },
  {
    id: 'tenant-0003-0000-0000-000000000003',
    name: 'Emma Rodriguez',
    email: 'emma.rodriguez@demo.test',
    phone: '(612) 555-0203',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_id: 'cccc1111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #1D',
    move_in_date: '2025-08-01',
    password: 'tenant123',
    avatar_initials: 'ER',
  },
  // Winnetka Manor (3 tenants)
  {
    id: 'tenant-0004-0000-0000-000000000004',
    name: 'Priya Patel',
    email: 'priya.patel@demo.test',
    phone: '(763) 555-0204',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_id: 'bbbb1111-1111-1111-1111-111111111111',
    unit_label: 'Winnetka Manor #1C',
    move_in_date: '2026-01-01',
    password: 'tenant123',
    avatar_initials: 'PP',
  },
  {
    id: 'tenant-0005-0000-0000-000000000005',
    name: 'David Chen',
    email: 'david.chen@demo.test',
    phone: '(763) 555-0205',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_id: 'bbbb2222-2222-2222-2222-222222222222',
    unit_label: 'Winnetka Manor #4A',
    move_in_date: '2025-11-01',
    password: 'tenant123',
    avatar_initials: 'DC',
  },
  {
    id: 'tenant-0006-0000-0000-000000000006',
    name: 'James Anderson',
    email: 'james.anderson@demo.test',
    phone: '(763) 555-0206',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_id: 'dddd1111-1111-1111-1111-111111111111',
    unit_label: 'Winnetka Manor #2B',
    move_in_date: '2025-12-01',
    password: 'tenant123',
    avatar_initials: 'JA',
  },
]

// ---------------------------------------------------------------------------
// Leases
// ---------------------------------------------------------------------------

export const leases: Lease[] = [
  // Sarah Jensen — GLM #2A — $1,095/mo — started 2025-09-01
  {
    id: 'lease-0001-0000-0000-000000000001',
    tenant_id: 'tenant-0001-0000-0000-000000000001',
    unit_id: 'aaaa1111-1111-1111-1111-111111111111',
    start_date: '2025-09-01',
    end_date: '2026-08-31',
    monthly_rent_cents: 109500,
    security_deposit_cents: 109500,
    status: 'active',
  },
  // Marcus Lee — GLM #3B — $1,425/mo — started 2025-10-01
  {
    id: 'lease-0002-0000-0000-000000000002',
    tenant_id: 'tenant-0002-0000-0000-000000000002',
    unit_id: 'aaaa2222-2222-2222-2222-222222222222',
    start_date: '2025-10-01',
    end_date: '2026-09-30',
    monthly_rent_cents: 142500,
    security_deposit_cents: 142500,
    status: 'active',
  },
  // Emma Rodriguez — GLM #1D — $1,250/mo — started 2025-08-01
  {
    id: 'lease-0003-0000-0000-000000000003',
    tenant_id: 'tenant-0003-0000-0000-000000000003',
    unit_id: 'cccc1111-1111-1111-1111-111111111111',
    start_date: '2025-08-01',
    end_date: '2026-07-31',
    monthly_rent_cents: 125000,
    security_deposit_cents: 125000,
    status: 'active',
  },
  // Priya Patel — WM #1C — $1,325/mo — started 2026-01-01
  {
    id: 'lease-0004-0000-0000-000000000004',
    tenant_id: 'tenant-0004-0000-0000-000000000004',
    unit_id: 'bbbb1111-1111-1111-1111-111111111111',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    monthly_rent_cents: 132500,
    security_deposit_cents: 132500,
    status: 'active',
  },
  // David Chen — WM #4A — $2,250/mo — started 2025-11-01
  {
    id: 'lease-0005-0000-0000-000000000005',
    tenant_id: 'tenant-0005-0000-0000-000000000005',
    unit_id: 'bbbb2222-2222-2222-2222-222222222222',
    start_date: '2025-11-01',
    end_date: '2026-10-31',
    monthly_rent_cents: 225000,
    security_deposit_cents: 225000,
    status: 'active',
  },
  // James Anderson — WM #2B — $1,850/mo — started 2025-12-01
  {
    id: 'lease-0006-0000-0000-000000000006',
    tenant_id: 'tenant-0006-0000-0000-000000000006',
    unit_id: 'dddd1111-1111-1111-1111-111111111111',
    start_date: '2025-12-01',
    end_date: '2026-11-30',
    monthly_rent_cents: 185000,
    security_deposit_cents: 185000,
    status: 'active',
  },
]

// ---------------------------------------------------------------------------
// Charges & Payments helper — generated below
// Today = 2026-05-04
// Due dates <= 2026-05-03 with month < May => paid
// May charge => 'due' (or 'overdue' for Marcus Lee whose April charge is overdue)
// ---------------------------------------------------------------------------

function addMonths(isoDate: string, n: number): string {
  const d = new Date(isoDate)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

function monthLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function rcpNumber(seed: number): string {
  const a = String(seed).padStart(4, '0').slice(-4)
  const b = String(seed * 7 + 1337).padStart(4, '0').slice(-4)
  return `RCP-${a}-${b}`
}

function generateChargesAndPayments(
  leaseId: string,
  tenantId: string,
  startDate: string,
  rentCents: number,
  seedOffset: number,
  overdueScenario: boolean,
): { charges: Charge[]; payments: Payment[] } {
  const charges: Charge[] = []
  const payments: Payment[] = []
  const TODAY = new Date('2026-05-04T00:00:00Z')

  for (let i = 0; i < 6; i++) {
    const dueDate = addMonths(startDate, i)
    const chargeId = `chg-${tenantId.slice(-8)}-${String(i + 1).padStart(2, '0')}`
    const paymentId = `pay-${tenantId.slice(-8)}-${String(i + 1).padStart(2, '0')}`
    const dueDateTime = new Date(dueDate + 'T00:00:00Z')

    let chargeStatus: 'paid' | 'due' | 'overdue'

    if (overdueScenario) {
      // Marcus Lee: first 4 paid, April (i=6 from Oct start = month 6) ... let's handle specially
      // Marcus starts 2025-10-01, so:
      // i=0 => Oct, i=1 => Nov, i=2 => Dec, i=3 => Jan, i=4 => Feb, i=5 => Mar (all past)
      // We need to show April as overdue. Since we only do 6 charges starting Oct:
      // That gives Oct-Mar paid, then May would be due. We'll make i=5 (March) paid and
      // handle the overdue April charge separately below.
      if (dueDateTime < TODAY) {
        chargeStatus = 'paid'
      } else {
        chargeStatus = 'due'
      }
    } else {
      if (dueDateTime < TODAY) {
        chargeStatus = 'paid'
      } else {
        chargeStatus = 'due'
      }
    }

    const charge: Charge = {
      id: chargeId,
      lease_id: leaseId,
      tenant_id: tenantId,
      description: `Monthly rent — ${monthLabel(dueDate)}`,
      amount_cents: rentCents,
      due_date: dueDate,
      status: chargeStatus,
      paid_payment_id: chargeStatus === 'paid' ? paymentId : null,
    }
    charges.push(charge)

    if (chargeStatus === 'paid') {
      // paid 1-3 days after due date
      const daysAfter = (i % 3) + 1
      const paidAt = new Date(dueDateTime)
      paidAt.setUTCDate(paidAt.getUTCDate() + daysAfter)
      const method: 'ach' | 'card' = i % 2 === 0 ? 'ach' : 'card'
      payments.push({
        id: paymentId,
        tenant_id: tenantId,
        charge_id: chargeId,
        amount_cents: rentCents,
        paid_at: paidAt.toISOString(),
        method,
        receipt_number: rcpNumber(seedOffset * 100 + i + 1),
      })
    }
  }

  return { charges, payments }
}

// Generate for all 6 tenants
const _allCharges: Charge[] = []
const _allPayments: Payment[] = []

const leaseData = [
  { leaseId: 'lease-0001-0000-0000-000000000001', tenantId: 'tenant-0001-0000-0000-000000000001', start: '2025-09-01', rent: 109500, seed: 1, overdue: false },
  { leaseId: 'lease-0002-0000-0000-000000000002', tenantId: 'tenant-0002-0000-0000-000000000002', start: '2025-10-01', rent: 142500, seed: 2, overdue: true },
  { leaseId: 'lease-0003-0000-0000-000000000003', tenantId: 'tenant-0003-0000-0000-000000000003', start: '2025-08-01', rent: 125000, seed: 3, overdue: false },
  { leaseId: 'lease-0004-0000-0000-000000000004', tenantId: 'tenant-0004-0000-0000-000000000004', start: '2026-01-01', rent: 132500, seed: 4, overdue: false },
  { leaseId: 'lease-0005-0000-0000-000000000005', tenantId: 'tenant-0005-0000-0000-000000000005', start: '2025-11-01', rent: 225000, seed: 5, overdue: false },
  { leaseId: 'lease-0006-0000-0000-000000000006', tenantId: 'tenant-0006-0000-0000-000000000006', start: '2025-12-01', rent: 185000, seed: 6, overdue: false },
]

for (const ld of leaseData) {
  const { charges, payments } = generateChargesAndPayments(ld.leaseId, ld.tenantId, ld.start, ld.rent, ld.seed, ld.overdue)
  _allCharges.push(...charges)
  _allPayments.push(...payments)
}

// Add Marcus Lee's overdue April charge manually
const marcusOverdueCharge: Charge = {
  id: 'chg-00000002-OV',
  lease_id: 'lease-0002-0000-0000-000000000002',
  tenant_id: 'tenant-0002-0000-0000-000000000002',
  description: 'Monthly rent — April 2026',
  amount_cents: 142500,
  due_date: '2026-04-01',
  status: 'overdue',
  paid_payment_id: null,
}
_allCharges.push(marcusOverdueCharge)

// Export mutable arrays so in-memory mutations work
export const charges: Charge[] = _allCharges
export const payments: Payment[] = _allPayments

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messages: Message[] = [
  // Sarah Jensen — GLM #2A
  {
    id: 'msg-sj-001',
    tenant_id: 'tenant-0001-0000-0000-000000000001',
    from_name: 'AR Management Office',
    subject: 'Welcome to Grass Lake Manor!',
    body: `Dear Sarah,

Welcome home! We're thrilled to have you as a resident at Grass Lake Manor. Your unit #2A is ready for move-in on September 1st.

A few reminders:
- Laundry room hours: 7 AM – 10 PM daily
- Parking space #12 is assigned to your unit
- Emergency maintenance: (612) 555-0142

Don't hesitate to reach out with any questions.

Warm regards,
AR Management Office`,
    sent_at: '2025-08-28T09:00:00Z',
    read: true,
    category: 'announcement',
  },
  {
    id: 'msg-sj-002',
    tenant_id: 'tenant-0001-0000-0000-000000000001',
    from_name: 'AR Management Office',
    subject: 'Payment receipt — October 2025 rent',
    body: `Hi Sarah,

Your rent payment of $1,095.00 for October 2025 has been received and applied to your account.

Receipt: RCP-0101-0708
Amount: $1,095.00
Method: ACH transfer
Date: October 2, 2025

Thank you for your timely payment!

AR Management Office`,
    sent_at: '2025-10-02T14:30:00Z',
    read: true,
    category: 'payment',
  },
  {
    id: 'msg-sj-003',
    tenant_id: 'tenant-0001-0000-0000-000000000001',
    from_name: 'AR Management Office',
    subject: 'Building hallway lighting upgrade — April 28',
    body: `Dear Residents,

We will be replacing the hallway lighting fixtures on floors 2 and 3 on Monday, April 28th between 9 AM and 1 PM. Temporary lighting will be in place during work. We apologize for any inconvenience.

If you have questions, please reply to this message.

AR Management Office`,
    sent_at: '2026-04-24T10:00:00Z',
    read: false,
    category: 'announcement',
  },

  // Marcus Lee — GLM #3B
  {
    id: 'msg-ml-001',
    tenant_id: 'tenant-0002-0000-0000-000000000002',
    from_name: 'AR Management Office',
    subject: 'Lease renewal reminder',
    body: `Hi Marcus,

Your lease for unit #3B at Grass Lake Manor is set to expire on September 30, 2026. We'd love to have you renew!

Please let us know by July 1st whether you'd like to renew for another 12 months. We anticipate a modest 3% rent adjustment for the renewal term.

Feel free to call us at (612) 555-0142 or reply to this message.

AR Management Office`,
    sent_at: '2026-04-15T11:00:00Z',
    read: true,
    category: 'lease',
  },
  {
    id: 'msg-ml-002',
    tenant_id: 'tenant-0002-0000-0000-000000000002',
    from_name: 'AR Management Office',
    subject: 'Late payment notice — April 2026 rent',
    body: `Dear Marcus,

Our records show that your April 2026 rent of $1,425.00 was due on April 1st and has not yet been received. A late fee of $75.00 may be applied after a 5-day grace period.

Please submit payment as soon as possible through the tenant portal or contact us to make arrangements.

AR Management Office`,
    sent_at: '2026-04-07T09:00:00Z',
    read: true,
    category: 'payment',
  },
  {
    id: 'msg-ml-003',
    tenant_id: 'tenant-0002-0000-0000-000000000002',
    from_name: 'AR Management Office',
    subject: 'Maintenance update — kitchen faucet (REF: BCDX4421)',
    body: `Hi Marcus,

Your maintenance request regarding the dripping kitchen faucet (ref BCDX4421) has been assigned to our plumber. Work is scheduled for Wednesday, May 7th between 10 AM and 2 PM.

You do not need to be home — we have building access. We'll leave a completion note on your door.

AR Management Office`,
    sent_at: '2026-05-01T15:00:00Z',
    read: false,
    category: 'maintenance',
  },

  // Emma Rodriguez — GLM #1D
  {
    id: 'msg-er-001',
    tenant_id: 'tenant-0003-0000-0000-000000000003',
    from_name: 'AR Management Office',
    subject: 'Summer property update — May 2026',
    body: `Dear Residents,

As we head into summer, a few updates from the management team:

- **Parking lot reseal** scheduled for June 10–11. Please move vehicles off-lot by 7 AM.
- **Annual inspection** notices will be mailed in late May. Inspections are brief (15 minutes) and can be rescheduled.
- **Pool/outdoor area** (GLM): outdoor seating and grill will be available starting Memorial Day weekend.

Thank you for being great residents!

AR Management Office`,
    sent_at: '2026-05-02T08:00:00Z',
    read: false,
    category: 'announcement',
  },
  {
    id: 'msg-er-002',
    tenant_id: 'tenant-0003-0000-0000-000000000003',
    from_name: 'AR Management Office',
    subject: 'Payment receipt — September 2025 rent',
    body: `Hi Emma,

Your payment of $1,250.00 for September 2025 has been received.

Receipt: RCP-0301-0938
Amount: $1,250.00
Method: ACH transfer
Date: September 2, 2025

AR Management Office`,
    sent_at: '2025-09-02T13:00:00Z',
    read: true,
    category: 'payment',
  },
  {
    id: 'msg-er-003',
    tenant_id: 'tenant-0003-0000-0000-000000000003',
    from_name: 'AR Management Office',
    subject: 'Maintenance resolved — bathroom exhaust fan',
    body: `Hi Emma,

We're happy to let you know that the bathroom exhaust fan replacement in unit #1D has been completed.

If you experience any further issues, please submit a new request through the tenant portal.

AR Management Office`,
    sent_at: '2026-03-15T16:00:00Z',
    read: true,
    category: 'maintenance',
  },

  // Priya Patel — WM #1C
  {
    id: 'msg-pp-001',
    tenant_id: 'tenant-0004-0000-0000-000000000004',
    from_name: 'AR Management Office',
    subject: 'Welcome to Winnetka Manor!',
    body: `Dear Priya,

Welcome to Winnetka Manor! We're so glad to have you join us on January 1st.

Your unit #1C has original hardwood floors and a courtyard-facing window — we hope you'll enjoy the quiet setting. The elevator key is included with your key packet.

Laundry room is on the lower level. Parking spot #3 is yours.

Looking forward to having you,
AR Management Office`,
    sent_at: '2025-12-28T10:00:00Z',
    read: true,
    category: 'announcement',
  },
  {
    id: 'msg-pp-002',
    tenant_id: 'tenant-0004-0000-0000-000000000004',
    from_name: 'AR Management Office',
    subject: 'Payment receipt — February 2026 rent',
    body: `Hi Priya,

Your payment of $1,325.00 for February 2026 has been received.

Receipt: RCP-0402-0415
Amount: $1,325.00
Method: Card
Date: February 2, 2026

AR Management Office`,
    sent_at: '2026-02-02T12:00:00Z',
    read: true,
    category: 'payment',
  },
  {
    id: 'msg-pp-003',
    tenant_id: 'tenant-0004-0000-0000-000000000004',
    from_name: 'AR Management Office',
    subject: 'Hallway carpet cleaning — May 8',
    body: `Dear Winnetka Manor Residents,

The hallway carpets on floors 1–3 will be professionally cleaned on Friday, May 8th starting at 8 AM. Please avoid the hallways until approximately noon.

Apologies for any inconvenience!

AR Management Office`,
    sent_at: '2026-05-03T09:30:00Z',
    read: false,
    category: 'announcement',
  },

  // David Chen — WM #4A
  {
    id: 'msg-dc-001',
    tenant_id: 'tenant-0005-0000-0000-000000000005',
    from_name: 'AR Management Office',
    subject: 'Move-in checklist — unit #4A',
    body: `Hi David,

Attached is your move-in checklist for unit #4A. Please review the condition of the unit and return the signed checklist within 5 business days. Your notes protect your security deposit, so be thorough!

Key items to check:
- Balcony door and lock
- Appliances (oven, dishwasher, refrigerator)
- Both bathrooms
- Kitchen fixtures

Reply to this message or drop the form at the office.

AR Management Office`,
    sent_at: '2025-11-01T09:00:00Z',
    read: true,
    category: 'lease',
  },
  {
    id: 'msg-dc-002',
    tenant_id: 'tenant-0005-0000-0000-000000000005',
    from_name: 'AR Management Office',
    subject: 'Payment receipt — December 2025 rent',
    body: `Hi David,

Your payment of $2,250.00 for December 2025 has been received.

Receipt: RCP-0501-0351
Amount: $2,250.00
Method: ACH transfer
Date: December 2, 2025

AR Management Office`,
    sent_at: '2025-12-02T14:00:00Z',
    read: true,
    category: 'payment',
  },
  {
    id: 'msg-dc-003',
    tenant_id: 'tenant-0005-0000-0000-000000000005',
    from_name: 'AR Management Office',
    subject: 'Balcony inspection reminder',
    body: `Hi David,

As part of our annual spring inspection, we'll be checking all fourth-floor balconies on May 12th. An inspector will visit between 10 AM and 12 PM.

If that time doesn't work, please reply and we'll reschedule.

AR Management Office`,
    sent_at: '2026-05-01T11:00:00Z',
    read: false,
    category: 'general',
  },

  // James Anderson — WM #2B
  {
    id: 'msg-ja-001',
    tenant_id: 'tenant-0006-0000-0000-000000000006',
    from_name: 'AR Management Office',
    subject: 'Welcome to Winnetka Manor!',
    body: `Dear James,

We're thrilled to welcome you to unit #2B starting December 1st. Your unit features hardwood floors and an updated kitchen — we think you'll love it.

Parking: spot #7. Laundry: lower level. Office hours: Mon–Fri, 9 AM – 5 PM.

AR Management Office`,
    sent_at: '2025-11-26T10:00:00Z',
    read: true,
    category: 'announcement',
  },
  {
    id: 'msg-ja-002',
    tenant_id: 'tenant-0006-0000-0000-000000000006',
    from_name: 'AR Management Office',
    subject: 'Payment receipt — January 2026 rent',
    body: `Hi James,

Your payment of $1,850.00 for January 2026 has been received.

Receipt: RCP-0601-0463
Amount: $1,850.00
Method: Card
Date: January 3, 2026

AR Management Office`,
    sent_at: '2026-01-03T13:00:00Z',
    read: true,
    category: 'payment',
  },
  {
    id: 'msg-ja-003',
    tenant_id: 'tenant-0006-0000-0000-000000000006',
    from_name: 'AR Management Office',
    subject: 'HVAC filter replacement — scheduled May 15',
    body: `Hi James,

As part of our seasonal maintenance, we'll be replacing the HVAC filters in all units on May 15th. A technician will visit unit #2B between 1–4 PM.

No action needed on your end — we have building access.

AR Management Office`,
    sent_at: '2026-05-02T10:00:00Z',
    read: false,
    category: 'maintenance',
  },
]

// ---------------------------------------------------------------------------
// Tenant Maintenance Requests
// ---------------------------------------------------------------------------

export const tenantRequests: TenantMaintenanceRequest[] = [
  // Sarah Jensen
  {
    id: 'tmr-sj-001',
    ref_id: 'ABJK2291',
    tenant_id: 'tenant-0001-0000-0000-000000000001',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #2A',
    issue_type: 'plumbing',
    urgency: 'normal',
    description: "The bathroom sink drains very slowly. I've tried plunging but it hasn't helped.",
    status: 'resolved',
    created_at: '2025-11-10T10:00:00Z',
    updated_at: '2025-11-14T15:00:00Z',
    manager_notes: 'Drain cleared by maintenance on Nov 14. Hair clog removed.',
  },
  {
    id: 'tmr-sj-002',
    ref_id: 'ABJK5584',
    tenant_id: 'tenant-0001-0000-0000-000000000001',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #2A',
    issue_type: 'hvac',
    urgency: 'high',
    description: "Heat not working — apartment is very cold. Thermostat shows 58°F and heating isn't kicking on.",
    status: 'in_progress',
    created_at: '2026-01-17T08:30:00Z',
    updated_at: '2026-01-17T12:00:00Z',
    manager_notes: 'HVAC technician dispatched. Parts on order for blower motor replacement.',
  },

  // Marcus Lee
  {
    id: 'tmr-ml-001',
    ref_id: 'BCDX4421',
    tenant_id: 'tenant-0002-0000-0000-000000000002',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #3B',
    issue_type: 'plumbing',
    urgency: 'normal',
    description: "Kitchen faucet is dripping constantly even when fully turned off. It's been going on for about a week.",
    status: 'acknowledged',
    created_at: '2026-04-28T09:00:00Z',
    updated_at: '2026-04-29T10:30:00Z',
    manager_notes: 'Plumber scheduled for May 7th between 10 AM–2 PM.',
  },
  {
    id: 'tmr-ml-002',
    ref_id: 'BCDX8812',
    tenant_id: 'tenant-0002-0000-0000-000000000002',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #3B',
    issue_type: 'electrical',
    urgency: 'high',
    description: 'Outlet in the living room near the TV sparks when I plug things in. Also the circuit breaker for that outlet trips frequently.',
    status: 'resolved',
    created_at: '2025-12-05T14:00:00Z',
    updated_at: '2025-12-07T16:00:00Z',
    manager_notes: 'Licensed electrician replaced faulty outlet and reset GFCI. All tested safe on Dec 7.',
  },

  // Emma Rodriguez
  {
    id: 'tmr-er-001',
    ref_id: 'CDEF3312',
    tenant_id: 'tenant-0003-0000-0000-000000000003',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #1D',
    issue_type: 'appliance',
    urgency: 'normal',
    description: 'Bathroom exhaust fan is very loud and vibrating. Makes a rattling noise during operation.',
    status: 'closed',
    created_at: '2026-02-20T11:00:00Z',
    updated_at: '2026-03-15T16:00:00Z',
    manager_notes: 'Fan replaced on March 15. New unit installed and tested.',
  },
  {
    id: 'tmr-er-002',
    ref_id: 'CDEF7765',
    tenant_id: 'tenant-0003-0000-0000-000000000003',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_label: 'Grass Lake Manor #1D',
    issue_type: 'pest',
    urgency: 'normal',
    description: 'Noticed a few ants near the kitchen window, particularly in the morning. Seems to be coming from the window sill area.',
    status: 'in_progress',
    created_at: '2026-04-10T09:30:00Z',
    updated_at: '2026-04-12T11:00:00Z',
    manager_notes: 'Pest control visited on April 12. Bait traps placed. Follow-up inspection in 2 weeks.',
  },

  // Priya Patel
  {
    id: 'tmr-pp-001',
    ref_id: 'DEFG1122',
    tenant_id: 'tenant-0004-0000-0000-000000000004',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_label: 'Winnetka Manor #1C',
    issue_type: 'locks',
    urgency: 'high',
    description: 'The deadbolt on my front door is very stiff and sometimes gets stuck. I was locked out briefly this morning.',
    status: 'resolved',
    created_at: '2026-02-03T08:00:00Z',
    updated_at: '2026-02-04T14:00:00Z',
    manager_notes: 'Locksmith rekeyed and lubricated deadbolt on Feb 4. New keys provided.',
  },
  {
    id: 'tmr-pp-002',
    ref_id: 'DEFG5588',
    tenant_id: 'tenant-0004-0000-0000-000000000004',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_label: 'Winnetka Manor #1C',
    issue_type: 'hvac',
    urgency: 'low',
    description: 'The radiator in the bedroom makes a loud banging sound when the heat first comes on each morning. Lasts about 5–10 minutes.',
    status: 'new',
    created_at: '2026-04-29T07:30:00Z',
    updated_at: '2026-04-29T07:30:00Z',
    manager_notes: null,
  },

  // David Chen
  {
    id: 'tmr-dc-001',
    ref_id: 'EFGH2244',
    tenant_id: 'tenant-0005-0000-0000-000000000005',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_label: 'Winnetka Manor #4A',
    issue_type: 'appliance',
    urgency: 'normal',
    description: 'Dishwasher is not cleaning dishes properly. Bottom rack items come out with food residue even after full cycle.',
    status: 'acknowledged',
    created_at: '2026-04-20T13:00:00Z',
    updated_at: '2026-04-21T10:00:00Z',
    manager_notes: 'Appliance repair scheduled for week of May 5th. Will confirm time.',
  },
  {
    id: 'tmr-dc-002',
    ref_id: 'EFGH6677',
    tenant_id: 'tenant-0005-0000-0000-000000000005',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_label: 'Winnetka Manor #4A',
    issue_type: 'other',
    urgency: 'low',
    description: 'Balcony sliding door handle is loose. The door slides fine but the handle wobbles when used.',
    status: 'new',
    created_at: '2026-05-02T11:00:00Z',
    updated_at: '2026-05-02T11:00:00Z',
    manager_notes: null,
  },

  // James Anderson
  {
    id: 'tmr-ja-001',
    ref_id: 'FGHJ3355',
    tenant_id: 'tenant-0006-0000-0000-000000000006',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_label: 'Winnetka Manor #2B',
    issue_type: 'electrical',
    urgency: 'normal',
    description: 'Kitchen overhead light flickers occasionally, especially when the microwave is running.',
    status: 'resolved',
    created_at: '2025-12-15T14:00:00Z',
    updated_at: '2025-12-20T15:00:00Z',
    manager_notes: 'Electrician replaced ballast and checked circuits on Dec 20. No further flickering observed.',
  },
  {
    id: 'tmr-ja-002',
    ref_id: 'FGHJ7799',
    tenant_id: 'tenant-0006-0000-0000-000000000006',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_label: 'Winnetka Manor #2B',
    issue_type: 'plumbing',
    urgency: 'normal',
    description: 'Water pressure in the shower is very low. Other faucets seem fine.',
    status: 'in_progress',
    created_at: '2026-04-25T09:00:00Z',
    updated_at: '2026-04-26T10:30:00Z',
    manager_notes: 'Plumber inspected on April 26. Showerhead replaced; monitoring water pressure.',
  },
]

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function findTenantByEmail(email: string): Tenant | null {
  return tenants.find((t) => t.email.toLowerCase() === email.toLowerCase()) ?? null
}

export function findTenantById(id: string): Tenant | null {
  return tenants.find((t) => t.id === id) ?? null
}

export function leaseForTenant(tenantId: string): Lease | null {
  return leases.find((l) => l.tenant_id === tenantId) ?? null
}

export function chargesForTenant(tenantId: string): Charge[] {
  return charges
    .filter((c) => c.tenant_id === tenantId)
    .sort((a, b) => b.due_date.localeCompare(a.due_date))
}

export function paymentsForTenant(tenantId: string): Payment[] {
  return payments
    .filter((p) => p.tenant_id === tenantId)
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
}

export function messagesForTenant(tenantId: string): Message[] {
  return messages
    .filter((m) => m.tenant_id === tenantId)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
}

export function requestsForTenant(tenantId: string): TenantMaintenanceRequest[] {
  return tenantRequests
    .filter((r) => r.tenant_id === tenantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
