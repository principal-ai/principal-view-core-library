/**
 * Tour command — open a File City introduction tour (`*.tour.json`) in the
 * standalone viewer.
 *
 * Tours are the sibling of trails: a trail pins markers to `file:line`, a tour
 * scopes steps to a `focusDirectory` + highlight layers. Because steps address
 * whole directories, the viewer always needs the working tree — so tours are
 * local-mode only (no fetch, no remote slice resolution, no token). This is the
 * lighter cousin of `trail view --file`, reusing the same viewer-launch + IPC
 * handoff plumbing.
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handoffToRunning, type LoadTrailMessage } from '../lib/viewer-ipc.js';
import { resolveViewerLaunch } from './trail.js';

interface TourViewOptions {
  repoRoot?: string;
  viewerDir?: string;
}

/**
 * Cheap pre-flight so an obviously-broken tour fails here with a clear message
 * instead of opening the viewer to an idle, empty city. The viewer host runs
 * the full `parseTourOrThrow` validation on load — this only catches the
 * coarse "not JSON / not a tour" cases without pulling in the builder package.
 */
function assertLooksLikeTour(absolute: string): void {
  let body: string;
  try {
    body = readFileSync(absolute, 'utf8');
  } catch (err) {
    process.stderr.write(`Failed to read ${absolute}: ${(err as Error).message}\n`);
    process.exit(1);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (err) {
    process.stderr.write(`Tour file is not valid JSON: ${(err as Error).message}\n`);
    process.exit(1);
  }
  const steps =
    typeof payload === 'object' && payload !== null
      ? (payload as { steps?: unknown }).steps
      : undefined;
  if (!Array.isArray(steps) || steps.length === 0) {
    process.stderr.write(
      `${absolute} does not look like a tour (expected a non-empty \`steps\` array).\n`,
    );
    process.exit(1);
  }
}

async function viewTour(file: string, options: TourViewOptions): Promise<void> {
  const absolute = resolve(process.cwd(), file);
  if (!existsSync(absolute)) {
    process.stderr.write(`Tour file not found: ${absolute}\n`);
    process.exit(2);
  }
  assertLooksLikeTour(absolute);

  // Default the repo root to cwd. The user sees "no directory matched" framing
  // in the viewer if cwd isn't actually the repo the tour was authored against,
  // which is the right signal to re-run with --repo-root.
  const repoRoot = options.repoRoot
    ? resolve(process.cwd(), options.repoRoot)
    : process.cwd();

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TRAIL_FILE: absolute,
    TRAIL_MODE: 'local',
    TRAIL_REPO_ROOT: repoRoot,
  };

  // The viewer host auto-detects tour vs trail from the filename/shape, so the
  // `LOAD_TRAIL` message carries the tour file just like a trail would.
  const ipcMessage: LoadTrailMessage = {
    kind: 'LOAD_TRAIL',
    trailFile: absolute,
    mode: 'local',
    repoRoot,
  };
  if (await handoffToRunning(ipcMessage)) {
    process.stderr.write(`Tour handed off to running viewer: ${absolute}\n`);
    process.exit(0);
  }

  const launch = resolveViewerLaunch(options.viewerDir);
  process.stderr.write(`Launching tour viewer for ${absolute}\n`);

  const child =
    launch.kind === 'installed'
      ? spawn(launch.bin, [], { env, stdio: 'inherit' })
      : spawn('bun', ['start'], { cwd: launch.dir, env, stdio: 'inherit' });
  child.on('error', (err) => {
    process.stderr.write(`Failed to launch viewer: ${err.message}\n`);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

export function createTourCommand(): Command {
  const command = new Command('tour');

  command.description('Open File City introduction tours in the standalone viewer');

  command
    .command('view')
    .description('Open a *.tour.json in the standalone viewer (local mode)')
    .argument('<file>', 'Path to a *.tour.json file')
    .option(
      '--repo-root <path>',
      'Working tree the tour is authored against (default: cwd)',
    )
    .option(
      '--viewer-dir <path>',
      'Path to the @principal-ai/trail-viewer package (overrides TRAIL_VIEWER_DIR)',
    )
    .action(async (file: string, options: TourViewOptions) => {
      await viewTour(file, options);
    });

  return command;
}
