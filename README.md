# live-markdown-preview

A fast local-first live preview tool for Markdown files.

## Features

- Live Markdown preview rendered through a Web Worker.
- GitHub Flavored Markdown support for tables and task lists.
- Sanitized raw HTML preview and sanitized HTML copy.
- Local draft and preferences stored in IndexedDB.
- Outline, resizable editor/preview split, and persisted layout preferences.
- Copy Markdown, copy sanitized HTML, browser print-based PDF export, theme toggle, and About dialog.
- Large document and large preview-output safeguards.

## Tech stack

- Preact and Vite for the app shell.
- CodeMirror for the Markdown editor.
- unified, remark, and rehype for Markdown rendering.
- DOMPurify for preview sanitization.
- Vitest and Playwright for automated checks.

## Development

```bash
npm install
npm run dev
```

The dev server binds to `127.0.0.1`.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run preview` serves the production build with Vite preview.
- `npm run build` runs TypeScript checking and builds the app.
- `npm test` runs the Vitest suite once.
- `npm run test:watch` runs Vitest in watch mode.
- `npm run test:e2e` runs Playwright tests. The `pretest:e2e` script builds the app first.

## Checks

```bash
npm run build
npm test
npm run test:e2e
```

Playwright starts `npm run preview -- --port 4173` at `http://127.0.0.1:4173` and does not reuse an existing server.

## Deployment

Cloudflare Pages security headers are defined in `public/_headers`. Vite preview is configured to serve matching security headers locally for e2e coverage.

The enforced policy includes CSP, `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy`.
