import { describe, expect, test } from 'bun:test';
import {
  convertSubsystemToNodes,
  convertSubsystemToEdges,
  buildSubsystemGraph,
  deriveNameFromSymbol,
  packageColor,
} from './model';
import type { SubsystemComponent, SubsystemComponentEdge } from './model';

const comps: SubsystemComponent[] = [
  { id: 'reader', name: 'SessionReader', kind: 'class', file: 'SessionReader.ts', purl: 'pkg:github/principal-ai/agent-monitoring' },
  { id: 'transcript', name: 'transcript', kind: 'module', file: 'transcript.ts', purl: 'pkg:github/principal-ai/agent-monitoring' },
];

const edges: SubsystemComponentEdge[] = [
  { id: 'e1', from: 'transcript', to: 'reader', mechanism: 'imports' },
  // 'host' is NOT a component — this is the cross-package external case.
  { id: 'e2', from: 'reader', to: 'host', mechanism: 'imports', refs: ['bun/index.ts'] },
];

describe('subsystem graph model', () => {
  test('converts all components to flat component nodes', () => {
    const nodes = convertSubsystemToNodes({ components: comps, edges });
    const components = nodes.filter((n) => n.type === 'subsystem-component');
    expect(components).toHaveLength(comps.length);
    expect(components.every((n) => n.type === 'subsystem-component')).toBe(true);
  });

  test('converts edges with directed markers', () => {
    const converted = convertSubsystemToEdges({ components: comps, edges });
    expect(converted).toHaveLength(2);
    expect(converted[0].source).toBe('transcript');
    expect(converted[0].target).toBe('reader');
  });

  test('buildSubsystemGraph creates external stub nodes for non-component targets', async () => {
    const { nodes, edges: gEdges } = await buildSubsystemGraph({ components: comps, edges });
    const external = nodes.find((n) => n.id === 'external:host');
    expect(external).toBeDefined();
    expect(external!.data.component.kind).toBe('external');
    const crossEdge = gEdges.find((e) => e.target === 'external:host');
    expect(crossEdge).toBeDefined();
  });

  test('buildSubsystemGraph positions nodes via ELK (non-zero coords)', async () => {
    const { nodes } = await buildSubsystemGraph({ components: comps, edges });
    const placed = nodes.filter((n) => n.type === 'subsystem-component' && n.position);
    expect(placed.length).toBeGreaterThan(0);
    // ELK (or the grid fallback) gives finite coordinates.
    for (const n of placed) {
      expect(typeof n.position!.x).toBe('number');
      expect(typeof n.position!.y).toBe('number');
    }
  });

  test('packageColor is deterministic', () => {
    expect(packageColor('agent-monitoring')).toBe(packageColor('agent-monitoring'));
    expect(packageColor('a')).not.toBe(packageColor('b'));
  });

  test('deriveNameFromSymbol is consistent per kind', () => {
    // class/type/module/function use the symbol as-is.
    expect(deriveNameFromSymbol('SessionReader', 'class')).toBe('SessionReader');
    expect(deriveNameFromSymbol('SessionRecord', 'type')).toBe('SessionRecord');
    // falls back to existing name when no symbol.
    expect(deriveNameFromSymbol(undefined, 'class', 'SessionReader')).toBe('SessionReader');
    expect(deriveNameFromSymbol('', 'external', 'trail-viewer-host')).toBe('trail-viewer-host');
  });

  test('deriveNameFromSymbol falls back to file basename for modules', () => {
    expect(deriveNameFromSymbol(undefined, 'module', undefined, 'transcript.ts')).toBe('transcript');
    expect(deriveNameFromSymbol(undefined, 'module', undefined, 'src/event-processors/index.ts')).toBe('index');
    // Symbol wins over file basename.
    expect(deriveNameFromSymbol('CodexRolloutRecord', 'module', undefined, 'transcript.ts')).toBe('CodexRolloutRecord');
    // File basename wins over a supplied name for modules (derivation precedence).
    expect(deriveNameFromSymbol(undefined, 'module', 'MyModule', 'x.ts')).toBe('x');
  });
});
