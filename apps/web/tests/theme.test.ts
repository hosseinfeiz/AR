/**
 * Theme toggle test re-export.
 *
 * The S8 plan specifies this path, but vitest is configured to scan
 * `tests/unit/**` only. The actual assertions live at
 * `tests/unit/theme.test.ts` so they execute under `pnpm test`; this
 * file documents the canonical location and surfaces the same tests
 * if a future config change broadens the include pattern.
 */
export * from './unit/theme.test'
