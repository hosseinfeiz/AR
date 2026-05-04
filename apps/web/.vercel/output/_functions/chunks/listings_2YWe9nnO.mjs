import { c as createComponent } from './astro-component_Bs9c3G9N.mjs';
import { m as maybeRenderHead, h as addAttribute, r as renderTemplate, n as renderComponent } from './entrypoint_Dsa6HmE5.mjs';
import { $ as $$Base } from './Base_CPEnyyob.mjs';
import { s as supabase } from './supabase_CPRhLCrz.mjs';

const $$UnitCard = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$UnitCard;
  const { u } = Astro2.props;
  const beds = u.bedrooms === 0 ? "Studio" : `${u.bedrooms} bd`;
  const rent = `$${(u.monthly_rent_cents / 100).toLocaleString()}`;
  return renderTemplate`${maybeRenderHead()}<a${addAttribute(`/units/${u.id}`, "href")} class="block border border-gray-200 rounded-xl p-5 hover:border-[var(--color-brand)] transition"> <div class="flex items-baseline justify-between"> <h3 class="text-lg font-semibold">Unit ${u.unit_number}</h3> <span class="text-lg font-bold">${rent}<span class="text-sm font-normal text-gray-500">/mo</span></span> </div> ${u.building && renderTemplate`<p class="text-sm text-gray-500">${u.building.name}</p>`} <p class="text-sm text-gray-700 mt-2">${beds} · ${u.bathrooms} ba${u.sqft ? ` · ${u.sqft} sqft` : ""}</p> ${u.available_from && renderTemplate`<p class="text-xs text-gray-500 mt-2">Available ${u.available_from}</p>`} </a>`;
}, "/home/mocap/AR_management/apps/web/src/components/UnitCard.astro", void 0);

const prerender = false;
const $$Listings = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Listings;
  const buildingFilter = Astro2.url.searchParams.get("building") ?? null;
  const bedsFilter = Astro2.url.searchParams.get("bedrooms");
  const maxRent = Astro2.url.searchParams.get("max_rent");
  let q = supabase.from("units").select("id, unit_number, bedrooms, bathrooms, sqft, monthly_rent_cents, available_from, building:buildings(name, slug, id)").in("status", ["available", "coming_soon"]).order("monthly_rent_cents");
  if (buildingFilter) q = q.eq("buildings.slug", buildingFilter);
  if (bedsFilter !== null && bedsFilter !== "") q = q.eq("bedrooms", Number(bedsFilter));
  if (maxRent) q = q.lte("monthly_rent_cents", Number(maxRent) * 100);
  const { data: unitsData } = await q;
  const units = (unitsData ?? []).map((u) => ({
    ...u,
    building: Array.isArray(u.building) ? u.building[0] : u.building
  }));
  const { data: buildingsData } = await supabase.from("buildings").select("id, slug, name").eq("is_published", true).order("name");
  const buildings = buildingsData ?? [];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Available apartments", "description": "Browse all available apartments at Grass Lake Manor and Winnetka Manor." }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="max-w-5xl mx-auto px-4 py-10"> <h1 class="text-3xl font-bold">Available apartments</h1> <form method="get" class="flex flex-wrap gap-3 mt-4"> <select name="building" class="border rounded px-3 py-1.5"> <option value="">All buildings</option> ${buildings.map((b) => renderTemplate`<option${addAttribute(b.slug, "value")}${addAttribute(buildingFilter === b.slug, "selected")}>${b.name}</option>`)} </select> <select name="bedrooms" class="border rounded px-3 py-1.5"> <option value="">Any beds</option> <option value="0"${addAttribute(bedsFilter === "0", "selected")}>Studio</option> <option value="1"${addAttribute(bedsFilter === "1", "selected")}>1 bd</option> <option value="2"${addAttribute(bedsFilter === "2", "selected")}>2 bd</option> <option value="3"${addAttribute(bedsFilter === "3", "selected")}>3+ bd</option> </select> <input type="number" name="max_rent" placeholder="Max rent ($)"${addAttribute(maxRent ?? "", "value")} class="border rounded px-3 py-1.5 w-32"> <button type="submit" class="bg-[var(--color-brand)] text-white px-3 py-1.5 rounded">Filter</button> <a href="/listings" class="text-sm text-gray-500 self-center">Clear</a> </form> </section> <section class="max-w-5xl mx-auto px-4 pb-12"> ${units.length === 0 ? renderTemplate`<p class="text-gray-600">No units match your filters.</p>` : renderTemplate`<div class="grid sm:grid-cols-2 gap-4">${units.map((u) => renderTemplate`${renderComponent($$result2, "UnitCard", $$UnitCard, { "u": u })}`)}</div>`} </section> ` })}`;
}, "/home/mocap/AR_management/apps/web/src/pages/listings.astro", void 0);

const $$file = "/home/mocap/AR_management/apps/web/src/pages/listings.astro";
const $$url = "/listings";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Listings,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
