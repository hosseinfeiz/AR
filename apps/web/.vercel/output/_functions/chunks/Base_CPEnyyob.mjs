import { c as createComponent } from './astro-component_Bs9c3G9N.mjs';
import { m as maybeRenderHead, h as addAttribute, r as renderTemplate, u as unescapeHTML, n as renderComponent, o as renderHead, p as renderSlot } from './entrypoint_Dsa6HmE5.mjs';

const $$Header = createComponent(($$result, $$props, $$slots) => {
  const links = [
    { href: "/", label: "Home" },
    { href: "/listings", label: "Listings" },
    { href: "/maintenance", label: "Maintenance" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" }
  ];
  return renderTemplate`${maybeRenderHead()}<header class="border-b border-gray-200 bg-white sticky top-0 z-10"> <nav class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between"> <a href="/" class="text-xl font-bold tracking-tight">AR Management</a> <ul class="hidden sm:flex gap-6 text-sm"> ${links.slice(1).map((l) => renderTemplate`<li><a${addAttribute(l.href, "href")} class="text-gray-700 hover:text-[var(--color-brand)]">${l.label}</a></li>`)} </ul> <a href="/schedule" class="hidden sm:inline-flex bg-[var(--color-brand)] text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-[var(--color-brand-dark)]">Schedule a showing</a> </nav> </header>`;
}, "/home/mocap/AR_management/apps/web/src/components/Header.astro", void 0);

const $$Footer = createComponent(($$result, $$props, $$slots) => {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  return renderTemplate`${maybeRenderHead()}<footer class="border-t border-gray-200 mt-16"> <div class="max-w-5xl mx-auto px-4 py-8 grid sm:grid-cols-3 gap-6 text-sm"> <div> <h3 class="font-semibold mb-2">AR Management</h3> <p class="text-gray-600">Apartment living at Grass Lake Manor and Winnetka Manor.</p> </div> <div> <h3 class="font-semibold mb-2">Get in touch</h3> <ul class="space-y-1 text-gray-700"> <li><a href="/maintenance" class="hover:underline">Maintenance request</a></li> <li><a href="/schedule" class="hover:underline">Schedule a showing</a></li> <li><a href="/contact" class="hover:underline">Contact</a></li> </ul> </div> <div> <h3 class="font-semibold mb-2">Legal</h3> <ul class="space-y-1 text-gray-700"> <li><a href="/privacy" class="hover:underline">Privacy</a></li> <li><a href="/terms" class="hover:underline">Terms</a></li> </ul> </div> </div> <div class="border-t border-gray-200 py-4 text-center text-xs text-gray-500">© ${year} AR Management. All rights reserved.</div> </footer>`;
}, "/home/mocap/AR_management/apps/web/src/components/Footer.astro", void 0);

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Seo = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Seo;
  const { title, description, canonical, image, jsonLd } = Astro2.props;
  const siteName = "AR Management";
  const fullTitle = title.includes(siteName) ? title : `${title} | ${siteName}`;
  const url = canonical ?? Astro2.url.href;
  const ogImage = image ?? `${Astro2.site}og-default.png`;
  return renderTemplate`<title>${fullTitle}</title>${description && renderTemplate`<meta name="description"${addAttribute(description, "content")}>`}<link rel="canonical"${addAttribute(url, "href")}><meta property="og:title"${addAttribute(fullTitle, "content")}>${description && renderTemplate`<meta property="og:description"${addAttribute(description, "content")}>`}<meta property="og:type" content="website"><meta property="og:url"${addAttribute(url, "content")}><meta property="og:image"${addAttribute(ogImage, "content")}><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title"${addAttribute(fullTitle, "content")}>${description && renderTemplate`<meta name="twitter:description"${addAttribute(description, "content")}>`}<meta name="twitter:image"${addAttribute(ogImage, "content")}>${jsonLd && renderTemplate(_a || (_a = __template(['<script type="application/ld+json">', "<\/script>"])), unescapeHTML(JSON.stringify(jsonLd)))}`;
}, "/home/mocap/AR_management/apps/web/src/components/Seo.astro", void 0);

const $$Base = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Base;
  const { title, description, canonical, image, jsonLd } = Astro2.props;
  return renderTemplate`<html lang="en"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg">${renderComponent($$result, "Seo", $$Seo, { "title": title, "description": description, "canonical": canonical, "image": image, "jsonLd": jsonLd })}${renderHead()}</head> <body class="min-h-screen flex flex-col"> ${renderComponent($$result, "Header", $$Header, {})} <main class="flex-1">${renderSlot($$result, $$slots["default"])}</main> ${renderComponent($$result, "Footer", $$Footer, {})} </body></html>`;
}, "/home/mocap/AR_management/apps/web/src/layouts/Base.astro", void 0);

export { $$Base as $ };
