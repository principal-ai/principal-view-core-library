#!/usr/bin/env bun
/**
 * Stage the canary build into `bundles/<os>-<arch>/trail-viewer.app/` so the
 * bin shim can find it under a stable name. Runs as `prepack` so `npm pack`
 * and `npm publish` both pick up a fresh bundle without manual copying.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");

const SRC_APP = join(pkgRoot, "build", "canary-macos-arm64", "trail-viewer-canary.app");
const DEST_DIR = join(pkgRoot, "bundles", "macos-arm64");
const DEST_APP = join(DEST_DIR, "trail-viewer.app");

if (!existsSync(SRC_APP)) {
	console.error(`stage-bundle: missing canary build at ${SRC_APP}`);
	console.error('stage-bundle: run `bun run build:canary` first.');
	process.exit(1);
}

if (existsSync(DEST_APP)) {
	rmSync(DEST_APP, { recursive: true, force: true });
}

cpSync(SRC_APP, DEST_APP, { recursive: true });
console.log(`stage-bundle: ${SRC_APP} -> ${DEST_APP}`);
