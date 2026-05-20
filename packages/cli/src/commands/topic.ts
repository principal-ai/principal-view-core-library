/**
 * Topic command — create / list / view / add-trail on web-ade topics.
 *
 * A **topic** is a curated collection of trails on a shared subject. The
 * topic record itself is `{ title, description, trailIds, owner }` — trails
 * are referenced by id and continue to enforce their own repo-access checks
 * on read. See docs/topics.md in web-ade for the full design.
 *
 * Resolves a GitHub token locally (gh CLI → git credential helper) and calls
 * the web-ade topic API with `Authorization: Bearer <token>`. The token is
 * never echoed to argv, env, stdout, or stderr.
 */

import { Command } from 'commander';
import { spawnSync } from 'node:child_process';

const BASE_URL = 'https://app.principal-ade.com';
const GITHUB_API = 'https://api.github.com';

// Matches the v1 uuid shape web-ade mints for both trails and topics.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// Auth — same posture as `trail.ts`: gh CLI first, then git credential helper.
// Kept local so this command file is self-contained.
// ============================================================================

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

// ============================================================================
// HTTP helpers
// ============================================================================

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
    // body wasn't JSON — fall through to status-only message
  }
  const fallback =
    response.status === 404
      ? 'Topic not found'
      : response.status === 403
        ? 'Not the topic owner (or no permission)'
        : response.status === 401
          ? 'GitHub token rejected'
          : `HTTP ${response.status}`;
  const human = serverMessage || fallback;
  return `${human}${code ? ` [${code}]` : ''}`;
}

// ============================================================================
// Id / URL parsers
// ============================================================================

/** Extract a topic id from a bare uuid or a `…/topic/<id>` URL. */
function parseTopicId(input: string): string {
  const trimmed = input.trim();
  if (UUID_PATTERN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/topic\/([^/]+)\/?$/);
    if (match && UUID_PATTERN.test(match[1]!)) return match[1]!;
  } catch {
    // not a URL — fall through; the server will reject if not a uuid
  }
  // Last-ditch: a "/topic/<uuid>" fragment anywhere in the string.
  const m = trimmed.match(/topic\/([0-9a-f-]+)/i);
  if (m && UUID_PATTERN.test(m[1]!)) return m[1]!;
  return trimmed;
}

/** Extract a trail id from a bare uuid or a `…/trail/<id>` URL. */
function parseTrailId(input: string): string {
  const trimmed = input.trim();
  if (UUID_PATTERN.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/trail\/([^/]+)\/?$/);
    if (match && UUID_PATTERN.test(match[1]!)) return match[1]!;
  } catch {
    // not a URL
  }
  const m = trimmed.match(/trail\/([0-9a-f-]+)/i);
  if (m && UUID_PATTERN.test(m[1]!)) return m[1]!;
  return trimmed;
}

// ============================================================================
// GitHub user resolution — `topic list` defaults to "me" but accepts --user.
// ============================================================================

async function fetchGitHubMe(token: string): Promise<{ id: number; login: string }> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'principal-ai-cli',
    },
  });
  if (!response.ok) {
    process.stderr.write(`GitHub /user failed: HTTP ${response.status}\n`);
    process.exit(1);
  }
  const body = (await response.json()) as { id?: number; login?: string };
  if (typeof body.id !== 'number' || typeof body.login !== 'string') {
    process.stderr.write('GitHub /user returned an unexpected shape\n');
    process.exit(1);
  }
  return { id: body.id, login: body.login };
}

