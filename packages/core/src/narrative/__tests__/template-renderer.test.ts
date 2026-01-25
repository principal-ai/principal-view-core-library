/**
 * Tests for template renderer (end-to-end narrative generation)
 */

import { renderNarrative } from '../template-renderer';
import type { NarrativeTemplate, OtelEvent } from '../types';

describe('renderNarrative', () => {
  describe('span-tree mode', () => {
    const template: NarrativeTemplate = {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Span Tree Test',
      description: 'Test span tree rendering',
      mode: 'span-tree',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'default',
          priority: 1,
          description: 'Default scenario',
          condition: { default: true },
          template: {
            introduction: '✅ Execution Trace',
            span: '→ {{span.name}}',
            children: 'recurse',
            summary: '✅ Complete',
          },
        },
      ],
    };

    it('should render simple span tree', () => {
      const events: OtelEvent[] = [
        {
          name: 'parent.span',
          timestamp: 0,
          type: 'span',
          spanId: 'span1',
          traceId: 'trace1',
        },
        {
          name: 'child.span',
          timestamp: 10,
          type: 'span',
          spanId: 'span2',
          parentSpanId: 'span1',
          traceId: 'trace1',
        },
      ];

      const result = renderNarrative(template, events);

      expect(result.text).toContain('✅ Execution Trace');
      expect(result.text).toContain('→ parent.span');
      expect(result.text).toContain('→ child.span');
      expect(result.text).toContain('✅ Complete');
      expect(result.scenarioId).toBe('default');
    });

    it('should indent child spans correctly', () => {
      const events: OtelEvent[] = [
        { name: 'root', type: 'span', spanId: '1', traceId: 't1', timestamp: 0 },
        { name: 'child1', type: 'span', spanId: '2', parentSpanId: '1', traceId: 't1', timestamp: 10 },
        { name: 'grandchild', type: 'span', spanId: '3', parentSpanId: '2', traceId: 't1', timestamp: 20 },
      ];

      const result = renderNarrative(template, events);
      const lines = result.text.split('\n');

      // Check for proper indentation (2 spaces per level)
      expect(lines).toContainEqual(expect.stringMatching(/^→ root$/));
      expect(lines).toContainEqual(expect.stringMatching(/^ {2}→ child1$/));
      expect(lines).toContainEqual(expect.stringMatching(/^ {4}→ grandchild$/));
    });

    it('should attach logs to spans when showLogsPerSpan is true', () => {
      const templateWithLogs: NarrativeTemplate = {
        ...template,
        showLogsPerSpan: true,
        scenarios: [
          {
            ...template.scenarios[0],
            template: {
              ...template.scenarios[0].template,
              logs: {
                info: '  📝 {{log.body}}',
                error: '  ❌ {{log.body}}',
              },
            },
          },
        ],
      };

      const events: OtelEvent[] = [
        { name: 'test.span', type: 'span', spanId: 'span1', traceId: 't1', timestamp: 0 },
        {
          name: 'log.info',
          type: 'log',
          spanId: 'span1',
          traceId: 't1',
          timestamp: 5,
          severityText: 'INFO',
          severityNumber: 9,
          body: 'Processing started',
        },
        {
          name: 'log.error',
          type: 'log',
          spanId: 'span1',
          traceId: 't1',
          timestamp: 15,
          severityText: 'ERROR',
          severityNumber: 17,
          body: 'Something failed',
        },
      ];

      const result = renderNarrative(templateWithLogs, events);

      expect(result.text).toContain('→ test.span');
      expect(result.text).toContain('📝 Processing started');
      expect(result.text).toContain('❌ Something failed');
    });
  });

  describe('timeline mode', () => {
    const template: NarrativeTemplate = {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Timeline Test',
      description: 'Test timeline rendering',
      mode: 'timeline',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'default',
          priority: 1,
          description: 'Default scenario',
          condition: { default: true },
          template: {
            introduction: 'Timeline',
            events: {
              'test.started': '🔵 Started',
              'test.complete': '🔵 Completed',
              'log.info': '📝 {{log.body}}',
            },
            summary: 'Done',
          },
        },
      ],
      formatting: {
        showTimestamps: true,
        timestampFormat: 'HH:mm:ss.SSS',
      },
    };

    it('should render events in chronological order', () => {
      const events: OtelEvent[] = [
        { name: 'test.started', timestamp: '2025-01-15T10:00:00.000Z', type: 'span' },
        { name: 'log.info', timestamp: '2025-01-15T10:00:00.050Z', type: 'log', body: 'Processing', severityText: 'INFO' },
        { name: 'test.complete', timestamp: '2025-01-15T10:00:00.100Z', type: 'span' },
      ];

      const result = renderNarrative(template, events);

      expect(result.text).toContain('[10:00:00.000] 🔵 Started');
      expect(result.text).toContain('[10:00:00.050] 📝 Processing');
      expect(result.text).toContain('[10:00:00.100] 🔵 Completed');

      // Check order
      const startedIndex = result.text.indexOf('🔵 Started');
      const processingIndex = result.text.indexOf('📝 Processing');
      const completedIndex = result.text.indexOf('🔵 Completed');
      expect(startedIndex).toBeLessThan(processingIndex);
      expect(processingIndex).toBeLessThan(completedIndex);
    });
  });


  describe('scenario selection', () => {
    const template: NarrativeTemplate = {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Scenario Test',
      description: 'Test scenario selection',
      mode: 'timeline',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'error',
          priority: 1,
          description: 'Error occurred',
          condition: { requires: ['*.error'] },
          template: { summary: '❌ Error' },
        },
        {
          id: 'warnings',
          priority: 2,
          description: 'Has warnings',
          condition: {
            requires: ['test.complete'],
            assertions: { 'result.warnings': { $gt: 0 } },
          },
          template: { summary: '⚠️ Warnings' },
        },
        {
          id: 'success',
          priority: 3,
          description: 'Success',
          condition: { requires: ['test.complete'] },
          template: { summary: '✅ Success' },
        },
        {
          id: 'fallback',
          priority: 99,
          description: 'Fallback',
          condition: { default: true },
          template: { summary: 'Unknown' },
        },
      ],
    };

    it('should select error scenario (highest priority)', () => {
      const events: OtelEvent[] = [
        { name: 'test.error', timestamp: 50, type: 'span' },
        { name: 'test.complete', timestamp: 100, type: 'span', attributes: { 'result.warnings': 2 } },
      ];

      const result = renderNarrative(template, events);
      expect(result.scenarioId).toBe('error');
      expect(result.text).toContain('❌ Error');
    });

    it('should select warnings scenario', () => {
      const events: OtelEvent[] = [
        { name: 'test.complete', timestamp: 100, type: 'span', attributes: { 'result.warnings': 3 } },
      ];

      const result = renderNarrative(template, events);
      expect(result.scenarioId).toBe('warnings');
      expect(result.text).toContain('⚠️ Warnings');
    });

    it('should select success scenario', () => {
      const events: OtelEvent[] = [
        { name: 'test.complete', timestamp: 100, type: 'span', attributes: { 'result.warnings': 0 } },
      ];

      const result = renderNarrative(template, events);
      expect(result.scenarioId).toBe('success');
      expect(result.text).toContain('✅ Success');
    });

    it('should select fallback when no other matches', () => {
      const events: OtelEvent[] = [{ name: 'unknown.event', timestamp: 0, type: 'span' }];

      const result = renderNarrative(template, events);
      expect(result.scenarioId).toBe('fallback');
      expect(result.text).toContain('Unknown');
    });
  });

  describe('event-specific attributes override aggregates', () => {
    const template: NarrativeTemplate = {
      version: '1.0.0',
      canvas: 'skill-installation.otel.canvas',
      name: 'Skill Installation',
      description: 'Test event attribute override',
      mode: 'timeline',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'success',
          priority: 1,
          description: 'Success',
          condition: {
            requires: ['installation.complete'],
            assertions: { 'install.failure_count': { $eq: 0 } }
          },
          template: {
            events: {
              'installation.started': 'Starting installation ({{install.scope}})',
              'skill.installing': 'Installing {{skill.name}} to {{agent.name}} (Mode: {{install.mode}})',
              'skill.installed': 'Installed successfully',
              'installation.complete': '{{install.success_count}} successful installations'
            }
          },
        },
      ],
    };

    it('should use event-specific attributes not aggregates', () => {
      const events: OtelEvent[] = [
        {
          name: 'installation.started',
          timestamp: 1000,
          type: 'span',
          attributes: {
            'install.scope': 'global',
            'install.mode': 'copy', // Summary event has 'copy'
          }
        },
        {
          name: 'skill.installing',
          timestamp: 2000,
          type: 'span',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Amp',
            'install.mode': 'symlink', // Event-specific has 'symlink' - should override!
            'install.scope': 'global',
          }
        },
        {
          name: 'skill.installed',
          timestamp: 2500,
          type: 'span',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Amp',
          }
        },
        {
          name: 'skill.installing',
          timestamp: 3000,
          type: 'span',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Cursor',
            'install.mode': 'symlink', // Different agent
            'install.scope': 'global',
          }
        },
        {
          name: 'skill.installed',
          timestamp: 3500,
          type: 'span',
          attributes: {
            'skill.name': 'demo-skill',
            'agent.name': 'Cursor',
          }
        },
        {
          name: 'installation.complete',
          timestamp: 4000,
          type: 'span',
          attributes: {
            'install.success_count': 2,
            'install.failure_count': 0,
          }
        },
      ];

      const result = renderNarrative(template, events);

      // Should show event-specific values, not aggregate values
      expect(result.text).toContain('Installing demo-skill to Amp (Mode: symlink)');
      expect(result.text).toContain('Installing demo-skill to Cursor (Mode: symlink)');

      // Should NOT show aggregate value
      expect(result.text).not.toContain('Installing demo-skill to Amp (Mode: copy)');
      expect(result.text).not.toContain('Installing demo-skill to Cursor (Mode: copy)');

      // Should show both installations with different agent names
      expect(result.text).toContain('to Amp');
      expect(result.text).toContain('to Cursor');
    });
  });

  describe('metadata', () => {
    const template: NarrativeTemplate = {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Metadata Test',
      description: 'Test metadata generation',
      mode: 'timeline',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'default',
          priority: 1,
          description: 'Default',
          condition: { default: true },
          template: { summary: 'Done' },
        },
      ],
    };

    it('should include event counts', () => {
      const events: OtelEvent[] = [
        { name: 'span1', timestamp: 0, type: 'span' },
        { name: 'span2', timestamp: 10, type: 'span' },
        { name: 'log1', timestamp: 5, type: 'log', body: 'test' },
        { name: 'log2', timestamp: 15, type: 'log', body: 'test' },
        { name: 'log3', timestamp: 20, type: 'log', body: 'test' },
      ];

      const result = renderNarrative(template, events);

      expect(result.metadata.eventCount).toBe(5);
      expect(result.metadata.spanCount).toBe(2);
      expect(result.metadata.logCount).toBe(3);
    });

    it('should include time range', () => {
      const events: OtelEvent[] = [
        { name: 'event1', timestamp: 1000, type: 'span' },
        { name: 'event2', timestamp: 2000, type: 'span' },
        { name: 'event3', timestamp: 1500, type: 'log', body: 'test' },
      ];

      const result = renderNarrative(template, events);

      expect(result.metadata.timeRange).toBeDefined();
      expect(result.metadata.timeRange?.start).toBe(1000);
      expect(result.metadata.timeRange?.end).toBe(2000);
    });
  });
});
