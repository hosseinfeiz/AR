import { s as supabase } from './supabase_CPRhLCrz.mjs';

const prerender = false;
const GET = async () => {
  try {
    const { error } = await supabase.from("buildings").select("id").limit(1);
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, ts: (/* @__PURE__ */ new Date()).toISOString() }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 503,
      headers: { "content-type": "application/json" }
    });
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