async function fetchGitHubUserByLogin(
  login: string,
  token: string,
): Promise<{ id: number; login: string }> {
  const response = await fetch(
    `${GITHUB_API}/users/${encodeURIComponent(login)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'principal-ai-cli',
      },
    },
  );
  if (response.status === 404) {
    process.stderr.write(`GitHub user not found: ${login}\n`);
    process.exit(1);
  }
  if (!response.ok) {
    process.stderr.write(
      `GitHub /users/${login} failed: HTTP ${response.status}\n`,
    );
    process.exit(1);
  }
  const body = (await response.json()) as { id?: number; login?: string };
  if (typeof body.id !== 'number' || typeof body.login !== 'string') {
    process.stderr.write('GitHub /users returned an unexpected shape\n');
    process.exit(1);
  }
  return { id: body.id, login: body.login };
}

// ============================================================================
// Subcommands
// ============================================================================

interface CreateOptions {
  title?: string;
  description?: string;
  trail?: string[]; // repeatable
}

async function createTopic(options: CreateOptions): Promise<void> {
  if (!options.title || !options.title.trim()) {
    process.stderr.write('--title is required\n');
    process.exit(2);
  }

  const trailIds = (options.trail ?? []).map(parseTrailId);
  for (const tid of trailIds) {
    if (!UUID_PATTERN.test(tid)) {
      process.stderr.write(`--trail value is not a valid trail id or URL: ${tid}\n`);
      process.exit(2);
    }
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/topics`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title: options.title.trim(),
        description: options.description ?? '',
        trailIds,
      }),
    });
  } catch (err) {
    process.stderr.write(`Network error creating topic: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = (await response.json()) as { id?: string; url?: string };
  if (!body.url) {
    process.stderr.write('Server response missing topic URL\n');
    process.exit(1);
  }
  const fullUrl = body.url.startsWith('http') ? body.url : `${BASE_URL}${body.url}`;
  process.stdout.write(`${fullUrl}\n`);
}

async function addTrailToTopic(topicArg: string, trailArg: string): Promise<void> {
  const topicId = parseTopicId(topicArg);
  const trailId = parseTrailId(trailArg);
  if (!UUID_PATTERN.test(topicId)) {
    process.stderr.write(`Not a valid topic id or URL: ${topicArg}\n`);
    process.exit(2);
  }
  if (!UUID_PATTERN.test(trailId)) {
    process.stderr.write(`Not a valid trail id or URL: ${trailArg}\n`);
    process.exit(2);
  }

  const token = resolveToken();
  if (!token) exitWithTokenError();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(topicId)}/trails`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ trailId }),
      },
    );
  } catch (err) {
    process.stderr.write(`Network error adding trail: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  process.stdout.write(`${BASE_URL}/topic/${topicId}\n`);
}

async function viewTopic(input: string): Promise<void> {
  const id = parseTopicId(input);
  if (!UUID_PATTERN.test(id)) {
    process.stderr.write(`Not a valid topic id or URL: ${input}\n`);
    process.exit(2);
  }

  // GET /api/topics/by-id/{id} is public — token isn't required, but we
  // attach one if available so the request is consistent with the other
  // commands and so rate limits favor authenticated callers.
  const token = resolveToken();

  let response: Response;
  try {
    response = await fetch(
      `${BASE_URL}/api/topics/by-id/${encodeURIComponent(id)}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/json',
        },
      },
    );
  } catch (err) {
    process.stderr.write(`Network error fetching topic: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

interface ListOptions {
  user?: string;
  id?: string;
}

async function listTopics(options: ListOptions): Promise<void> {
  let githubId: number;

  if (options.id) {
    const parsed = Number(options.id);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write(`--id must be a positive number, got: ${options.id}\n`);
      process.exit(2);
    }
    githubId = parsed;
  } else {
    // `--user` resolves a login → numeric id via GitHub; the bare form resolves
    // the authenticated user via /user. Both paths need a token.
    const token = resolveToken();
    if (!token) exitWithTokenError();
    const user = options.user
      ? await fetchGitHubUserByLogin(options.user, token)
      : await fetchGitHubMe(token);
    githubId = user.id;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/topics/by-user/${githubId}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    process.stderr.write(`Network error listing topics: ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`${await describeHttpError(response)}\n`);
    process.exit(1);
  }

  const body = await response.text();
  process.stdout.write(body);
  if (!body.endsWith('\n')) process.stdout.write('\n');
}

// ============================================================================
// Command wiring
// ============================================================================

export function createTopicCommand(): Command {
  const command = new Command('topic');

  command.description('Create or browse topics — curated collections of trails on web-ade');

  command
    .command('create')
    .description('Create a new topic')
    .requiredOption('--title <title>', 'Topic title (≤200 chars)')
    .option('--description <text>', 'Topic description, markdown (≤8000 chars)')
    .option(
      '--trail <id-or-url>',
      'Initial trail id or URL; pass repeatedly to seed multiple trails',
      (value: string, prev: string[] = []) => [...prev, value],
      [] as string[],
    )
    .action(async (options: CreateOptions) => {
      await createTopic(options);
    });

  command
    .command('add-trail')
    .description('Append a trail to a topic')
    .argument('<topic-id-or-url>', 'Topic id or URL')
    .argument('<trail-id-or-url>', 'Trail id or URL to add')
    .action(async (topicArg: string, trailArg: string) => {
      await addTrailToTopic(topicArg, trailArg);
    });

  command
    .command('view')
    .description('Print a topic JSON to stdout')
    .argument('<id-or-url>', 'Topic id or URL')
    .action(async (input: string) => {
      await viewTopic(input);
    });

  command
    .command('list')
    .description('List topics owned by a user (defaults to the authenticated user)')
    .option('--user <login>', 'GitHub login to list topics for (resolves to numeric id)')
    .option('--id <githubId>', 'GitHub numeric user id (skips the lookup)')
    .action(async (options: ListOptions) => {
      await listTopics(options);
    });

  return command;
}
