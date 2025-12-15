import { describe, it, expect } from 'bun:test';
import { PathBasedEventProcessor, type LogEntry } from './PathBasedEventProcessor';
import type { PathBasedGraphConfiguration } from './types/path-based-config';

describe('PathBasedEventProcessor', () => {
  // Sample configuration
  const sampleConfig: PathBasedGraphConfiguration = {
    metadata: {
      name: 'Test System',
      version: '1.0.0',
    },
    nodeTypes: {
      'lock-manager': {
        shape: 'rectangle',
        icon: 'lock',
        color: '#3b82f6',
        dataSchema: {},
        sources: ['lib/lock-manager.ts', 'lib/branch-aware-lock-manager.ts'],
      },
      'github-api': {
        shape: 'hexagon',
        icon: 'github',
        color: '#22c55e',
        dataSchema: {},
        sources: ['lib/github-api-client.ts', 'services/github/*.ts'],
      },
      'request-handler': {
        shape: 'rectangle',
        icon: 'server',
        color: '#f59e0b',
        dataSchema: {},
        sources: ['app/**/*.ts'],
      },
    },
    edgeTypes: {},
    allowedConnections: [],
  };

  describe('Milestone 1: Basic path-based association', () => {
    it('should associate log with component by exact path match', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const log: LogEntry = {
        message: 'Lock acquired',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 42,
          },
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('component-activity');
      const activityEvent = events[0] as any;
      expect(activityEvent.componentId).toBe('lock-manager');
      expect(activityEvent.level).toBe('info');
      expect(activityEvent.message).toBe('Lock acquired');
    });

    it('should associate log with component by glob pattern match', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const log: LogEntry = {
        message: 'GitHub API call',
        metadata: {
          timestamp: Date.now(),
          level: 'debug',
          source: {
            file: 'services/github/client.ts',
            line: 10,
          },
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      const activityEvent = events[0] as any;
      expect(activityEvent.componentId).toBe('github-api');
    });

    it('should associate log with component using ** wildcard', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const log: LogEntry = {
        message: 'Request received',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'app/handlers/webhook.ts',
            line: 5,
          },
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      const activityEvent = events[0] as any;
      expect(activityEvent.componentId).toBe('request-handler');
    });

    it('should return empty array for logs without source', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const log: LogEntry = {
        message: 'No source info',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
        },
      };

      const events = processor.processLog(log);
      expect(events).toHaveLength(0);
    });

    it('should return empty array for logs that do not match any component', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const log: LogEntry = {
        message: 'Unmatched log',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'test/foo.ts',
            line: 1,
          },
        },
      };

      const events = processor.processLog(log);
      expect(events).toHaveLength(0);
    });

    it('should preserve log level in activity event', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const levels = ['debug', 'info', 'warn', 'error'] as const;

      for (const level of levels) {
        const log: LogEntry = {
          message: `${level} message`,
          metadata: {
            timestamp: Date.now(),
            level,
            source: {
              file: 'lib/lock-manager.ts',
              line: 1,
            },
          },
        };

        const events = processor.processLog(log);
        expect(events).toHaveLength(1);
        const activityEvent = events[0] as any;
        expect(activityEvent.level).toBe(level);
      }
    });

    it('should batch process multiple logs', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const logs: LogEntry[] = [
        {
          message: 'Log 1',
          metadata: {
            timestamp: Date.now(),
            level: 'info',
            source: { file: 'lib/lock-manager.ts' },
          },
        },
        {
          message: 'Log 2',
          metadata: {
            timestamp: Date.now(),
            level: 'info',
            source: { file: 'lib/github-api-client.ts' },
          },
        },
        {
          message: 'Log 3',
          metadata: {
            timestamp: Date.now(),
            level: 'warn',
            source: { file: 'app/main.ts' },
          },
        },
      ];

      const events = processor.processLogs(logs);
      expect(events).toHaveLength(3);
      expect((events[0] as any).componentId).toBe('lock-manager');
      expect((events[1] as any).componentId).toBe('github-api');
      expect((events[2] as any).componentId).toBe('request-handler');
    });
  });

  describe('Milestone 2: Action pattern matching', () => {
    const configWithActions: PathBasedGraphConfiguration = {
      ...sampleConfig,
      pathBasedConfig: {
        enableActionPatterns: true,
      },
      nodeTypes: {
        ...sampleConfig.nodeTypes,
        'lock-manager': {
          ...sampleConfig.nodeTypes['lock-manager'],
          actions: [
            {
              pattern: 'Lock acquired for (?<lockId>\\S+)',
              event: 'lock_acquired',
              state: 'acquired',
              metadata: {
                lockId: '$lockId',
              },
            },
            {
              pattern: 'Lock released',
              event: 'lock_released',
              state: 'idle',
            },
          ],
        },
      },
    };

    it('should match action pattern and extract metadata', () => {
      const processor = new PathBasedEventProcessor(configWithActions);

      const log: LogEntry = {
        message: 'Lock acquired for branch-123',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 42,
          },
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('component-action');
      const actionEvent = events[0] as any;
      expect(actionEvent.componentId).toBe('lock-manager');
      expect(actionEvent.action).toBe('lock_acquired');
      expect(actionEvent.state).toBe('acquired');
      expect(actionEvent.metadata).toEqual({ lockId: 'branch-123' });
    });

    it('should fall back to activity event when no pattern matches', () => {
      const processor = new PathBasedEventProcessor(configWithActions);

      const log: LogEntry = {
        message: 'Random log message',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 42,
          },
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('component-activity');
    });

    it('should match pattern without metadata extraction', () => {
      const processor = new PathBasedEventProcessor(configWithActions);

      const log: LogEntry = {
        message: 'Lock released',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 50,
          },
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      const actionEvent = events[0] as any;
      expect(actionEvent.type).toBe('component-action');
      expect(actionEvent.action).toBe('lock_released');
      expect(actionEvent.state).toBe('idle');
    });
  });

  describe('Edge activation (Milestone 2)', () => {
    const configWithEdges: PathBasedGraphConfiguration = {
      ...sampleConfig,
      pathBasedConfig: {
        enableActionPatterns: true,
      },
      nodeTypes: {
        ...sampleConfig.nodeTypes,
        'lock-manager': {
          ...sampleConfig.nodeTypes['lock-manager'],
          actions: [
            {
              pattern: 'Lock acquired',
              event: 'lock_acquired',
              state: 'acquired',
            },
          ],
        },
      },
      edgeTypes: {
        'lock-request': {
          style: 'solid',
          activatedBy: [
            {
              action: 'lock_acquired',
              animation: 'flow',
              direction: 'forward',
              duration: 2000,
            },
          ],
        },
      },
    };

    it('should trigger edge animation when action matches', () => {
      const processor = new PathBasedEventProcessor(configWithEdges);

      const log: LogEntry = {
        message: 'Lock acquired',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 42,
          },
        },
      };

      const events = processor.processLog(log);

      // Should have both component action and edge animation
      expect(events.length).toBeGreaterThanOrEqual(1);

      const actionEvent = events.find((e) => e.type === 'component-action');
      expect(actionEvent).toBeDefined();

      const edgeEvent = events.find((e) => e.type === 'edge-animation') as any;
      expect(edgeEvent).toBeDefined();
      expect(edgeEvent?.edgeId).toBe('lock-request');
      expect(edgeEvent?.animation).toBe('flow');
      expect(edgeEvent?.direction).toBe('forward');
    });
  });

  describe('Validation', () => {
    it('should detect overlapping source patterns', () => {
      const configWithOverlap: PathBasedGraphConfiguration = {
        ...sampleConfig,
        nodeTypes: {
          'comp-a': {
            shape: 'rectangle',
            dataSchema: {},
            sources: ['lib/*.ts'],
          },
          'comp-b': {
            shape: 'circle',
            dataSchema: {},
            sources: ['lib/*.ts'], // Same pattern!
          },
        },
      };

      const processor = new PathBasedEventProcessor(configWithOverlap);
      const issues = processor.validate();

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe('warning');
      expect(issues[0].message).toContain('both use pattern');
    });

    it('should detect invalid regex patterns', () => {
      const configWithBadRegex: PathBasedGraphConfiguration = {
        ...sampleConfig,
        nodeTypes: {
          'lock-manager': {
            ...sampleConfig.nodeTypes['lock-manager'],
            actions: [
              {
                pattern: '[invalid(regex', // Invalid regex
                event: 'test',
              },
            ],
          },
        },
      };

      const processor = new PathBasedEventProcessor(configWithBadRegex);
      const issues = processor.validate();

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === 'error')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);
      const stats = processor.getStats();

      expect(stats.totalComponents).toBe(3);
      expect(stats.componentsWithSources).toBe(3);
      expect(stats.totalSourcePatterns).toBe(5); // Sum of all source patterns
    });
  });

  describe('Instance ID support', () => {
    it('should include instanceId in activity event when provided', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const log: LogEntry = {
        message: 'Client connected',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 42,
          },
          instanceId: 'client-1',
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('component-activity');
      const activityEvent = events[0] as any;
      expect(activityEvent.componentId).toBe('lock-manager');
      expect(activityEvent.instanceId).toBe('client-1');
    });

    it('should have undefined instanceId when not provided', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const log: LogEntry = {
        message: 'Client connected',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 42,
          },
          // No instanceId
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      const activityEvent = events[0] as any;
      expect(activityEvent.instanceId).toBeUndefined();
    });

    it('should include instanceId in action event when provided', () => {
      const configWithActions: PathBasedGraphConfiguration = {
        ...sampleConfig,
        pathBasedConfig: {
          enableActionPatterns: true,
        },
        nodeTypes: {
          ...sampleConfig.nodeTypes,
          'lock-manager': {
            ...sampleConfig.nodeTypes['lock-manager'],
            actions: [
              {
                pattern: 'Lock acquired',
                event: 'lock_acquired',
                state: 'acquired',
              },
            ],
          },
        },
      };

      const processor = new PathBasedEventProcessor(configWithActions);

      const log: LogEntry = {
        message: 'Lock acquired',
        metadata: {
          timestamp: Date.now(),
          level: 'info',
          source: {
            file: 'lib/lock-manager.ts',
            line: 42,
          },
          instanceId: 'lock-manager-primary',
        },
      };

      const events = processor.processLog(log);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('component-action');
      const actionEvent = events[0] as any;
      expect(actionEvent.componentId).toBe('lock-manager');
      expect(actionEvent.instanceId).toBe('lock-manager-primary');
    });

    it('should preserve instanceId across batch processing', () => {
      const processor = new PathBasedEventProcessor(sampleConfig);

      const logs: LogEntry[] = [
        {
          message: 'Log from client 1',
          metadata: {
            timestamp: Date.now(),
            level: 'info',
            source: { file: 'lib/lock-manager.ts' },
            instanceId: 'client-1',
          },
        },
        {
          message: 'Log from client 2',
          metadata: {
            timestamp: Date.now(),
            level: 'info',
            source: { file: 'lib/lock-manager.ts' },
            instanceId: 'client-2',
          },
        },
        {
          message: 'Log without instance',
          metadata: {
            timestamp: Date.now(),
            level: 'info',
            source: { file: 'lib/lock-manager.ts' },
          },
        },
      ];

      const events = processor.processLogs(logs);

      expect(events).toHaveLength(3);
      expect((events[0] as any).instanceId).toBe('client-1');
      expect((events[1] as any).instanceId).toBe('client-2');
      expect((events[2] as any).instanceId).toBeUndefined();
    });
  });
});
