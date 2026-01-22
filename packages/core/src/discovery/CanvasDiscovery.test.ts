import { describe, expect, test, beforeEach } from 'bun:test';
import { CanvasDiscovery } from './CanvasDiscovery';
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
      expect((result.canvases[0] as any).content).toEqual(mockCanvas);
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
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('.principal-views/bad.canvas');
    });

    test('ignores canvas files in __executions__ directory', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/__executions__/should-ignore.canvas',
        '.principal-views/should-include.canvas',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.canvases).toHaveLength(1);
      expect(result.canvases[0].basename).toBe('should-include');
    });
  });

  describe('discover() - Execution Files', () => {
    test('discovers execution files in .principal-views/__executions__', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/__executions__/test-run.otel.json',
        '.principal-views/__executions__/api-test.otel.json',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.executions).toHaveLength(2);
      expect(result.executions[0]).toMatchObject({
        id: 'api-test',
        type: 'otel',
        canvasBasename: 'api-test',
        scope: 'root',
      });
      expect(result.executions[1]).toMatchObject({
        id: 'test-run',
        type: 'otel',
        canvasBasename: 'test-run',
        scope: 'root',
      });
    });

    test('discovers execution files in packages with package prefix', async () => {
      const fileTree = createMockFileTree([
        'packages/core/.principal-views/__executions__/auth.otel.json',
        'packages/api/.principal-views/__executions__/request.otel.json',
        'packages/core/package.json',
        'packages/api/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.includes('core/package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          if (path.includes('api/package.json')) {
            return JSON.stringify({ name: 'api' });
          }
          return '';
        },
      });

      expect(result.executions).toHaveLength(2);
      expect(result.executions.map(e => e.id)).toEqual([
        'api/request',
        'core/auth',
      ]);
    });

    test('discovers execution files in root __executions__', async () => {
      const fileTree = createMockFileTree([
        '__executions__/integration-test.otel.json',
      ]);

      const result = await discovery.discover(fileTree);

      expect(result.executions).toHaveLength(1);
      expect(result.executions[0]).toMatchObject({
        id: 'integration-test',
        scope: 'root',
      });
    });

    test('only discovers .otel.json execution files', async () => {
      const fileTree = createMockFileTree([
        '__executions__/test.spans.json',
        '__executions__/test.execution.json',
        '__executions__/test.events.json',
        '__executions__/test.otel.json',
      ]);

      const result = await discovery.discover(fileTree);

      // Only .otel.json files should be discovered
      expect(result.executions).toHaveLength(1);
      expect(result.executions[0]).toMatchObject({
        id: 'test',
        type: 'otel',
        canvasBasename: 'test',
      });
    });
  });

  describe('findCanvasForExecution()', () => {
    test('finds matching canvas in same scope', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/test-flow.otel.canvas',
        '.principal-views/__executions__/test-flow.otel.json',
      ]);

      const result = await discovery.discover(fileTree);
      const execution = result.executions[0];

      const canvas = discovery.findCanvasForExecution(execution, result.canvases);

      expect(canvas).toBeTruthy();
      expect(canvas?.basename).toBe('test-flow');
    });

    test('finds matching canvas in same package', async () => {
      const fileTree = createMockFileTree([
        'packages/core/.principal-views/auth.otel.canvas',
        'packages/core/.principal-views/__executions__/auth.spans.json',
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

      const execution = result.executions[0];
      const canvas = discovery.findCanvasForExecution(execution, result.canvases);

      expect(canvas).toBeTruthy();
      expect(canvas?.packageName).toBe('core');
    });

    test('does not match canvas in different package', async () => {
      const fileTree = createMockFileTree([
        'packages/core/.principal-views/auth.canvas',
        'packages/api/.principal-views/__executions__/auth.spans.json',
        'packages/core/package.json',
        'packages/api/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.includes('core/package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          if (path.includes('api/package.json')) {
            return JSON.stringify({ name: 'api' });
          }
          return '';
        },
      });

      const execution = result.executions[0];
      const canvas = discovery.findCanvasForExecution(execution, result.canvases);

      // Should not find match (different packages)
      expect(canvas).toBeNull();
    });
  });

  describe('findExecutionsForCanvas()', () => {
    test('finds all executions for a canvas', async () => {
      const fileTree = createMockFileTree([
        '.principal-views/test-flow.otel.canvas',
        '.principal-views/__executions__/test-flow.spans.json',
        '.principal-views/__executions__/test-flow.execution.json',
      ]);

      const result = await discovery.discover(fileTree);
      const canvas = result.canvases[0];

      const executions = discovery.findExecutionsForCanvas(canvas, result.executions);

      expect(executions).toHaveLength(2);
      expect(executions.every(e => e.canvasBasename === 'test-flow')).toBe(true);
    });

    test('only returns executions in same package', async () => {
      const fileTree = createMockFileTree([
        'packages/core/.principal-views/auth.canvas',
        'packages/core/.principal-views/__executions__/auth.spans.json',
        'packages/api/.principal-views/__executions__/auth.spans.json',
        'packages/core/package.json',
        'packages/api/package.json',
      ]);

      const result = await discovery.discover(fileTree, {
        fileReader: async (path) => {
          if (path.includes('core/package.json')) {
            return JSON.stringify({ name: 'core' });
          }
          if (path.includes('api/package.json')) {
            return JSON.stringify({ name: 'api' });
          }
          return '';
        },
      });

      const canvas = result.canvases.find(c => c.packageName === 'core')!;
      const executions = discovery.findExecutionsForCanvas(canvas, result.executions);

      expect(executions).toHaveLength(1);
      expect(executions[0].packageName).toBe('core');
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
