import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESHELL_DIR = join(__dirname, "..", "..", "reshell");
const PUBLIC_DIR = join(__dirname, "..", "public");
const OUT_DIR = join(RESHELL_DIR, "out");
const TARGET_DIR = join(PUBLIC_DIR, "reshell");

console.log("[bundle-reshell] Building reshell static export...");
execSync("npm run build", { cwd: RESHELL_DIR, stdio: "inherit" });

if (!existsSync(OUT_DIR)) {
  console.error("[bundle-reshell] reshell build failed — no out/ directory");
  process.exit(1);
}

console.log("[bundle-reshell] Copying static export...");
if (existsSync(TARGET_DIR)) rmSync(TARGET_DIR, { recursive: true });
mkdirSync(TARGET_DIR, { recursive: true });
cpSync(OUT_DIR, TARGET_DIR, { recursive: true });

console.log("[bundle-reshell] Fixing asset paths...");
const indexPath = join(TARGET_DIR, "index.html");
const notFoundPath = join(TARGET_DIR, "404.html");

for (const file of [indexPath, notFoundPath]) {
  if (!existsSync(file)) continue;
  let html = readFileSync(file, "utf-8");
  html = html.replace(/src="\/_next\//g, 'src="/reshell/_next/');
  html = html.replace(/href="\/_next\//g, 'href="/reshell/_next/');
  html = html.replace(/href="\/favicon\.ico/g, 'href="/reshell/favicon.ico');
  html = html.replace(/href="\/vercel\.svg/g, 'href="/reshell/vercel.svg');
  html = html.replace(/href="\/next\.svg/g, 'href="/reshell/next.svg');
  writeFileSync(file, html, "utf-8");
}

console.log("[bundle-reshell] Done — reshell app bundled into public/reshell/");