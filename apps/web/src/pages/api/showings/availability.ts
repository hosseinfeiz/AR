// GET /api/showings/availability?building_id=...&from=ISO&to=ISO
//
// Returns an array of 30-minute slots covering the window, each tagged:
//   - 'open'    — nothing booked, no published `blocked` slot, no Google busy overlap
//   - 'booked'  — there's a corresponding `availability_slots` row with status=booked
//                 OR a confirmed showing_requests.scheduled_at falling inside the window
//   - 'blocked' — `availability_slots` with status=blocked
//
// The Google free/busy check is best-effort. If no manager has connected a calendar
// yet, or the Google API errors, we degrade gracefully and only consider DB state.
//
// No auth required — this drives the public picker.

import type { APIRoute } from 'astro'
import { getAdminClient } from '../../../lib/supabase-admin'
import { freeBusy, isSlotBusy, refreshAccessToken } from '../../../lib/google-calendar'

export const prerender = false

interface SlotOut {
  start: string
  end: string
  status: 'open' | 'booked' | 'blocked'
}

const SLOT_MINUTES = 30
const MIN_HOUR_LOCAL = 9
const MAX_HOUR_LOCAL = 18

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

function buildSlotGrid(from: Date, to: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = []
  const cur = new Date(from)
  // Snap to next half-hour.
  cur.setUTCSeconds(0, 0)
  const m = cur.getUTCMinutes()
  if (m % SLOT_MINUTES !== 0) {
    cur.setUTCMinutes(m + (SLOT_MINUTES - (m % SLOT_MINUTES)))
  }
  while (cur < to) {
    const end = new Date(cur.getTime() + SLOT_MINUTES * 60 * 1000)
    if (end > to) break
    // Restrict to business hours in viewer's local-UTC bracket (rough heuristic).
    const hour = cur.getUTCHours()
    if (hour >= MIN_HOUR_LOCAL && hour < MAX_HOUR_LOCAL) {
      out.push({ start: new Date(cur), end })
    }
    cur.setTime(cur.getTime() + SLOT_MINUTES * 60 * 1000)
  }
  return out
}

export const GET: APIRoute = async ({ url, locals }) => {
  const buildingId = url.searchParams.get('building_id')
  const fromStr = url.searchParams.get('from')
  const toStr = url.searchParams.get('to')

  if (!buildingId || !fromStr || !toStr) {
    return new Response(
      JSON.stringify({ error: 'building_id, from, to required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return new Response(
      JSON.stringify({ error: 'Invalid from/to' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
  // Cap window at 60 days to avoid expensive queries.
  if (to.getTime() - from.getTime() > 60 * 24 * 60 * 60 * 1000) {
    return new Response(
      JSON.stringify({ error: 'Window exceeds 60 days' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const env = envFor(locals)
  const grid = buildSlotGrid(from, to)

  // Load published availability_slots + scheduled showings inside the window.
  let dbSlots: { starts_at: string; ends_at: string; status: string }[] = []
  let bookedScheduled: { scheduled_at: string }[] = []

  try {
    const admin = getAdminClient()
    const [slotsRes, showingsRes] = await Promise.all([
      admin
        .from('availability_slots')
        .select('starts_at, ends_at, status')
        .eq('building_id', buildingId)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString()),
      admin
        .from('showing_requests')
        .select('scheduled_at')
        .eq('building_id', buildingId)
        .eq('status', 'scheduled')
        .gte('scheduled_at', from.toISOString())
        .lt('scheduled_at', to.toISOString()),
    ])
    dbSlots = (slotsRes.data ?? []) as typeof dbSlots
    bookedScheduled = (showingsRes.data ?? []) as typeof bookedScheduled
  } catch (e) {
    // Degraded mode — Supabase not reachable. We still serve the grid as 'open'.
    // eslint-disable-next-line no-console
    console.warn('[availability] Supabase fetch failed; returning empty grid', (e as Error).message)
  }

  // Optional Google free/busy: any manager-connected calendar acts as a global busy filter.
  let busyWindows: { start: string; end: string }[] = []
  try {
    const admin = getAdminClient()
    const { data: conns } = await admin
      .from('manager_calendar_connections')
      .select('google_refresh_token, calendar_id')
      .limit(5)
    for (const conn of conns ?? []) {
      try {
        const { access_token } = await refreshAccessToken(conn.google_refresh_token as string, env)
        const busy = await freeBusy({
          accessToken: access_token,
          calendarId: (conn.calendar_id as string) || 'primary',
          from: from.toISOString(),
          to: to.toISOString(),
        })
        busyWindows.push(...busy)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[availability] Google freeBusy failed for one connection', (e as Error).message)
      }
    }
  } catch {
    // No connections table or no admin client — skip.
  }

  const out: SlotOut[] = grid.map(({ start, end }) => {
    // 1. Look at availability_slots first.
    const match = dbSlots.find((s) => s.starts_at === start.toISOString())
    if (match) {
      const status = match.status === 'blocked' ? 'blocked' : match.status === 'booked' ? 'booked' : 'open'
      return { start: start.toISOString(), end: end.toISOString(), status }
    }
    // 2. Already-scheduled showing in this slot?
    const bookedHere = bookedScheduled.some((b) => {
      const ts = Date.parse(b.scheduled_at)
      return ts >= start.getTime() && ts < end.getTime()
    })
    if (bookedHere) return { start: start.toISOString(), end: end.toISOString(), status: 'booked' }
    // 3. Google busy?
    if (isSlotBusy(start, end, busyWindows)) {
      return { start: start.toISOString(), end: end.toISOString(), status: 'booked' }
    }
    return { start: start.toISOString(), end: end.toISOString(), status: 'open' }
  })

  return new Response(JSON.stringify({ slots: out }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
