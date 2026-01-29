import { describe, expect, test, beforeEach } from 'bun:test';
import { CanvasDiscovery } from './CanvasDiscovery';
import type { DiscoveredCanvasWithContent } from './types';
import type { FileTree, FileInfo, DirectoryInfo } from '@principal-ai/repository-abstraction';

describe('CanvasDiscovery', () => {
  let discovery: CanvasDiscovery;

  beforeEach(() => {
    discovery = new CanvasDiscovery();
  });

  describe('discover() - Canvas Files', () => {
    test('discovers canvas files in repository root', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/my-flow.canvas',
        '.principal-views/api-flow.otel.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(2);
      expect(result.canvases[0]).toMatchObject({
        id: 'api-flow',
        name: 'Api Flow',
        basename: 'api-flow',
        type: 'otel',
        scope: 'root',
        packageName: undefined,
      });
      expect(result.canvases[1]).toMatchObject({
        id: 'my-flow',
        name: 'My Flow',
        basename: 'my-flow',
        type: 'regular',
        scope: 'root',
      });
    });

    test('discovers canvas files in packages with package prefix', async () => {
      const fileTree = createMockFileTree([
        'packages/core/.principal-views/auth-flow.canvas',
        'packages/api/.principal-views/request-flow.otel.canvas',
        'packages/core/package.json',
        'packages/api/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.endsWith('core/package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          if (path.endsWith('api/package.json')) {
            return JSON.stringify({ name: 'api' });
          }
          return '';
        },
      });

      expect(result.canvases).toHaveLength(2);
      expect(result.canvases.map(c => c.id)).toEqual([
        'api/request-flow',
        'core/auth-flow',
      ]);
      expect(result.canvases[0].packageName).toBe('api');
      expect(result.canvases[1].packageName).toBe('core');
    });

    test('handles mixed root and package canvas files', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/root-flow.canvas',
        'packages/core/.principal-views/core-flow.canvas',
        'packages/core/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.endsWith('package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          return '';
        },
      });

      expect(result.canvases).toHaveLength(2);
      // Package canvases come first
      expect(result.canvases[0].id).toBe('core/core-flow');
      expect(result.canvases[0].scope).toBe('package');
      expect(result.canvases[1].id).toBe('root-flow');
      expect(result.canvases[1].scope).toBe('root');
    });

    test('correctly strips .otel.canvas extension', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/test.otel.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases[0].basename).toBe('test');
      expect(result.canvases[0].type).toBe('otel');
      expect(result.canvases[0].id).toBe('test');
    });

    test('parses canvas content when fileReader and includeContent provided', async () => {
      const mockCanvas = { nodes: [], edges: [], pv: { name: 'Test' } };
      const fileTree = createMockFileTree([
        '.principal-views/test.canvas',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (_path) => JSON.stringify(mockCanvas),
        includeContent: true,
      });

      expect(result.canvases[0]).toHaveProperty('content');
      expect((result.canvases[0] as DiscoveredCanvasWithContent).content).toEqual(mockCanvas);
    });

    test('handles parse errors gracefully', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/bad.canvas',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (_path) => 'invalid json',
        includeContent: true,
      });

      expect(result.canvases).toHaveLength(1);
      expect(result.errors).toHaveLength(2); // Parse error + deprecation error for flat structure
      expect(result.errors.some(e => e.path === '.principal-views/bad.canvas' && e.error.includes('JSON'))).toBe(true);
      expect(result.errors.some(e => e.path === '.principal-views/bad.canvas' && e.error.includes('DEPRECATED'))).toBe(true);
    });

  });

  describe('caching', () => {
    test('caches package discovery by fileTree SHA', async () => {
      const fileTree = createMockFileTree([
        'packages/core/package.json',
      ]);

      let readCount = 0;
      const fileReader = async (_path: string) => {
        readCount++;
        return JSON.stringify({ name: 'core' });
      };

      // First call
      await discovery.discover(fileTree, { fileReader });
      const firstCount = readCount;

      // Second call with same SHA
      await discovery.discover(fileTree, { fileReader });
      const secondCount = readCount;

      // Should not re-read package.json (cached)
      expect(secondCount).toBe(firstCount);
    });

    test('clearCache() invalidates package cache', async () => {
      const fileTree = createMockFileTree([
        'packages/core/package.json',
      ]);

      let readCount = 0;
      const fileReader = async (_path: string) => {
        readCount++;
        return JSON.stringify({ name: 'core' });
      };

      await discovery.discover(fileTree, { fileReader });
      const firstCount = readCount;

      discovery.clearCache();

      await discovery.discover(fileTree, { fileReader });
      const secondCount = readCount;

      // Should re-read after cache clear
      expect(secondCount).toBeGreaterThan(firstCount);
    });
  });

  describe('sorting', () => {
    test('sorts package canvases before root canvases', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/zzz-root.canvas',
        'packages/aaa/.principal-views/pkg.canvas',
        'packages/aaa/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.includes('package.json')) {
            return JSON.stringify({ name: 'aaa' });
          }
          return '';
        },
      });

      expect(result.canvases[0].id).toBe('aaa/pkg');
      expect(result.canvases[1].id).toBe('zzz-root');
    });

    test('sorts packages alphabetically', async () => {
      const fileTree = createMockFileTree([
        'packages/zzz/.principal-views/file.canvas',
        'packages/aaa/.principal-views/file.canvas',
        'packages/zzz/package.json',
        'packages/aaa/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.includes('zzz/package.json')) {
            return JSON.stringify({ name: 'zzz' });
          }
          if (path.includes('aaa/package.json')) {
            return JSON.stringify({ name: 'aaa' });
          }
          return '';
        },
      });

      expect(result.canvases[0].id).toBe('aaa/file');
      expect(result.canvases[1].id).toBe('zzz/file');
    });
  });

  describe('edge cases', () => {
    test('handles empty file tree', async () => {
      const fileTree = createMockFileTree([]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(0);
      expect(result.executions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test('handles files without extensions', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/noextension',
        '__executions__/noextension',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(0);
      expect(result.executions).toHaveLength(0);
    });
  });
});

/**
 * Helper to create mock FileTree for testing
 */
function createMockFileTree(paths: string[]): FileTree {
  const allFiles: FileInfo[] = paths.map(path => ({
    path,
    relativePath: path,
    name: path.split('/').pop() || '',
    extension: path.split('.').pop() || '',
    size: 100,
    lastModified: new Date(),
    isDirectory: false,
  }));

  const root: DirectoryInfo = {
    path: '/',
    name: '',
    relativePath: '',
    children: [],
    fileCount: allFiles.length,
    totalSize: allFiles.length * 100,
    depth: 0,
  };

  return {
    sha: 'test-sha-' + Math.random(),
    root,
    allFiles,
    allDirectories: [],
    stats: {
      totalFiles: allFiles.length,
      totalDirectories: 0,
      totalSize: allFiles.length * 100,
      maxDepth: 3,
    },
    metadata: {
      id: 'test',
      timestamp: new Date(),
      sourceType: 'test',
      sourceInfo: {},
    },
  };
}
