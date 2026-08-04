import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname, isAbsolute as pathIsAbsolute, relative, resolve } from "node:path";
import os from "node:os";
import type {
  PathNormalizationAdapter,
  RepositoryInfo,
  SystemInfo,
} from "@principal-ai/agent-monitoring";

/**
 * NodePathNormalizationAdapter — a Node.js implementation of the
 * `PathNormalizationAdapter` interface from `@principal-ai/agent-monitoring`.
 *
 * This is the shared, agent-agnostic adapter used by the CLI's `agent-session`
 * command. It discovers git roots by walking up directories and enriches them
 * with git metadata via the `git` CLI (spawnSync). It keeps the same interface
 * so `PathNormalizationService` can be shared verbatim. It is the Node.js
 * analogue of the trail-viewer's `BunNormalizationAdapter` and the desktop
 * app's `ServerPathNormalizationAdapter`.
 */
function gitCommand(cwd: string, subcommand: string): string | undefined {
  const result = spawnSync("git", ["-C", cwd, ...subcommand.split(" ")], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  });
  if (result.status !== 0 || !result.stdout) return undefined;
  return result.stdout.trim() || undefined;
}

/** Basic GitHub owner/repo extraction from a remote URL. */
function githubIdentityFromRemoteUrl(remoteUrl: string): {
  owner: string;
  name: string;
} | null {
  const cleaned = remoteUrl
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return { owner: parts[0], name: parts[1] };
  }
  return null;
}

export class NodePathNormalizationAdapter implements PathNormalizationAdapter {
  private homeDir: string;
  private gitRootCache = new Map<string, string | null>();
  private knownRoots: Map<string, RepositoryInfo>;
  /** Roots discovered via .git walk-up that weren't in the initial knownRoots */
  readonly newlyDiscovered: RepositoryInfo[] = [];

  constructor(knownRoots?: Map<string, RepositoryInfo>) {
    this.homeDir = os.homedir();
    this.knownRoots = knownRoots ?? new Map();
  }

  async getRawRepositoryInfo(
    absolutePath: string,
  ): Promise<RepositoryInfo | null> {
    // Fast path: prefix-match against known roots (zero I/O)
    let bestMatch: RepositoryInfo | null = null;
    let bestLen = 0;
    for (const [root, info] of this.knownRoots) {
      if (absolutePath.startsWith(root) && root.length > bestLen) {
        bestMatch = info;
        bestLen = root.length;
      }
    }
    if (bestMatch) return bestMatch;

    const gitRoot = await this.findGitRoot(absolutePath);
    if (!gitRoot) return null;

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
    if (!this.knownRoots.has(gitRoot)) {
      this.knownRoots.set(gitRoot, info);
      this.newlyDiscovered.push(info);
    }
    return info;
  }

  private async findGitRoot(dir: string): Promise<string | null> {
    const cached = this.gitRootCache.get(dir);
    if (cached !== undefined) return cached;
    try {
      const s = await fs.stat(resolve(dir, ".git"));
      if (s.isDirectory() || s.isFile()) {
        this.gitRootCache.set(dir, dir);
        return dir;
      }
    } catch {
      // not a git root; walk up
    }
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
    return pathIsAbsolute(path);
  }

  getRelativePath(fromPath: string, toPath: string): string {
    return relative(fromPath, toPath);
  }

  isAvailable(): boolean {
    return true;
  }
}
