# TUI Sidebar Context Breakdown

## Summary

Enrich the sidebar context section in the TUI with detailed token breakdown and cache hit rate. The details appear on hover, keeping the default view compact.

## Motivation

The current context section shows only total tokens, context percentage, and cost. Users need visibility into:
- How tokens are distributed (input vs output vs reasoning vs cache)
- Cache efficiency (hit rate) to optimize prompt caching strategies

## Design

### Default State (no hover)

```
Context
12,345 tokens · 45% used
$0.02 spent
```

No change from current behavior.

### Hovered State

```
Context
12,345 tokens · 45% used
$0.02 spent
────────────────────────
In: 4,567  Out: 2,345
Re: 1,234  CaR: 3,456
CaW: 743   Hit: 75.2%
```

### Data Source

Use `session()?.tokens` (cumulative session-level totals from the `Session` SDK type) instead of the last assistant message's tokens.

```ts
// Session type (from @opencode-ai/sdk/v2)
tokens?: {
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}
```

### Calculations

| Field | Formula | Example |
|-------|---------|---------|
| In | `tokens.input` | 4,567 |
| Out | `tokens.output` | 2,345 |
| Re | `tokens.reasoning` | 1,234 |
| CaR | `tokens.cache.read` | 3,456 |
| CaW | `tokens.cache.write` | 743 |
| Hit | `cache.read / (cache.read + input) * 100` | 75.2% |

### Context Percentage

Use `session()?.model` to look up the provider and model for the context limit:

```ts
const model = providers.find(p => p.id === session()?.model?.providerID)?.models[session()?.model?.id]
const percent = model?.limit.context ? Math.round((totalTokens / model.limit.context) * 100) : null
```

This uses the session's configured model (not the last message's model) since we're showing session-level totals.

### Labels

- `In` — input tokens (fresh, non-cached)
- `Out` — output tokens
- `Re` — reasoning tokens (extended thinking)
- `CaR` — cache read tokens
- `CaW` — cache write tokens
- `Hit` — cache hit rate percentage

### Implementation

**File:** `packages/tui/src/feature-plugins/sidebar/context.tsx`

1. Add `hover` signal with `createSignal(false)`
2. Add `onMouseOver`/`onMouseOut` handlers to the root `box`
3. Change data source from last assistant message to `session()?.tokens`
4. Keep total tokens, percentage, and cost computation (update to use session tokens)
5. Add conditional breakdown rendering with `<Show when={hover()}>`
6. Use `session()?.tokens` for the breakdown values

### UI Framework

The TUI uses `@opentui/solid` (SolidJS-based terminal UI). Hover is supported via:
- `onMouseOver` / `onMouseOut` events on `box` elements
- `createSignal` for reactive hover state

## Files to Modify

| File | Change |
|------|--------|
| `packages/tui/src/feature-plugins/sidebar/context.tsx` | Main implementation |

## Out of Scope

- Per-message token breakdown (only session-level totals)
- Visual charts or graphs for token distribution
- Persisting hover state across sessions
