import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuxiliaryManifestValidator } from './AuxiliaryManifestValidator';
import type { AuxiliaryManifest } from '../types/auxiliary';

function makeRepo(layout: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'aux-manifest-'));
  for (const rel of layout) {
    const full = join(root, rel);
    mkdirSync(full.substring(0, full.lastIndexOf('/')) || full, { recursive: true });
    if (!rel.endsWith('/')) writeFileSync(full, '');
  }
  return root;
}

describe('AuxiliaryManifestValidator', () => {
  const validator = new AuxiliaryManifestValidator();

  test('no manifest is a no-op', () => {
    const result = validator.validate({ basePath: '/tmp' });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('passes for a clean manifest', () => {
    const root = makeRepo(['docs/README.md', '.github/workflows/ci.yml']);
    const manifest: AuxiliaryManifest = {
      areas: [
        { name: 'Documentation', paths: ['docs'], description: 'design docs' },
        { name: 'GitHub', paths: ['.github'], description: 'CI config' },
      ],
    };
    const result = validator.validate({ manifest, basePath: root });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('flags duplicate area names', () => {
    const root = makeRepo(['docs/README.md', 'misc/note.txt']);
    const manifest: AuxiliaryManifest = {
      areas: [
        { name: 'Docs', paths: ['docs'], description: 'a' },
        { name: 'Docs', paths: ['misc'], description: 'b' },
      ],
    };
    const result = validator.validate({ manifest, basePath: root });
    const dup = result.violations.find((v) => v.ruleId === 'auxiliary-area-name-duplicate');
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe('error');
    expect(result.valid).toBe(false);
  });

  test('warns when a declared path does not exist', () => {
    const root = makeRepo(['docs/README.md']);
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'Ghost', paths: ['nope'], description: 'missing' }],
    };
    const result = validator.validate({ manifest, basePath: root });
    const missing = result.violations.find((v) => v.ruleId === 'auxiliary-area-path-missing');
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe('warn');
    // Warnings alone don't invalidate the manifest
    expect(result.valid).toBe(true);
  });

  test('flags overlap between two areas', () => {
    const root = makeRepo(['docs/sub/file.md']);
    const manifest: AuxiliaryManifest = {
      areas: [
        { name: 'A', paths: ['docs'], description: 'a' },
        { name: 'B', paths: ['docs/sub'], description: 'b' },
      ],
    };
    const result = validator.validate({ manifest, basePath: root });
    const overlap = result.violations.find((v) => v.ruleId === 'auxiliary-area-paths-overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.severity).toBe('error');
    expect(result.valid).toBe(false);
  });

  test('flags duplicate paths within a single area as self-overlap', () => {
    const root = makeRepo(['docs/file.md']);
    const manifest: AuxiliaryManifest = {
      areas: [{ name: 'A', paths: ['docs', 'docs'], description: 'a' }],
    };
    const result = validator.validate({ manifest, basePath: root });
    const self = result.violations.find((v) => v.ruleId === 'auxiliary-area-paths-self-overlap');
    expect(self).toBeDefined();
  });
});
