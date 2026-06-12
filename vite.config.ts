import preact from "@preact/preset-vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'nonce-bGl2ZS1tYXJrZG93bi1wcmV2aWV3'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "decode-named-character-reference": resolve(
        rootDir,
        "node_modules/decode-named-character-reference/index.js"
      )
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"]
  },
  preview: {
    headers: {
      "Content-Security-Policy": contentSecurityPolicy,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
    }
  }
});
