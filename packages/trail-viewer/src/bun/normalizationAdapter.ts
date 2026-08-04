import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import os from "node:os";
import type { PathNormalizationAdapter, SystemInfo, RepositoryInfo } from "@principal-ai/agent-monitoring";
import { githubIdentityFromRemoteUrl } from "./alexandria";

function gitCommand(gitRoot: string, subcommand: string): string | undefined {
  const result = spawnSync("git", ["-C", gitRoot, ...subcommand.split(" ")],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
  if (result.status !== 0) return undefined;
  return result.stdout?.trim() || undefined;
}

export class BunNormalizationAdapter implements PathNormalizationAdapter {
  private homeDir: string;
  private gitRootCache = new Map<string, string | null>();
  private knownRoots: Map<string, RepositoryInfo>;
  /** Roots discovered via .git walk-up that weren't in the Alexandria cache */
  readonly newlyDiscovered: RepositoryInfo[] = [];

  constructor(knownRoots?: Map<string, RepositoryInfo>) {
    this.homeDir = os.homedir();
    this.knownRoots = knownRoots ?? new Map();
  }

  async getRawRepositoryInfo(absolutePath: string): Promise<RepositoryInfo | null> {
    // Canonicalize the input: strip trailing slashes and collapse redundant
    // separators (e.g. a tool that reads a directory as "/repo/" vs "/repo").
    // findGitRoot returns its input verbatim when it IS the git root, so an
    // uncanonical input would surface the same repo under two distinct root
    // strings and duplicate it in the session's repo list. NOTE: use resolve,
    // not normalize — path.normalize preserves trailing slashes.
    const target = resolve(absolutePath);

    // Fast path: prefix-match against known Alexandria roots (zero I/O).
    // Match on a path boundary so sibling dirs (/repo vs /repo2) don't collide.
    let bestMatch: RepositoryInfo | null = null;
    let bestLen = 0;
    for (const [root, info] of this.knownRoots) {
      const rootCanon = resolve(root);
      if ((target === rootCanon || target.startsWith(`${rootCanon}/`)) && rootCanon.length > bestLen) {
        bestMatch = info;
        bestLen = rootCanon.length;
      }
    }
    if (bestMatch) return bestMatch;

    // Fall through to .git walk-up
    const gitRoot = await this.findGitRoot(target);
    if (!gitRoot) return null;

    // Enrich with git metadata
    const remoteUrl = gitCommand(gitRoot, "remote get-url origin");
    const branch = gitCommand(gitRoot, "rev-parse --abbrev-ref HEAD");
    const headCommit = gitCommand(gitRoot, "rev-parse HEAD");

    let owner: string | undefined;
    let repo: string | undefined;
    if (remoteUrl) {
      const identity = githubIdentityFromRemoteUrl(remoteUrl);
      if (identity) {
        owner = identity.owner;
        repo = identity.name;
      }
    }
    if (!repo) {
      const parts = gitRoot.replace(/\/+$/, "").split("/");
      repo = parts[parts.length - 1] ?? undefined;
    }

    const info: RepositoryInfo = {
      root: gitRoot,
      remoteUrl,
      owner,
      repo,
      branch,
      headCommit,
    };

    // Auto-cache: if this root isn't in knownRoots, track for registration
    if (!this.knownRoots.has(gitRoot)) {
      this.newlyDiscovered.push(info);
      this.knownRoots.set(gitRoot, info);
    }

    return info;
  }

  private async findGitRoot(dir: string): Promise<string | null> {
    const cached = this.gitRootCache.get(dir);
    if (cached !== undefined) return cached;

    try {
      const s = await fs.stat(join(dir, ".git"));
      if (s.isDirectory() || s.isFile()) {
        this.gitRootCache.set(dir, dir);
        return dir;
      }
    } catch {}

    const parent = dirname(dir);
    if (parent === dir || parent.length >= dir.length) {
      this.gitRootCache.set(dir, null);
      return null;
    }

    const result = await this.findGitRoot(parent);
    this.gitRootCache.set(dir, result);
    return result;
  }

  getSystemInfo(): SystemInfo {
    return {
      homeDir: this.homeDir,
      pathSeparator: "/",
      platform: process.platform,
      machineId: "",
    };
  }

  resolvePath(relativePath: string, workingDirectory: string): string {
    return resolve(workingDirectory, relativePath);
  }

  isAbsolutePath(path: string): boolean {
    return path.startsWith("/");
  }

  getRelativePath(fromPath: string, toPath: string): string {
    return relative(fromPath, toPath);
  }

  isAvailable(): boolean {
    return true;
  }
}
