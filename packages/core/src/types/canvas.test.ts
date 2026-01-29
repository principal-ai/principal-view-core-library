/**
 * Tests for canvas utility functions
 */

import { describe, it, expect } from 'bun:test';
import { resolveCanvasColor, CANVAS_COLOR_PRESETS } from './canvas';

describe('resolveCanvasColor', () => {
  it('should return undefined for undefined input', () => {
    expect(resolveCanvasColor(undefined)).toBeUndefined();
  });

  it('should resolve numeric presets to hex colors', () => {
    expect(resolveCanvasColor(1)).toBe('#ef4444'); // red
    expect(resolveCanvasColor(2)).toBe('#f97316'); // orange
    expect(resolveCanvasColor(3)).toBe('#eab308'); // yellow
    expect(resolveCanvasColor(4)).toBe('#22c55e'); // green
    expect(resolveCanvasColor(5)).toBe('#06b6d4'); // cyan
    expect(resolveCanvasColor(6)).toBe('#8b5cf6'); // purple
  });

  it('should resolve numeric string presets to hex colors (Obsidian format)', () => {
    expect(resolveCanvasColor('1')).toBe('#ef4444'); // red
    expect(resolveCanvasColor('2')).toBe('#f97316'); // orange
    expect(resolveCanvasColor('3')).toBe('#eab308'); // yellow
    expect(resolveCanvasColor('4')).toBe('#22c55e'); // green
    expect(resolveCanvasColor('5')).toBe('#06b6d4'); // cyan
    expect(resolveCanvasColor('6')).toBe('#8b5cf6'); // purple
  });

  it('should return hex strings as-is', () => {
    expect(resolveCanvasColor('#22c55e')).toBe('#22c55e');
    expect(resolveCanvasColor('#f00')).toBe('#f00');
    expect(resolveCanvasColor('#3b82f6')).toBe('#3b82f6');
  });

  it('should return non-numeric strings as-is', () => {
    expect(resolveCanvasColor('red')).toBe('red');
    expect(resolveCanvasColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
  });

  it('should handle edge cases for numeric strings', () => {
    // Out of range numeric strings should be returned as-is
    expect(resolveCanvasColor('0')).toBe('0');
    expect(resolveCanvasColor('7')).toBe('7');
    expect(resolveCanvasColor('10')).toBe('10');
  });

  it('should verify all preset mappings exist', () => {
    // Ensure all presets 1-6 are defined
    for (let i = 1; i <= 6; i++) {
      expect(CANVAS_COLOR_PRESETS[i]).toBeDefined();
      expect(CANVAS_COLOR_PRESETS[i]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
