# TUI Sidebar Context Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the TUI sidebar context section with detailed token breakdown and cache hit rate, shown on hover.

**Architecture:** Single file modification to `packages/tui/src/feature-plugins/sidebar/context.tsx`. Switch from last-message tokens to session-level cumulative tokens. Add hover state to show/hide breakdown.

**Tech Stack:** SolidJS (`@opentui/solid`), `@opencode-ai/sdk/v2` types

**Spec:** `docs/superpowers/specs/2026-06-20-tui-context-breakdown-design.md`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `packages/tui/src/feature-plugins/sidebar/context.tsx` | Modify | Main implementation — hover state, session tokens, breakdown UI |

## Task 1: Update imports and state to use session-level tokens

**Files:**
- Modify: `packages/tui/src/feature-plugins/sidebar/context.tsx:1-35`

- [ ] **Step 1: Update imports**

Replace the imports at the top of the file:

```ts
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, Show } from "solid-js"
```

Remove the `AssistantMessage` import (no longer needed). Add `createSignal` and `Show` to the solid-js import.

- [ ] **Step 2: Add hover signal and update state computation**

Replace the `View` function body (lines 13–46) with:

```tsx
function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)
  const [hover, setHover] = createSignal(false)

  const state = createMemo(() => {
    const tokens = session()?.tokens
    if (!tokens) {
      return { total: 0, percent: null }
    }

    const total = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
    const modelProvider = session()?.model?.providerID
    const modelId = session()?.model?.id
    const model = modelProvider && modelId
      ? props.api.state.provider.find((item) => item.id === modelProvider)?.models[modelId]
      : undefined
    const percent = model?.limit.context ? Math.round((total / model.limit.context) * 100) : null

    return { total, percent }
  })

  const breakdown = createMemo(() => {
    const tokens = session()?.tokens
    if (!tokens) return null

    const cacheTotal = tokens.cache.read + tokens.input
    const hitRate = cacheTotal > 0 ? Math.round((tokens.cache.read / cacheTotal) * 1000) / 10 : 0

    return {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cacheRead: tokens.cache.read,
      cacheWrite: tokens.cache.write,
      hitRate,
    }
  })

  return (
    <box
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
    >
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>{state().total.toLocaleString()} tokens · {state().percent ?? 0}% used</text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>
      <Show when={hover() && breakdown()}>
        <text fg={theme().textMuted}>────────────────────────</text>
        <text fg={theme().textMuted}>
          In: {breakdown()!.input.toLocaleString()}  Out: {breakdown()!.output.toLocaleString()}
        </text>
        <text fg={theme().textMuted}>
          Re: {breakdown()!.reasoning.toLocaleString()}  CaR: {breakdown()!.cacheRead.toLocaleString()}
        </text>
        <text fg={theme().textMuted}>
          CaW: {breakdown()!.cacheWrite.toLocaleString()}  Hit: {breakdown()!.hitRate}%
        </text>
      </Show>
    </box>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/tui && bun typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/feature-plugins/sidebar/context.tsx
git commit -m "feat(tui): add token breakdown and cache hit rate to sidebar context"
```
