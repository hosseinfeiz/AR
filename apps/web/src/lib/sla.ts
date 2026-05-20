// SLA tracking helpers for maintenance requests.
//
// Three milestones are tracked per request:
//   - acknowledge: manager has seen the request
//   - start:       a vendor has been dispatched / work begun
//   - complete:    request marked resolved
//
// Thresholds (per urgency level):
//   emergency: 30 min ack /   4 hr start /  24 hr complete
//   high     :  4 hr ack  /  24 hr start /  72 hr complete
//   normal   : 24 hr ack  /   5 d start  /  14 d complete
//   low      :  7 d ack   /  14 d start  /  30 d complete
//
// Status buckets (per milestone):
//   on-track : milestone met OR not yet due
//   warning  : within 25% of deadline still unmet
//   breached : deadline passed and milestone unmet

export type Urgency = 'low' | 'normal' | 'high' | 'emergency'
export type SlaBucket = 'on-track' | 'warning' | 'breached'
export type SlaMilestone = 'ack' | 'start' | 'complete'

export interface SlaThresholds {
  ack_minutes: number
  start_minutes: number
  complete_minutes: number
}

const MIN = 1
const HOUR = 60
const DAY = 24 * HOUR

export const SLA_THRESHOLDS: Record<Urgency, SlaThresholds> = {
  emergency: { ack_minutes: 30 * MIN, start_minutes: 4 * HOUR,  complete_minutes: 24 * HOUR },
  high     : { ack_minutes: 4 * HOUR, start_minutes: 24 * HOUR, complete_minutes: 72 * HOUR },
  normal   : { ack_minutes: 24 * HOUR, start_minutes: 5 * DAY,   complete_minutes: 14 * DAY },
  low      : { ack_minutes: 7 * DAY,   start_minutes: 14 * DAY,  complete_minutes: 30 * DAY },
}

export interface SlaInput {
  urgency: Urgency
  created_at: string | Date
  acknowledged_at?: string | Date | null
  vendor_assigned_at?: string | Date | null
  started_at?: string | Date | null
  completed_at?: string | Date | null
  resolved_at?: string | Date | null // alias: maintenance_requests.updated_at when status=resolved
  now?: Date
}

export interface SlaMilestoneStatus {
  bucket: SlaBucket
  deadline_at: Date
  met_at: Date | null
  remaining_minutes: number // negative if past deadline
}

export interface SlaStatus {
  ack: SlaMilestoneStatus
  start: SlaMilestoneStatus
  complete: SlaMilestoneStatus
  overall: SlaBucket
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

function diffMinutes(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60000
}

/**
 * Bucketise a single milestone given its deadline and (optional) completion timestamp.
 * "warning" triggers when ≥75% of the budget elapsed and milestone still unmet.
 */
function bucketise(
  deadline: Date,
  metAt: Date | null,
  createdAt: Date,
  now: Date,
): { bucket: SlaBucket; remaining_minutes: number } {
  const totalBudget = diffMinutes(deadline, createdAt)
  const remaining = diffMinutes(deadline, now)

  if (metAt && metAt <= deadline) {
    return { bucket: 'on-track', remaining_minutes: remaining }
  }
  if (metAt && metAt > deadline) {
    return { bucket: 'breached', remaining_minutes: diffMinutes(deadline, metAt) }
  }
  // Not yet met
  if (now > deadline) {
    return { bucket: 'breached', remaining_minutes: remaining }
  }
  const elapsed = totalBudget - remaining
  const elapsedFraction = totalBudget > 0 ? elapsed / totalBudget : 1
  if (elapsedFraction >= 0.75) {
    return { bucket: 'warning', remaining_minutes: remaining }
  }
  return { bucket: 'on-track', remaining_minutes: remaining }
}

function worst(a: SlaBucket, b: SlaBucket): SlaBucket {
  const rank: Record<SlaBucket, number> = { 'on-track': 0, warning: 1, breached: 2 }
  return rank[a] >= rank[b] ? a : b
}

export function computeSla(input: SlaInput): SlaStatus {
  const created = toDate(input.created_at) ?? new Date()
  const now = input.now ?? new Date()
  const t = SLA_THRESHOLDS[input.urgency]

  const ackDeadline = new Date(created.getTime() + t.ack_minutes * 60000)
  const startDeadline = new Date(created.getTime() + t.start_minutes * 60000)
  const completeDeadline = new Date(created.getTime() + t.complete_minutes * 60000)

  const ackMet      = toDate(input.acknowledged_at)
  const startMet    = toDate(input.started_at) ?? toDate(input.vendor_assigned_at)
  const completeMet = toDate(input.completed_at) ?? toDate(input.resolved_at)

  const ack = (() => {
    const b = bucketise(ackDeadline, ackMet, created, now)
    return { bucket: b.bucket, deadline_at: ackDeadline, met_at: ackMet, remaining_minutes: b.remaining_minutes }
  })()
  const start = (() => {
    const b = bucketise(startDeadline, startMet, created, now)
    return { bucket: b.bucket, deadline_at: startDeadline, met_at: startMet, remaining_minutes: b.remaining_minutes }
  })()
  const complete = (() => {
    const b = bucketise(completeDeadline, completeMet, created, now)
    return { bucket: b.bucket, deadline_at: completeDeadline, met_at: completeMet, remaining_minutes: b.remaining_minutes }
  })()

  return { ack, start, complete, overall: worst(worst(ack.bucket, start.bucket), complete.bucket) }
}

export function bucketColor(bucket: SlaBucket): string {
  switch (bucket) {
    case 'on-track': return 'bg-green-100 text-green-800'
    case 'warning':  return 'bg-amber-100 text-amber-800'
    case 'breached': return 'bg-red-100 text-red-800'
  }
}

export function bucketLabel(bucket: SlaBucket): string {
  switch (bucket) {
    case 'on-track': return 'On track'
    case 'warning':  return 'Warning'
    case 'breached': return 'Breached'
  }
}

/**
 * Human-readable countdown ("3 h", "12 m", "2 d 4 h", or "overdue 1 d").
 */
export function formatRemaining(minutes: number): string {
  const abs = Math.abs(minutes)
  const days = Math.floor(abs / (24 * 60))
  const hours = Math.floor((abs % (24 * 60)) / 60)
  const mins = Math.floor(abs % 60)
  let label: string
  if (days > 0) label = `${days}d ${hours}h`
  else if (hours > 0) label = `${hours}h ${mins}m`
  else label = `${mins}m`
  return minutes >= 0 ? label : `overdue ${label}`
}
