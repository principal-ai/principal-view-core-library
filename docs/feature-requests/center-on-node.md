# Feature Request: Center on Node/Event

## Status: IMPLEMENTED

Released in `@principal-ai/principal-view-react@0.13.6`

## Summary

Add viewport centering functionality to `GraphRenderer` that allows programmatic centering on specific nodes, enabling consumers to center the view on scenario events.

## Implementation

We implemented **Option B: `fitViewToNodeIds` Prop**, which fits the viewport to show specific nodes.

### New Props

```typescript
interface GraphRendererProps {
  // ... existing props

  /**
   * When set, fits the viewport to show these specific nodes.
   * Useful for focusing on a subset of the graph (e.g., scenario nodes).
   * Pass null/undefined/empty array to use default fitView behavior.
   */
  fitViewToNodeIds?: string[] | null;

  /**
   * Padding around nodes when fitting view to specific nodes.
   * @default 0.2
   */
  fitViewPadding?: number;
}
```

### How It Works

The implementation uses React Flow's `fitBounds` with a calculated bounding box:

```typescript
// In GraphRendererInner
const { fitView, fitBounds, getNodes } = useReactFlow();

// Create a stable key for dependency tracking
const fitViewToNodeIdsKey = useMemo(
  () => (fitViewToNodeIds && fitViewToNodeIds.length > 0
    ? fitViewToNodeIds.slice().sort().join(',')
    : ''),
  [fitViewToNodeIds]
);

// Fit view to specific nodes when fitViewToNodeIds changes
useEffect(() => {
  if (!fitViewToNodeIdsKey || !fitViewToNodeIds || fitViewToNodeIds.length === 0) {
    return;
  }

  const timeoutId = setTimeout(() => {
    // Get actual node objects from React Flow's internal state
    const allNodes = getNodes();
    const nodeIdsSet = new Set(fitViewToNodeIds);
    const nodesToFit = allNodes.filter((node) => nodeIdsSet.has(node.id));

    if (nodesToFit.length > 0) {
      // Calculate bounding box from node positions
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (const node of nodesToFit) {
        const width = node.measured?.width ?? node.width ?? 200;
        const height = node.measured?.height ?? node.height ?? 100;

        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + width);
        maxY = Math.max(maxY, node.position.y + height);
      }

      const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

      fitBounds(bounds, {
        padding: fitViewPadding,
        duration: fitViewDuration,
      });
    }
  }, 150);

  return () => clearTimeout(timeoutId);
}, [fitViewToNodeIdsKey, fitViewToNodeIds, fitViewPadding, fitView, fitViewDuration, getNodes]);
```

### Why `fitBounds` Instead of `fitView`

We initially tried using `fitView({ nodes: [...] })` but it didn't reliably move the viewport. Using `fitBounds` with an explicitly calculated bounding box provides consistent, reliable viewport control.

## Consumer Usage

```tsx
// Basic usage - fit to specific nodes
<GraphRenderer
  canvas={myCanvas}
  fitViewToNodeIds={['node-1', 'node-2', 'node-3']}
  fitViewPadding={0.1}
/>

// Combined with activeNodeIds to also dim non-selected nodes
<GraphRenderer
  canvas={myCanvas}
  fitViewToNodeIds={selectedNodeIds}
  activeNodeIds={selectedNodeIds}
  fitViewPadding={0.1}
/>

// Clear to return to default view
<GraphRenderer
  canvas={myCanvas}
  fitViewToNodeIds={undefined}  // or null or []
/>
```

## Storybook Demo

See **Components/GraphRenderer/FitViewToNodes** story which demonstrates:
- Random node selection with configurable count
- Pre-defined scenarios (Registration Flow, Lookup Flow, Error Nodes)
- Combined with `activeNodeIds` for visual highlighting

## Acceptance Criteria

- [x] `GraphRenderer` accepts `fitViewToNodeIds` prop
- [x] Viewport smoothly animates to fit the specified nodes
- [x] Works with nodes of any size (uses measured dimensions)
- [x] Padding configurable via `fitViewPadding` (default: 0.2)
- [x] Animation duration uses existing `fitViewDuration` prop
- [x] No viewport change when `fitViewToNodeIds` is null/undefined/empty
- [x] Handles edge case where node IDs don't exist (no-op)

## Related Files

- `packages/react/src/components/GraphRenderer.tsx` - Implementation
- `packages/react/src/stories/GraphRenderer.stories.tsx` - FitViewToNodes story
