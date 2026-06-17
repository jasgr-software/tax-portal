#!/usr/bin/env node
/**
 * scripts/make-phase-video.mjs — package an end-of-phase walkthrough recording.
 *
 * Codified phase-closeout step (see .orchestration/DEMO-POLICY.md § Phase-closeout walkthrough video).
 * The `@video` walkthrough spec (apps/<app>/e2e/demo/phase-<N>-walkthrough.demo.spec.ts) records one
 * continuous `video.webm` into apps/<app>/test-results/ (gitignored). This script:
 *   1. finds the newest produced video.webm (across apps),
 *   2. copies it to docs/demos/phase-<N>/phase-<N>-walkthrough.webm,
 *   3. converts it to .mp4 via the `ffmpeg-static` prebuilt binary (no system ffmpeg / sudo).
 *
 * Usage (after recording):
 *   pnpm --filter <app> e2e:video        # produces the .webm
 *   node scripts/make-phase-video.mjs <N>   # → docs/demos/phase-<N>/phase-<N>-walkthrough.{webm,mp4}
 *
 * <N> is the roadmap phase number (default: 1). If ffmpeg-static is absent, the .webm is still
 * produced and the .mp4 step is skipped with a note (the .webm plays in any modern browser).
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phase = (process.argv[2] ?? "1").replace(/[^0-9a-zA-Z._-]/g, ""); // sanitise into a slug
const outDir = path.join(repoRoot, "docs", "demos", `phase-${phase}`);
const webmOut = path.join(outDir, `phase-${phase}-walkthrough.webm`);
const mp4Out = path.join(outDir, `phase-${phase}-walkthrough.mp4`);

// ─── 1. Find the newest video.webm under any app's test-results/ ────────────────
function findWebms(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findWebms(full));
    else if (entry.isFile() && entry.name.endsWith(".webm")) found.push(full);
  }
  return found;
}

const appsDir = path.join(repoRoot, "apps");
const searchRoots = existsSync(appsDir)
  ? readdirSync(appsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(appsDir, e.name, "test-results"))
  : [];

const webms = searchRoots
  .flatMap(findWebms)
  .map((f) => ({ f, mtime: statSync(f).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (webms.length === 0) {
  console.error(
    `[make-phase-video] No .webm found under apps/*/test-results.\n` +
      `Record first, e.g.:  pnpm --filter admin e2e:video`,
  );
  process.exit(1);
}

const sourceWebm = webms[0].f;
console.log(`[make-phase-video] phase: ${phase}`);
console.log(`[make-phase-video] source: ${path.relative(repoRoot, sourceWebm)}`);

// ─── 2. Copy the .webm into the committed gallery ───────────────────────────────
mkdirSync(outDir, { recursive: true });
copyFileSync(sourceWebm, webmOut);
const webmSize = (statSync(webmOut).size / 1_048_576).toFixed(1);
console.log(`[make-phase-video] webm → ${path.relative(repoRoot, webmOut)} (${webmSize} MB)`);

// ─── 3. Convert to .mp4 via ffmpeg-static (prebuilt binary, no sudo) ────────────
let ffmpegPath = null;
try {
  const mod = await import("ffmpeg-static");
  ffmpegPath = mod.default ?? mod;
} catch {
  ffmpegPath = null;
}

if (!ffmpegPath || !existsSync(ffmpegPath)) {
  console.warn(
    "[make-phase-video] ffmpeg-static not installed — skipping .mp4 conversion.\n" +
      "  Install for an mp4:  pnpm add -D -w ffmpeg-static  (then re-run this script)\n" +
      "  The .webm plays in any modern browser.",
  );
  process.exit(0);
}

console.log(`[make-phase-video] converting → mp4 via ffmpeg-static …`);
const res = spawnSync(
  ffmpegPath,
  [
    "-y",
    "-i", webmOut,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p", // broad player compatibility (QuickTime etc.)
    "-movflags", "+faststart",
    mp4Out,
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);

if (res.status !== 0) {
  console.error(`[make-phase-video] ffmpeg exited ${res.status}. The .webm is still available.`);
  process.exit(res.status ?? 1);
}

const mp4Size = (statSync(mp4Out).size / 1_048_576).toFixed(1);
console.log(`[make-phase-video] mp4  → ${path.relative(repoRoot, mp4Out)} (${mp4Size} MB)`);
console.log("[make-phase-video] done.");
