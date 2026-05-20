// Single data-access layer used by all .astro pages.
//
// Three modes:
//   1. Mock mode      — PUBLIC_SUPABASE_URL not set / placeholder. Always returns fixtures.
//   2. Real mode      — Supabase URL set, schema present. Returns DB rows.
//   3. Degraded mode  — Supabase URL set, query errors (no schema yet, network down, RLS misconfig).
//                       Falls back to fixtures, logs a warning. Site stays up.
//
// Mode 3 means "set the env var, run migrations later" — site never crashes.

import { supabase } from './supabase'
import { buildings as fixBuildings, units as fixUnits, isMockMode, type FixtureBuilding, type FixtureUnit } from './fixtures'
import { logger } from './logger'

export type Building = FixtureBuilding
export type Unit = FixtureUnit

// Explicit column lists used by Supabase .select() calls.
// Kept in sync with FixtureBuilding / FixtureUnit so the returned rows match
// the typed shape exactly (no payload-bloating SELECT * over the wire).
const BUILDING_COLS =
  'id, slug, name, address_line1, address_line2, city, state, postal_code, country, ' +
  'description_md, neighborhood_md, amenities, contact_phone, contact_email, ' +
  'seo_title, seo_description, is_published'

const UNIT_COLS =
  'id, building_id, unit_number, bedrooms, bathrooms, sqft, monthly_rent_cents, ' +
  'available_from, status, description_md'

function warnFallback(method: string, err: unknown) {
  const msg = (err as { message?: string })?.message ?? String(err)
  logger.warn('data: Supabase query failed; falling back to fixtures', { method, reason: msg })
}

export async function listBuildings(): Promise<Building[]> {
  if (isMockMode()) return fixBuildings.filter((b) => b.is_published)
  try {
    const { data, error } = await supabase
      .from('buildings')
      .select('id, slug, name, address_line1, address_line2, city, state, postal_code, country, contact_phone, contact_email')
      .eq('is_published', true)
      .order('name')
    if (error) throw error
    if (!data || data.length === 0) return fixBuildings.filter((b) => b.is_published)
    return data as Building[]
  } catch (e) {
    warnFallback('listBuildings', e)
    return fixBuildings.filter((b) => b.is_published)
  }
}

export async function getBuildingBySlug(slug: string): Promise<Building | null> {
  const fallback = () => fixBuildings.find((b) => b.slug === slug && b.is_published) ?? null
  if (isMockMode()) return fallback()
  try {
    const { data, error } = await supabase
      .from('buildings')
      .select(`${BUILDING_COLS}, building_photos(storage_path, alt_text, sort_order)`)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()
    if (error) throw error
    return (data as Building | null) ?? fallback()
  } catch (e) {
    warnFallback('getBuildingBySlug', e)
    return fallback()
  }
}

interface UnitFilters {
  building_id?: string
  building_slug?: string
  bedrooms?: number
  max_rent_cents?: number
}

function filterFixtureUnits(filters: UnitFilters): Unit[] {
  let units = fixUnits.filter((u) => u.status === 'available' || u.status === 'coming_soon')
  if (filters.building_id) units = units.filter((u) => u.building_id === filters.building_id)
  if (filters.building_slug) {
    const b = fixBuildings.find((x) => x.slug === filters.building_slug)
    if (b) units = units.filter((u) => u.building_id === b.id); else units = []
  }
  if (typeof filters.bedrooms === 'number') {
    units = filters.bedrooms === 3
      ? units.filter((u) => u.bedrooms >= 3)
      : units.filter((u) => u.bedrooms === filters.bedrooms)
  }
  if (filters.max_rent_cents) units = units.filter((u) => u.monthly_rent_cents <= filters.max_rent_cents!)
  units = units.sort((a, b) => a.monthly_rent_cents - b.monthly_rent_cents)
  return units.map((u) => ({ ...u, building: fixBuildings.find((b) => b.id === u.building_id) }))
}

export async function listAvailableUnits(filters: UnitFilters = {}): Promise<Unit[]> {
  if (isMockMode()) return filterFixtureUnits(filters)
  try {
    let q = supabase
      .from('units')
      .select('id, unit_number, bedrooms, bathrooms, sqft, monthly_rent_cents, available_from, status, building:buildings(id, name, slug)')
      .in('status', ['available', 'coming_soon'])
      .order('monthly_rent_cents')
    if (filters.building_id) q = q.eq('building_id', filters.building_id)
    if (filters.building_slug) q = q.eq('buildings.slug', filters.building_slug)
    if (typeof filters.bedrooms === 'number') {
      q = filters.bedrooms === 3 ? q.gte('bedrooms', 3) : q.eq('bedrooms', filters.bedrooms)
    }
    if (filters.max_rent_cents) q = q.lte('monthly_rent_cents', filters.max_rent_cents)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) return filterFixtureUnits(filters)
    return data.map((u: any) => ({
      ...u,
      building: Array.isArray(u.building) ? u.building[0] : u.building,
    })) as Unit[]
  } catch (e) {
    warnFallback('listAvailableUnits', e)
    return filterFixtureUnits(filters)
  }
}

export async function getUnitById(id: string): Promise<Unit | null> {
  const fallback = (): Unit | null => {
    const u = fixUnits.find((x) => x.id === id)
    if (!u) return null
    return { ...u, building: fixBuildings.find((b) => b.id === u.building_id) }
  }
  if (isMockMode()) return fallback()
  try {
    const { data, error } = await supabase
      .from('units')
      .select(
        `${UNIT_COLS}, unit_photos(storage_path, alt_text, sort_order), building:buildings(${BUILDING_COLS})`,
      )
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return fallback()
    const normalized: any = { ...data, building: Array.isArray((data as any).building) ? (data as any).building[0] : (data as any).building }
    return normalized as Unit
  } catch (e) {
    warnFallback('getUnitById', e)
    return fallback()
  }
}

export async function checkDbHealth(): Promise<{ ok: boolean; error?: string; mock?: boolean; degraded?: boolean }> {
  if (isMockMode()) return { ok: true, mock: true }
  try {
    const { error } = await supabase.from('buildings').select('id').limit(1)
    if (error) throw error
    return { ok: true }
  } catch (e) {
    // env says real Supabase but query fails — degraded mode (site falls back to fixtures)
    return { ok: false, degraded: true, error: (e as Error).message }
  }
}
