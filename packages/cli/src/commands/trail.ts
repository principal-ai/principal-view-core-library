/**
 * Trail command — fetch or publish trails to the Principal ADE backend.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * the web-ade trail API with `Authorization: Bearer <token>`. The token is
 * never echoed to argv, env, stdout, or stderr. stdout is trail JSON (fetch)
 * or the share URL (publish) only.
 */

import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE_URL = 'https://app.principal-ade.com';
const RESERVED_TRAIL_IDS = new Set(['publish']);

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

function exitWithTokenError(): never {
  process.stderr.write(
    'Could not resolve a GitHub token. Run `gh auth login`, or configure a git credential helper for github.com.\n',
  );
  process.exit(2);
}

async function readPayloadFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface ResolvedPayloadInput {
  payload: unknown;
  source: 'stdin' | 'file';
}

async function readPayload(file: string | undefined): Promise<ResolvedPayloadInput> {
  const useStdin = !file || file === '-';
  const raw = useStdin ? await readPayloadFromStdin() : readFileSync(file, 'utf8');
  if (!raw.trim()) {
    process.stderr.write('Empty payload\n');
    process.exit(2);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Could not parse payload as JSON: ${(err as Error).message}\n`);
    process.exit(2);
  }
  return { payload: parsed, source: useStdin ? 'stdin' : 'file' };
}

interface OwnerRepo {
  owner: string;
  repo: string;
}

function resolveOwnerRepo(
  payload: unknown,
  flagOwner: string | undefined,
  flagRepo: string | undefined,
): OwnerRepo {
  const remote =
    typeof payload === 'object' && payload !== null
      ? (payload as { repos?: Array<{ remote?: { owner?: string; name?: string } }> }).repos?.[0]
          ?.remote
      : undefined;

  const owner = flagOwner ?? remote?.owner;
  const repo = flagRepo ?? remote?.name;

  if (!owner || !repo) {
    process.stderr.write(
      'Could not determine owner/repo. Pass --owner and --repo, or include `repos[0].remote` in the payload.\n',
    );
    process.exit(2);
  }
  return { owner, repo };
}

async function describeHttpError(response: Response): Promise<string> {
  let serverMessage = '';
  let code = '';
  try {
    const body = (await response.clone().json()) as {
      error?: string;
      code?: string;
    };
    serverMessage = body.error ?? '';
    code = body.code ?? '';
  } catch {
    // body wasn't JSON — keep going with status-only message
  }
  const fallback =
    response.status === 404
      ? 'Trail not found'
      : response.status === 403
        ? 'No read access to this repository (token may lack repo scope)'
        : response.status === 401
          ? 'GitHub token rejected'
          : `HTTP ${response.status}`;
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

async function fetchTrail(input: string): Promise<void> {
  const id = parseTrailId(input);
  if (!id) {
    process.stderr.write('Invalid trail id\n');
    process.exit(2);
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

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
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const payload = await response.text();
  process.stdout.write(payload);
  if (!payload.endsWith('\n')) process.stdout.write('\n');
}

interface PublishOptions {
  owner?: string;
  repo?: string;
}

async function publishTrail(file: string | undefined, options: PublishOptions): Promise<void> {
  const { payload } = await readPayload(file);

  const payloadId =
    typeof payload === 'object' && payload !== null
      ? (payload as { id?: unknown }).id
      : undefined;
  if (typeof payloadId === 'string' && RESERVED_TRAIL_IDS.has(payloadId)) {
    process.stderr.write(
      `Trail id '${payloadId}' is reserved (collides with \`principal-ai trail ${payloadId}\`).\n`,
    );
    process.exit(2);
  }

  const { owner, repo } = resolveOwnerRepo(payload, options.owner, options.repo);

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/trails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ owner, repo, payload }),
    });
  } catch (err) {
    process.stderr.write(`Network error publishing trail: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = (await response.json()) as { id?: string; url?: string };
  if (!body.url) {
    process.stderr.write('Server response missing share URL\n');
    process.exit(1);
  }
  const shareUrl = body.url.startsWith('http') ? body.url : `${BASE_URL}${body.url}`;
  process.stdout.write(`${shareUrl}\n`);
}

export function createTrailCommand(): Command {
  const command = new Command('trail');

  command
    .description('Fetch or publish trails from the Principal ADE backend')
    .argument(
      '[id-or-url]',
      'Trail id, or full https://app.principal-ade.com/trail/<id> URL (omit when using a sub-action)',
    )
    .action(async (input: string | undefined) => {
      if (!input) {
        command.help();
        return;
      }
      await fetchTrail(input);
    });

  command
    .command('publish')
    .description('Publish a slice/flow trail payload to web-ade')
    .argument(
      '[file]',
      'Payload JSON file path; pass `-` or omit to read from stdin',
    )
    .option('--owner <owner>', 'GitHub owner (overrides payload `repos[0].remote.owner`)')
    .option('--repo <repo>', 'GitHub repo (overrides payload `repos[0].remote.name`)')
    .action(async (file: string | undefined, options: PublishOptions) => {
      await publishTrail(file, options);
    });

  return command;
}
