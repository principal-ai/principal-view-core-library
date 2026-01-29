# Template Variable Rendering Enhancement

**Status**: To Do
**Priority**: Medium
**Created**: 2026-01-29

## Problem

When workflow templates reference variables that don't exist in the execution data, the current Handlebars-based template parser leaves them as raw template syntax (e.g., `{{customer.name}}`). While this technically works, it creates a poor user experience:

1. **No visual distinction**: Missing variables look like broken template syntax rather than intentional placeholders
2. **No context**: Users can't tell if a variable is missing due to:
   - Incorrect template design
   - Missing instrumentation in the test
   - Conditional attributes that may not always be present
3. **Inconsistent appearance**: Mixed rendered values and raw template syntax looks unprofessional

## Current Behavior

```
Payment declined
    • Error Code: card_declined
    • Reason: Your card was declined
    • Customer Name: {{customer.name}}        ← Raw template syntax visible
    • Customer Email: {{customer.email}}      ← Raw template syntax visible
    • Card Type: {{payment.cardType}}         ← Raw template syntax visible
```

## Root Cause

The real problem is that `parseTemplate()` returns a **flat string** with variables already interpolated. This forces consumers to use regex pattern matching to guess what's a variable vs static text, leading to:

- Inconsistent styling (highlighting "$123" because it looks like currency, not because it's a variable)
- No distinction between resolved and unresolved variables
- No way to style variables uniformly regardless of their data type

**Current API:**
```typescript
parseTemplate(template, context) → string
// "Payment declined: Card declined, Customer: {{customer.name}}"
```

## Proposed Solution: Structured Parse Results

**New API:**
```typescript
parseTemplate(template, context) → ParsedTemplate

interface ParsedTemplate {
  // For backwards compatibility, toString() returns flat string
  toString(): string;

  // New structured representation
  segments: Array<{
    type: 'text' | 'variable';
    value: string;           // The rendered value
    variableName?: string;   // Original template variable name (e.g., "customer.name")
    resolved: boolean;       // Whether the variable had data
  }>;
}
```

**Example output:**
```typescript
{
  segments: [
    { type: 'text', value: 'Payment declined: ' },
    { type: 'variable', variableName: 'error.message', value: 'Card declined', resolved: true },
    { type: 'text', value: '\n    • Customer: ' },
    { type: 'variable', variableName: 'customer.name', value: '{{customer.name}}', resolved: false },
  ]
}
```

**Benefits:**
1. **Accurate styling**: Consumers know exactly what's a variable, not guessing with regex
2. **Unified styling**: All resolved variables styled consistently (regardless of data type)
3. **Clear missing data**: Unresolved variables can be styled differently or replaced with placeholders
4. **Backwards compatible**: `toString()` returns flat string for existing consumers
5. **Debugging**: Can inspect which variables resolved and which didn't

**Consumer-side rendering** (in WorkflowRenderer.tsx):
```typescript
const parsed = parseTemplate(eventTemplate, eventContext);

// Render with proper styling
parsed.segments.map((seg, i) => {
  if (seg.type === 'text') {
    return <span key={i}>{seg.value}</span>;
  }

  // Variable styling based on resolution
  return (
    <span
      key={i}
      style={{
        color: seg.resolved ? theme.colors.primary : theme.colors.textTertiary,
        fontWeight: seg.resolved ? 600 : 400,
        fontStyle: seg.resolved ? 'normal' : 'italic',
        fontFamily: theme.fonts.monospace,
      }}
    >
      {seg.resolved ? seg.value : `(${seg.variableName})`}
    </span>
  );
});
```

## Technical Details

**Location**: `parseTemplate()` function in `@principal-ai/principal-view-core`

**Current Implementation**: Uses Handlebars, returns flat concatenated string

**Required Changes**:
1. **Return structured data** instead of flat string
   - Parse template and track variable positions
   - Record which variables resolved vs unresolved
   - Return array of text/variable segments

2. **Backwards compatibility**
   - Add `toString()` method that returns flat string
   - Existing consumers continue to work without changes

3. **Handlebars integration**
   - Custom Handlebars helper to track variable resolution
   - Post-process Handlebars output to identify variable positions
   - Or: Parse template AST before Handlebars compilation

4. **API design considerations**
   - Should work with all template contexts (introduction, events, summary)
   - Should handle nested variables (e.g., `{{#if condition}}{{value}}{{/if}}`)
   - Should work with Handlebars helpers (e.g., `{{#each items}}`)
   - Consider performance impact of returning structured data

## Visual Comparison

**Current approach (regex pattern matching):**
```
Payment for $89.99 declined     ← "$89.99" highlighted green (looks like money)
Order: ORD-12345                ← "ORD-12345" highlighted orange (looks like ID)
Customer: John Doe              ← "John Doe" highlighted purple (looks like name)
Retry: {{payment.retryCount}}   ← Not highlighted (doesn't match any pattern)
```
**Problem**: Styling based on appearance, not meaning. Static text "$89.99" gets same styling as a variable would.

**With structured data:**
```
Payment for $89.99 declined     ← "89.99" highlighted (it IS the payment.amount variable)
Order: ORD-12345                ← "ORD-12345" highlighted (it IS the order.id variable)
Customer: John Doe              ← "John Doe" highlighted (it IS the customer.name variable)
Retry: (payment.retryCount)     ← Dimmed/styled differently (unresolved variable)
```
**Benefit**: Styling based on semantic meaning. All variables styled uniformly, regardless of what the data looks like.

## Use Cases

1. **Template development**: Developers can see which variables they need to capture in instrumentation
2. **Conditional attributes**: Some event attributes are only present in certain scenarios (e.g., `error.retryCount` only exists on retries)
3. **Progressive instrumentation**: Start with basic templates, add more detail over time without breaking existing renders
4. **Consistent UX**: All variables styled the same way, regardless of data type or format

## Related Code

- `WorkflowRenderer.tsx` (industry-themed-principal-view-panels) - Calls `parseTemplate()` for rendering
- `highlightVariables()` in WorkflowRenderer.tsx - Currently uses regex pattern matching to guess what might be a variable:
  - Highlights "$123.45" (looks like currency)
  - Highlights "ORD-12345" (looks like an ID)
  - Highlights numbers, emails, names based on patterns
  - **Problem**: Styles based on appearance, not semantic meaning
  - **Cannot distinguish** between variables and static text that happens to match patterns
- Previous approach: Warning banner (removed) - was too intrusive for common use case

## Implementation Notes

- Should not break existing templates that render correctly
- Consider performance impact of post-processing
- May need to distinguish between truly missing variables vs. empty string values
- Should work consistently across `renderWorkflow()`, `parseTemplate()`, and `selectScenario()`

## Acceptance Criteria

- [ ] `parseTemplate()` returns structured data with text/variable segments
- [ ] Each segment includes `resolved` boolean indicating if variable had data
- [ ] Backwards compatible: calling `.toString()` returns flat string
- [ ] Consumers can style all variables uniformly based on semantic meaning, not pattern matching
- [ ] Resolved vs unresolved variables can be styled differently
- [ ] No breaking changes to existing consumers
- [ ] Works consistently in all template contexts (introduction, events, summary)
- [ ] Handles Handlebars conditionals and helpers correctly
- [ ] Documentation updated with examples of:
  - Structured data format
  - Consumer-side rendering examples
  - Migration guide for consumers wanting to use structured data
