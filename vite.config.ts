import preact from "@preact/preset-vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { cloudflare } from "@cloudflare/vite-plugin";

const rootDir = dirname(fileURLToPath(import.meta.url));
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'nonce-bGl2ZS1tYXJrZG93bi1wcmV2aWV3'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

// GitHub Pages cannot send response headers, so the Pages build carries the policy in meta tags.
// frame-ancestors is ignored in a meta CSP and is left out.
const pagesBase = "/live-markdown-preview/editor/";
const metaContentSecurityPolicy = contentSecurityPolicy.replace(/; frame-ancestors [^;]+/, "");

function pagesSecurityMeta(): Plugin {
  return {
    name: "pages-security-meta",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: metaContentSecurityPolicy },
        injectTo: "head-prepend"
      },
      { tag: "meta", attrs: { name: "referrer", content: "strict-origin-when-cross-origin" }, injectTo: "head" }
    ]
  };
}

function modePlugins(mode: string): Plugin[] {
  if (mode === "test") return [];
  if (mode === "pages") return [pagesSecurityMeta()];
  return cloudflare() as Plugin[];
}

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? pagesBase : "/",
  plugins: [preact(), ...modePlugins(mode)],
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
}));
