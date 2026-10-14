import { defineConfig, type Plugin } from "vitest/config";

/**
 * Next.js resolves an image import to `{ src, width, height }` where Vite
 * returns the URL string; the app reads `.src`. Tests import the same modules
 * (mock catalogue fixtures), so they get the Next.js shape too.
 */
function nextStaticImages(): Plugin {
  return {
    name: "next-static-images",
    enforce: "pre",
    load(id) {
      const file = id.split("?")[0];
      if (!/\.(png|jpe?g|gif|webp|avif|svg)$/.test(file)) return null;
      return `export default ${JSON.stringify({ src: file, width: 0, height: 0 })};`;
    },
  };
}

/**
 * Coverage (`npm run test:coverage`) measures the domain logic in `src/lib`
 * (rules, mappings, money); screens and components are covered by the
 * Playwright suites instead. Thresholds are a floor set just under the
 * measured baseline (2026-10-14: lines 49.7 %, branches 52.9 %), to be raised
 * as tests are added, never lowered to make a run pass. The modules that
 * compute money, cart lines and grading carry their own, stricter floor.
 */
const coverage = {
  provider: "v8",
  include: ["src/lib/**/*.ts"],
  exclude: ["src/lib/**/*.test.ts", "src/lib/supabase/database.types.ts"],
  reporter: ["text-summary", "json-summary", "html", "lcov"],
  thresholds: {
    lines: 49,
    statements: 49,
    branches: 52,
    functions: 55,
    "src/lib/catalog/money.ts": { lines: 100, branches: 100, functions: 100, statements: 100 },
    "src/lib/checkout/cartLines.ts": { lines: 100, branches: 95 },
    "src/lib/checkout/giftCardQuote.ts": { lines: 100, branches: 95 },
    "src/lib/checkout/shippingRates.ts": { lines: 100, branches: 90 },
    "src/lib/checkout/checkoutForm.ts": { lines: 100, branches: 95 },
    "src/lib/checkout/basketQuote.ts": { lines: 98, branches: 84 },
    "src/lib/coursePricing.ts": { lines: 97, branches: 92 },
    "src/lib/learning/grading.ts": { lines: 100, branches: 83 },
    "src/lib/learning/path.ts": { lines: 100, branches: 86 },
    "src/lib/authRoutes.ts": { lines: 100, branches: 100 },
    "src/lib/staffProfile.ts": { lines: 100, branches: 100 },
    "src/lib/promotionRules.ts": { lines: 69, branches: 69 },
    "src/lib/registration.ts": { lines: 81, branches: 77 },
  },
} as const;

// Unit tests only: the Playwright suites in e2e/ and e2e-live/ have their own runner.
export default defineConfig({
  plugins: [nextStaticImages()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: { ...coverage, include: [...coverage.include], exclude: [...coverage.exclude], reporter: [...coverage.reporter] },
  },
});
