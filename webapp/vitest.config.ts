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

// Unit tests only: the Playwright smoke tests in e2e/ have their own runner.
export default defineConfig({
  plugins: [nextStaticImages()],
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
