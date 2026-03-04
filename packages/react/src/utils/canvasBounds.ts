import type { ExtendedCanvas } from '@principal-ai/principal-view-core';

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 100;

/**
 * Calculate the bounding box of all nodes in a canvas.
 * Returns the min/max coordinates and total dimensions.
 */
export function getCanvasBounds(canvas: ExtendedCanvas): CanvasBounds {
  if (!canvas.nodes || canvas.nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: DEFAULT_NODE_WIDTH,
      maxY: DEFAULT_NODE_HEIGHT,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of canvas.nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.height ?? DEFAULT_NODE_HEIGHT;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate a recommended display size for a canvas cell.
 * Adds padding and enforces minimum dimensions.
 */
export function getCanvasDisplaySize(
  canvas: ExtendedCanvas,
  options: {
    padding?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  } = {}
): { width: number; height: number } {
  const {
    padding = 100,
    minWidth = 300,
    minHeight = 200,
    maxWidth = 1200,
    maxHeight = 800,
  } = options;

  const bounds = getCanvasBounds(canvas);

  // Add padding to content dimensions
  const contentWidth = bounds.width + padding * 2;
  const contentHeight = bounds.height + padding * 2;

  // Clamp to min/max
  const width = Math.min(maxWidth, Math.max(minWidth, contentWidth));
  const height = Math.min(maxHeight, Math.max(minHeight, contentHeight));

  return { width, height };
}
