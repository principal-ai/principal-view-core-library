/**
 * Spans module
 *
 * Provides utilities for working with span conventions from .spans.canvas files.
 * Span colors are used as fill colors for events emitted within that span.
 *
 * Color Contract:
 * - Scope color → Border (from library.yaml owned-scopes)
 * - Span color → Fill (from .spans.canvas)
 */

export {
  DEFAULT_SPAN_COLOR,
  extractSpanConvention,
  extractSpanConventions,
  buildSpanColorMap,
  buildSpanColorMapFromCanvases,
  matchSpanPattern,
  getSpanColor,
  resolveEventSpanColor,
  type NormalizedSpanConvention,
} from './utils';
