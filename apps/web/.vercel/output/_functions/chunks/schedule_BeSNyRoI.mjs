import { c as createComponent } from './astro-component_Bs9c3G9N.mjs';
import { n as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_Dsa6HmE5.mjs';
import { $ as $$Base } from './Base_CPEnyyob.mjs';
import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { S as ShowingRequestInputSchema, s as supabase, c as clientEnv } from './supabase_CPRhLCrz.mjs';
import { createClient } from '@supabase/supabase-js';
import { T as TurnstileWidget } from './TurnstileWidget_D9EB_llS.mjs';

function ShowingForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings, initialUnitId, initialBuildingId }) {
  const supabase = createClient(supabaseUrl, anonKey);
  const [buildingId, setBuildingId] = useState(initialBuildingId);
  const [slots, setSlots] = useState([]);
  const [slotId, setSlotId] = useState(null);
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [d3, setD3] = useState("");
  const [turnstile, setTurnstile] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState(null);
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm({
    resolver: zodResolver(ShowingRequestInputSchema),
    defaultValues: {
      source: "web",
      building_id: initialBuildingId ?? "",
      unit_id: initialUnitId,
      slot_id: null,
      preferred_dates: null,
      turnstile_token: ""
    }
  });
  useEffect(() => {
    if (!buildingId) {
      setSlots([]);
      return;
    }
    supabase.from("availability_slots").select("id, starts_at, ends_at").eq("building_id", buildingId).eq("status", "open").gt("starts_at", (/* @__PURE__ */ new Date()).toISOString()).order("starts_at").then(({ data }) => setSlots(data ?? []));
  }, [buildingId]);
  useEffect(() => {
    if (turnstile) setValue("turnstile_token", turnstile);
  }, [turnstile, setValue]);
  async function onSubmit(values) {
    setError(null);
    const dates = [d1, d2, d3].filter(Boolean);
    const { turnstile_token, ...payload } = values;
    const finalPayload = {
      ...payload,
      building_id: buildingId,
      unit_id: initialUnitId,
      slot_id: slotId,
      preferred_dates: slotId ? null : dates
    };
    const { data, error: err } = await supabase.from("showing_requests").insert(finalPayload).select("ref_id").single();
    if (err) {
      setError(err.message);
      return;
    }
    setSubmitted({ ref_id: data.ref_id });
  }
  if (submitted) {
    return /* @__PURE__ */ jsxs("div", { className: "border border-green-300 bg-green-50 rounded-xl p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold text-green-900", children: "Showing request received" }),
      /* @__PURE__ */ jsxs("p", { className: "mt-2 text-green-900", children: [
        "Reference: ",
        /* @__PURE__ */ jsx("strong", { children: submitted.ref_id }),
        ". We'll confirm a time within one business day."
      ] })
    ] });
  }
  const inputCls = "block w-full border border-gray-300 rounded px-3 py-2";
  const labelCls = "block text-sm font-medium mt-4 mb-1";
  return /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit(onSubmit), className: "space-y-2", children: [
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Building" }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: buildings.map((b) => /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => {
          setBuildingId(b.id);
          setValue("building_id", b.id);
        },
        className: `px-3 py-1.5 rounded border ${buildingId === b.id ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]" : "border-gray-300"}`,
        children: b.name
      },
      b.id
    )) }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Pick a slot" }),
    slots.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500", children: "No published slots — propose preferred dates below." }) : /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: slots.map((s) => {
      const t = new Date(s.starts_at);
      const label = t.toLocaleString(void 0, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const active = slotId === s.id;
      return /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => {
            setSlotId(s.id);
            setValue("slot_id", s.id);
            setValue("preferred_dates", null);
          },
          className: `px-3 py-1.5 rounded border ${active ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]" : "border-gray-300"}`,
          children: label
        },
        s.id
      );
    }) }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "…or propose up to 3 preferred dates" }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsx("input", { type: "date", value: d1, onChange: (e) => setD1(e.target.value), className: inputCls + " max-w-[160px]" }),
      /* @__PURE__ */ jsx("input", { type: "date", value: d2, onChange: (e) => setD2(e.target.value), className: inputCls + " max-w-[160px]" }),
      /* @__PURE__ */ jsx("input", { type: "date", value: d3, onChange: (e) => setD3(e.target.value), className: inputCls + " max-w-[160px]" })
    ] }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Your name" }),
    /* @__PURE__ */ jsx("input", { ...register("prospect_name"), className: inputCls }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Email" }),
    /* @__PURE__ */ jsx("input", { ...register("prospect_email"), type: "email", className: inputCls }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Phone (optional)" }),
    /* @__PURE__ */ jsx("input", { ...register("prospect_phone"), type: "tel", className: inputCls }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Message (optional)" }),
    /* @__PURE__ */ jsx("textarea", { ...register("message"), rows: 3, className: inputCls }),
    /* @__PURE__ */ jsx(TurnstileWidget, { siteKey: turnstileSiteKey, onToken: setTurnstile }),
    error && /* @__PURE__ */ jsx("p", { className: "text-sm text-red-600", children: error }),
    /* @__PURE__ */ jsx("button", { type: "submit", disabled: isSubmitting, className: "mt-4 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400", children: isSubmitting ? "Submitting…" : "Request showing" })
  ] });
}

const prerender = false;
const $$Schedule = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Schedule;
  const unitId = Astro2.url.searchParams.get("unit");
  const { data: _buildings } = await supabase.from("buildings").select("id, name").eq("is_published", true).order("name");
  const buildings = _buildings ?? [];
  let initialBuildingId = null;
  if (unitId) {
    const { data: u } = await supabase.from("units").select("building_id").eq("id", unitId).maybeSingle();
    initialBuildingId = u?.building_id ?? null;
  }
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Schedule a showing", "description": "Pick a tour time at Grass Lake Manor or Winnetka Manor." }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="max-w-2xl mx-auto px-4 py-10"> <h1 class="text-3xl font-bold">Schedule a showing</h1> <p class="mt-2 text-gray-600">Tell us when you'd like to see the apartment.</p> <div class="mt-6"> ${renderComponent($$result2, "ShowingForm", ShowingForm, { "client:load": true, "supabaseUrl": clientEnv.VITE_SUPABASE_URL, "anonKey": clientEnv.VITE_SUPABASE_ANON_KEY, "turnstileSiteKey": clientEnv.VITE_TURNSTILE_SITE_KEY, "buildings": buildings, "initialUnitId": unitId, "initialBuildingId": initialBuildingId, "client:component-hydration": "load", "client:component-path": "/home/mocap/AR_management/apps/web/src/components/islands/ShowingForm", "client:component-export": "ShowingForm" })} </div> </section> ` })}`;
}, "/home/mocap/AR_management/apps/web/src/pages/schedule.astro", void 0);

const $$file = "/home/mocap/AR_management/apps/web/src/pages/schedule.astro";
const $$url = "/schedule";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Schedule,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
