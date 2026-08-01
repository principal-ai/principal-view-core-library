/**
 * Client-side helpers for talking to a running trail-viewer instance.
 *
 * Wire format mirrors `packages/trail-viewer/src/bun/ipc.ts`: Unix domain
 * socket at `~/.principal/trail-viewer.sock`, single line-delimited JSON
 * message per connection, single line-delimited JSON response.
 *
 * Duplicated rather than shared because cli and trail-viewer are independent
 * npm packages — the wire protocol is the contract, this module enforces it
 * from the producer side.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';

export const SOCKET_PATH = join(homedir(), '.principal', 'trail-viewer.sock');

export interface LoadTrailMessage {
  kind: 'LOAD_TRAIL';
  trailFile: string;
  mode: 'local' | 'remote';
  repoRoot?: string;
  ghToken?: string;
  repoOwner?: string;
  repoName?: string;
  repoPurl?: string;
}

export interface ActivateTabMessage {
  kind: 'ACTIVATE_TAB';
  /** Permanent tab id to switch to (e.g. `agent-sessions`). */
  tabId: string;
}

export type ViewerIpcMessage = LoadTrailMessage | ActivateTabMessage;

const CONNECT_TIMEOUT_MS = 500;

/**
 * Try to hand off a message to a running viewer. Returns true if the running
 * viewer accepted; caller can exit 0 without spawning. Returns false if no
 * viewer is reachable.
 */
export async function handoffToRunning(message: ViewerIpcMessage): Promise<boolean> {
  if (!existsSync(SOCKET_PATH)) return false;

  return new Promise((resolve) => {
    const client = createConnection(SOCKET_PATH);
    const timer = setTimeout(() => {
      client.destroy();
      resolve(false);
    }, CONNECT_TIMEOUT_MS);

    let buffer = '';
    client.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      // Stale socket file: the viewer died without cleaning up its `.sock`, so
      // connecting refuses (ECONNREFUSED). Unlink it so it doesn't linger and
      // cause repeated connect attempts/hangs, and so a fresh viewer can bind
      // the path cleanly on spawn.
      if (err.code === 'ECONNREFUSED') {
        try {
          unlinkSync(SOCKET_PATH);
        } catch {
          // already gone, or a racing viewer re-bound it — nothing to do.
        }
      }
      resolve(false);
    });
    client.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      clearTimeout(timer);
      try {
        const response = JSON.parse(buffer.slice(0, newline)) as { ok: boolean };
        resolve(response.ok === true);
      } catch {
        resolve(false);
      }
      client.end();
    });
    client.on('connect', () => {
      client.write(`${JSON.stringify(message)}\n`);
    });
  });
}
