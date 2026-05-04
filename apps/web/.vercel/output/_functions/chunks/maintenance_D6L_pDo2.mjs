import { c as createComponent } from './astro-component_Bs9c3G9N.mjs';
import { n as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_Dsa6HmE5.mjs';
import { $ as $$Base } from './Base_CPEnyyob.mjs';
import { jsxs, jsx } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { M as MaintenanceRequestInputSchema, s as supabase, c as clientEnv } from './supabase_CPRhLCrz.mjs';
import { createClient } from '@supabase/supabase-js';
import { T as TurnstileWidget } from './TurnstileWidget_D9EB_llS.mjs';

function PhotoUploader({ supabaseUrl, anonKey, turnstileToken, onPathsChange }) {
  const [files, setFiles] = useState([]);
  const [paths, setPaths] = useState([]);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  function handlePick(e) {
    const picked = Array.from(e.target.files ?? []).slice(0, 5);
    const oversize = picked.find((f) => f.size > 10 * 1024 * 1024);
    if (oversize) {
      setError(`${oversize.name} exceeds 10 MB limit`);
      return;
    }
    setError(null);
    setFiles(picked);
  }
  async function handleUpload() {
    if (!turnstileToken) {
      setError("Please complete the captcha first");
      return;
    }
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const ct = files[0].type;
      const r = await fetch(`${supabaseUrl}/functions/v1/request-upload-urls`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ count: files.length, content_type: ct, turnstile_token: turnstileToken })
      });
      if (!r.ok) throw new Error(`server: ${await r.text()}`);
      const data = await r.json();
      for (let i = 0; i < files.length; i++) {
        const u = data.uploads[i];
        const put = await fetch(u.signedUrl, { method: "PUT", body: files[i], headers: { "content-type": files[i].type, "x-upsert": "false" } });
        if (!put.ok) throw new Error(`upload ${i + 1} failed`);
      }
      const finalPaths = data.uploads.map((u) => u.path);
      setPaths(finalPaths);
      onPathsChange(finalPaths);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, onChange: handlePick, className: "block text-sm" }),
    /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500 mt-1", children: "Up to 5 photos, JPEG/PNG/WebP, 10 MB each." }),
    files.length > 0 && paths.length === 0 && /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: handleUpload,
        disabled: uploading || !turnstileToken,
        className: "mt-2 px-3 py-1.5 bg-[var(--color-brand)] text-white rounded text-sm disabled:bg-gray-400",
        children: uploading ? "Uploading…" : `Upload ${files.length} photo${files.length === 1 ? "" : "s"}`
      }
    ),
    paths.length > 0 && /* @__PURE__ */ jsxs("p", { className: "text-sm text-green-700 mt-2", children: [
      paths.length,
      " photo",
      paths.length === 1 ? "" : "s",
      " uploaded"
    ] }),
    error && /* @__PURE__ */ jsx("p", { className: "text-sm text-red-600 mt-2", children: error })
  ] });
}

function MaintenanceForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings }) {
  const supabase = createClient(supabaseUrl, anonKey);
  const [turnstile, setTurnstile] = useState(null);
  const [photoPaths, setPhotoPaths] = useState([]);
  const [submitted, setSubmitted] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch } = useForm({
    resolver: zodResolver(MaintenanceRequestInputSchema),
    defaultValues: { source: "web", photo_paths: [], turnstile_token: "" }
  });
  useEffect(() => {
    setValue("photo_paths", photoPaths);
  }, [photoPaths, setValue]);
  useEffect(() => {
    if (turnstile) setValue("turnstile_token", turnstile);
  }, [turnstile, setValue]);
  const buildingId = watch("building_id");
  const urgency = watch("urgency");
  async function onSubmit(values) {
    setSubmitError(null);
    const { turnstile_token, ...payload } = values;
    const { data, error } = await supabase.from("maintenance_requests").insert(payload).select("ref_id").single();
    if (error) {
      setSubmitError(error.message);
      return;
    }
    setSubmitted({ ref_id: data.ref_id });
  }
  if (submitted) {
    return /* @__PURE__ */ jsxs("div", { className: "border border-green-300 bg-green-50 rounded-xl p-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold text-green-900", children: "Request received" }),
      /* @__PURE__ */ jsxs("p", { className: "mt-2 text-green-900", children: [
        "Reference: ",
        /* @__PURE__ */ jsx("strong", { children: submitted.ref_id }),
        ". A property manager will follow up within one business day."
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
        onClick: () => setValue("building_id", b.id, { shouldValidate: true }),
        className: `px-3 py-1.5 rounded border ${buildingId === b.id ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]" : "border-gray-300"}`,
        children: b.name
      },
      b.id
    )) }),
    errors.building_id && /* @__PURE__ */ jsx("p", { className: "text-sm text-red-600", children: "Pick a building" }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Unit number" }),
    /* @__PURE__ */ jsx("input", { ...register("unit_number"), placeholder: "e.g. 3B", className: inputCls }),
    errors.unit_number && /* @__PURE__ */ jsx("p", { className: "text-sm text-red-600", children: errors.unit_number.message }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Your name" }),
    /* @__PURE__ */ jsx("input", { ...register("tenant_name"), className: inputCls }),
    errors.tenant_name && /* @__PURE__ */ jsx("p", { className: "text-sm text-red-600", children: errors.tenant_name.message }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Email" }),
    /* @__PURE__ */ jsx("input", { ...register("tenant_email"), type: "email", className: inputCls }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Phone (optional if email provided)" }),
    /* @__PURE__ */ jsx("input", { ...register("tenant_phone"), type: "tel", className: inputCls }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Issue type" }),
    /* @__PURE__ */ jsxs("select", { ...register("issue_type"), className: inputCls, children: [
      /* @__PURE__ */ jsx("option", { value: "", children: "Select…" }),
      /* @__PURE__ */ jsx("option", { value: "plumbing", children: "Plumbing" }),
      /* @__PURE__ */ jsx("option", { value: "electrical", children: "Electrical" }),
      /* @__PURE__ */ jsx("option", { value: "hvac", children: "HVAC / heating / cooling" }),
      /* @__PURE__ */ jsx("option", { value: "appliance", children: "Appliance" }),
      /* @__PURE__ */ jsx("option", { value: "pest", children: "Pest" }),
      /* @__PURE__ */ jsx("option", { value: "locks", children: "Locks / keys" }),
      /* @__PURE__ */ jsx("option", { value: "other", children: "Other" })
    ] }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Urgency" }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-2", children: ["low", "normal", "high", "emergency"].map((u) => /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => setValue("urgency", u, { shouldValidate: true }),
        className: `px-3 py-1.5 rounded border capitalize ${urgency === u ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]" : "border-gray-300"}`,
        children: u
      },
      u
    )) }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Description" }),
    /* @__PURE__ */ jsx("textarea", { ...register("description"), rows: 4, className: inputCls }),
    errors.description && /* @__PURE__ */ jsx("p", { className: "text-sm text-red-600", children: errors.description.message }),
    /* @__PURE__ */ jsx("label", { className: labelCls, children: "Photos (optional, up to 5)" }),
    /* @__PURE__ */ jsx(PhotoUploader, { supabaseUrl, anonKey, turnstileToken: turnstile, onPathsChange: setPhotoPaths }),
    /* @__PURE__ */ jsx(TurnstileWidget, { siteKey: turnstileSiteKey, onToken: setTurnstile }),
    submitError && /* @__PURE__ */ jsx("p", { className: "text-red-600 text-sm", children: submitError }),
    /* @__PURE__ */ jsx("button", { type: "submit", disabled: isSubmitting, className: "mt-4 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400", children: isSubmitting ? "Submitting…" : "Submit request" })
  ] });
}

const prerender = false;
const $$Maintenance = createComponent(async ($$result, $$props, $$slots) => {
  const { data: _buildings } = await supabase.from("buildings").select("id, name").eq("is_published", true).order("name");
  const buildings = _buildings ?? [];
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "Submit a maintenance request", "description": "Tell us about a maintenance issue at your AR Management apartment." }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="max-w-2xl mx-auto px-4 py-10"> <h1 class="text-3xl font-bold">Maintenance request</h1> <p class="mt-2 text-gray-600">Existing residents — let us know what needs attention.</p> <div class="mt-6"> ${renderComponent($$result2, "MaintenanceForm", MaintenanceForm, { "client:load": true, "supabaseUrl": clientEnv.VITE_SUPABASE_URL, "anonKey": clientEnv.VITE_SUPABASE_ANON_KEY, "turnstileSiteKey": clientEnv.VITE_TURNSTILE_SITE_KEY, "buildings": buildings, "client:component-hydration": "load", "client:component-path": "/home/mocap/AR_management/apps/web/src/components/islands/MaintenanceForm", "client:component-export": "MaintenanceForm" })} </div> </section> ` })}`;
}, "/home/mocap/AR_management/apps/web/src/pages/maintenance.astro", void 0);

const $$file = "/home/mocap/AR_management/apps/web/src/pages/maintenance.astro";
const $$url = "/maintenance";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Maintenance,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
