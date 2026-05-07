/**
 * Trail command — fetch a trail JSON from the Principal ADE backend.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * GET /api/trails/by-id/<id> with `Authorization: Bearer <token>`. The token
 * is never echoed to argv, env, stdout, or stderr. stdout is trail JSON only.
 */

import { Command } from 'commander';
import { spawnSync } from 'node:child_process';

const BASE_URL = 'https://app.principal-ade.com';

function parseTrailId(input: string): string {
  try {
    const url = new URL(input);
    const match = url.pathname.match(/\/trail\/([^/]+)\/?$/);
    if (match) return match[1];
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length) return segments[segments.length - 1];
  } catch {
    // not a URL — fall through and treat input as a bare id
  }
  return input;
}

function resolveTokenViaGh(): string | null {
  const result = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status === 0 && result.stdout) {
    const token = result.stdout.trim();
    if (token) return token;
  }
  return null;
}

function resolveTokenViaGitCredential(): string | null {
  const result = spawnSync('git', ['credential', 'fill'], {
    encoding: 'utf8',
    input: 'protocol=https\nhost=github.com\n\n',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || !result.stdout) return null;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('password=')) {
      const token = line.slice('password='.length).trim();
      if (token) return token;
    }
  }
  return null;
}

function resolveToken(): string | null {
  return resolveTokenViaGh() ?? resolveTokenViaGitCredential();
}

export function createTrailCommand(): Command {
  const command = new Command('trail');

  command
    .description('Fetch a trail JSON from the Principal ADE backend')
    .argument('<id-or-url>', 'Trail id, or full https://app.principal-ade.com/trail/<id> URL')
    .action(async (input: string) => {
      const id = parseTrailId(input);
      if (!id) {
        process.stderr.write('Invalid trail id\n');
        process.exit(2);
      }

      const token = resolveToken();
      if (!token) {
        process.stderr.write(
          'Could not resolve a GitHub token. Run `gh auth login`, or configure a git credential helper for github.com.\n',
        );
        process.exit(2);
      }

      const url = `${BASE_URL}/api/trails/by-id/${encodeURIComponent(id)}`;
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
      } catch (err) {
        process.stderr.write(`Network error fetching trail: ${(err as Error).message}\n`);
        process.exit(1);
      }

      if (!response.ok) {
        let code = '';
        try {
          const body = (await response.clone().json()) as { code?: string };
          code = body.code ?? '';
        } catch {
          // body wasn't JSON — keep going with status-only message
        }
        const human =
          response.status === 404
            ? 'Trail not found'
            : response.status === 403
              ? 'No read access to this repository (token may lack repo scope)'
              : response.status === 401
                ? 'GitHub token rejected'
                : `HTTP ${response.status}`;
        process.stderr.write(`${human}${code ? ` [${code}]` : ''}\n`);
        process.exit(1);
      }

      const payload = await response.text();
      process.stdout.write(payload);
      if (!payload.endsWith('\n')) process.stdout.write('\n');
    });

  return command;
}
