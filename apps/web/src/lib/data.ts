// Single data-access layer used by all .astro pages.
// In dev mock mode (no PUBLIC_SUPABASE_URL), returns fixtures so the UI renders end-to-end.
// In real mode, hits Supabase via the anon client.

import { supabase } from './supabase'
import { buildings as fixBuildings, units as fixUnits, isMockMode, type FixtureBuilding, type FixtureUnit } from './fixtures'

export type Building = FixtureBuilding
export type Unit = FixtureUnit

export async function listBuildings(): Promise<Building[]> {
  if (isMockMode()) return fixBuildings.filter((b) => b.is_published)
  const { data } = await supabase
    .from('buildings')
    .select('id, slug, name, address_line1, address_line2, city, state, postal_code, country, contact_phone, contact_email')
    .eq('is_published', true)
    .order('name')
  return (data ?? []) as Building[]
}

export async function getBuildingBySlug(slug: string): Promise<Building | null> {
  if (isMockMode()) return fixBuildings.find((b) => b.slug === slug && b.is_published) ?? null
  const { data } = await supabase
    .from('buildings')
    .select('*, building_photos(storage_path, alt_text, sort_order)')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()
  return data as Building | null
}

interface UnitFilters {
  building_id?: string
  building_slug?: string
  bedrooms?: number
  max_rent_cents?: number
}

export async function listAvailableUnits(filters: UnitFilters = {}): Promise<Unit[]> {
  if (isMockMode()) {
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
  const { data } = await q
  // Normalize Supabase array-join to single building object
  return (data ?? []).map((u: any) => ({
    ...u,
    building: Array.isArray(u.building) ? u.building[0] : u.building,
  })) as Unit[]
}

export async function getUnitById(id: string): Promise<Unit | null> {
  if (isMockMode()) {
    const u = fixUnits.find((x) => x.id === id)
    if (!u) return null
    return { ...u, building: fixBuildings.find((b) => b.id === u.building_id) }
  }
  const { data } = await supabase
    .from('units')
    .select('*, unit_photos(storage_path, alt_text, sort_order), building:buildings(*)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const normalized: any = { ...data, building: Array.isArray((data as any).building) ? (data as any).building[0] : (data as any).building }
  return normalized as Unit
}

export async function checkDbHealth(): Promise<{ ok: boolean; error?: string; mock?: boolean }> {
  if (isMockMode()) return { ok: true, mock: true }
  try {
    const { error } = await supabase.from('buildings').select('id').limit(1)
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
