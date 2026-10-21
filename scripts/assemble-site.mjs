// Builds the GitHub Pages tree: the landing page at the root and the editor under editor/.
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(rootDir, "_site");
const editorBuild = resolve(rootDir, "dist-pages");

if (!existsSync(resolve(editorBuild, "index.html"))) {
  throw new Error("dist-pages/index.html is missing. Run npm run build:pages first.");
}

rmSync(outDir, { recursive: true, force: true });
cpSync(resolve(rootDir, "site"), outDir, { recursive: true });
cpSync(editorBuild, resolve(outDir, "editor"), { recursive: true });
// Cloudflare reads _headers; GitHub Pages would serve it as a public file.
rmSync(resolve(outDir, "editor/_headers"), { force: true });
writeFileSync(resolve(outDir, ".nojekyll"), "");

console.log(`Site assembled in ${outDir}`);
