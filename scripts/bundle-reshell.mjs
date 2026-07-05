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
execSync("npm run build", {
  cwd: RESHELL_DIR,
  stdio: "inherit",
  env: { ...process.env, RESHELL_BASE_PATH: "/reshell" },
});

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

function externalizeInlineScripts(html, prefix) {
  let scriptIndex = 0;
  return html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (match, attrs, code) => {
    if (/\bsrc=/.test(attrs) || code.trim() === "") return match;
    const filename = `inline-${prefix}-${scriptIndex++}.js`;
    writeFileSync(join(TARGET_DIR, filename), code, "utf-8");
    return `<script${attrs} src="/reshell/${filename}"></script>`;
  });
}

for (const [file, prefix] of [[indexPath, "index"], [notFoundPath, "404"]]) {
  if (!existsSync(file)) continue;
  let html = readFileSync(file, "utf-8");
  html = html.replace(/href="\/favicon\.ico/g, 'href="/reshell/favicon.ico');
  html = html.replace(/href="\/vercel\.svg/g, 'href="/reshell/vercel.svg');
  html = html.replace(/href="\/next\.svg/g, 'href="/reshell/next.svg');
  html = externalizeInlineScripts(html, prefix);
  if (/(?:src|href)="\/_next\/|\\?"\/_next\/static\//.test(html)) {
    console.error(`[bundle-reshell] ${file} still references root /_next assets`);
    process.exit(1);
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) {
    console.error(`[bundle-reshell] ${file} still contains inline scripts`);
    process.exit(1);
  }
  writeFileSync(file, html, "utf-8");
}

console.log("[bundle-reshell] Done — reshell app bundled into public/reshell/");
