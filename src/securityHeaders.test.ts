import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Cloudflare security headers", () => {
  it("ships enforced CSP and restrictive permissions", () => {
    const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");

    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).not.toContain("Content-Security-Policy-Report-Only");
    expect(headers).toContain("style-src 'self' 'nonce-bGl2ZS1tYXJrZG93bi1wcmV2aWV3'");
    expect(headers).not.toContain("'unsafe-inline'");
    expect(headers).toContain("worker-src 'self'");
    expect(headers).not.toContain("worker-src 'self' blob:");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("form-action 'none'");
    expect(headers).toContain("Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()");
  });
});
