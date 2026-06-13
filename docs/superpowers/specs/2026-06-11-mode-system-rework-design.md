# Mode System Rework: Quick / Standard / Pro

## Overview

Replace the existing `build` and `plan` modes with three new primary modes that select different underlying models by capability/cost tier. Remove the plan mode workflow entirely.

## Goals

- Replace `build` and `plan` agents with `quick`, `standard`, `pro` primary modes
- Each mode maps to a specific hardcoded model
- Subagents use a two-tier model system: cheap (fixed) and smart (inherits mode)
- Remove plan mode workflow (plan_enter/plan_exit tools, plan prompts, plan reminders)
- Add a shared consult-first prompt layer so judgment questions get answered before execution

## Model Mapping

### Primary Modes

| Mode | Model ID | Default | Description |
|------|----------|---------|-------------|
| Quick | opencode-go/mimo-v2.5 | Yes | Cheapest/quickest, for simple tasks |
| Standard | opencode-go/mimo-v2.5-pro | No | Balanced cost/capability |
| Pro | openai/gpt-5.5 | No | Most capable/expensive |

### Subagent Models

| Subagent | Model ID | Behavior |
|----------|----------|----------|
| Explore | opencode-go/deepseek-v4-flash | Always this cheap model, read-only |
| Runner | opencode-go/mimo-v2.5 | Always this cheap model, general work |
| General | Inherits current mode | Smart worker: Quick→mimo-v2.5, Standard→mimo-v2.5-pro, Pro→gpt-5.5 |

## File Changes

### 1. Agent Definitions

**File:** `packages/opencode/src/agent/agent.ts`

Replace `build` and `plan` agent definitions (lines 139-179) with three new primary agents:

```ts
quick: {
  name: "quick",
  description: "Quick mode. Uses a lightweight model for quick tasks.",
  model: { providerID: ProviderV2.ID.make("opencode-go"), modelID: ModelV2.ID.make("mimo-v2.5") },
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({ question: "allow" }),
    user,
  ),
  mode: "primary",
  native: true,
  options: {},
},
standard: {
  name: "standard",
  description: "Standard mode. Balanced cost and capability.",
  model: { providerID: ProviderV2.ID.make("opencode-go"), modelID: ModelV2.ID.make("mimo-v2.5-pro") },
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({ question: "allow" }),
    user,
  ),
  mode: "primary",
  native: true,
  options: {},
},
pro: {
  name: "pro",
  description: "Pro mode. Uses the most capable model.",
  model: { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-5.5") },
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({ question: "allow" }),
    user,
  ),
  mode: "primary",
  native: true,
  options: {},
},
```

Update `explore` subagent to include hardcoded model:

```ts
explore: {
  // ... existing permissions and description ...
  model: { providerID: ProviderV2.ID.make("opencode-go"), modelID: ModelV2.ID.make("deepseek-v4-flash") },
  mode: "subagent",
  native: true,
},
```

Add new `runner` subagent:

```ts
runner: {
  name: "runner",
  description: "Cheap worker agent for executing straightforward tasks.",
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({ todowrite: "deny" }),
    user,
  ),
  model: { providerID: ProviderV2.ID.make("opencode-go"), modelID: ModelV2.ID.make("mimo-v2.5") },
  mode: "subagent",
  native: true,
  options: {},
},
```

Update `general` subagent to NOT set a model (inherits from current mode):

```ts
general: {
  name: "general",
  description: "General-purpose agent for researching complex questions and executing multi-step tasks.",
  permission: Permission.merge(
    defaults,
    Permission.fromConfig({ todowrite: "deny" }),
    user,
  ),
  options: {},
  mode: "subagent",
  native: true,
},
```

### 2. V2 Plugin Agent Definitions

**File:** `packages/core/src/plugin/agent.ts`

Mirror the same changes: replace build/plan with quick/standard/pro, add runner, update explore/general.

### 3. Default Agent Selection

**Files:**
- `packages/opencode/src/agent/agent.ts`
- `packages/core/src/agent.ts`
- `packages/opencode/src/acp/service.ts`

Update every built-in fallback from `"build"` to `"quick"`:

```ts
// packages/opencode/src/agent/agent.ts
[(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],

// packages/opencode/src/agent/agent.ts
[(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "quick"), "desc"],

// packages/core/src/agent.ts
export const defaultID = ID.make("quick")

// packages/core/src/agent.ts selectedDefault()
const quick = selectable(data.agents.get(ID.make("quick")))
if (quick) return quick

// packages/opencode/src/acp/service.ts
defaultModeID: agents.find((agent) => agent.mode === "primary" && agent.hidden !== true)?.name ?? "quick"
```

### 4. Files to Remove

| File | Reason |
|------|--------|
| `packages/opencode/src/tool/plan.ts` | plan_exit tool |
| `packages/opencode/src/tool/plan-enter.txt` | plan_enter system prompt |
| `packages/opencode/src/tool/plan-exit.txt` | plan_exit system prompt |
| `packages/opencode/src/session/prompt/plan.txt` | Plan mode reminder |
| `packages/opencode/src/session/prompt/plan-mode.txt` | Experimental plan mode prompt |
| `packages/opencode/src/session/prompt/build-switch.txt` | Build switch reminder |

### 5. Permission Cleanup

**File:** `packages/opencode/src/permission/index.ts`

Remove `plan_enter` and `plan_exit` from permission types and evaluation logic.

### 6. Tool Registry Cleanup

**File:** `packages/opencode/src/tool/registry.ts`

Remove references to `plan_enter`/`plan_exit` tools.

### 7. Session Reminders

**File:** `packages/opencode/src/session/reminders.ts`

Remove plan/build mode reminders. Remove any logic that injects plan mode prompts.

### 8. Prompt Discipline Overlay

**Files:**
- `packages/opencode/src/session/prompt/decision-discipline.txt`
- `packages/opencode/src/session/system.ts`
- `packages/opencode/src/session/prompt/gpt.txt`

Add a shared decision-discipline prompt fragment that is appended to every provider-specific system prompt. The agent should treat questions about validity, safety, or whether an approach is worth doing as review-first requests, answer the judgment before acting, and ask for permission before immediately editing or running tools.

### 9. CLI Updates

**File:** `packages/opencode/src/cli/cmd/run.ts`

Update `--agent` flag validation to accept `quick`, `standard`, `pro` instead of `build`, `plan`.

### 10. ACP Service

**File:** `packages/opencode/src/acp/service.ts` (lines 744-751)

Update mode filtering to use new agent names.

### 11. TUI Agent Selector

**File:** `packages/tui/src/context/local.tsx` (lines 73-131)

Update `createAgent()` to work with new mode names. The filtering logic (`mode !== "subagent"`) remains the same; the display names change.

### 12. Experimental Plan Mode Flag

**File:** `packages/opencode/src/effect/runtime-flags.ts`

Remove `experimentalPlanMode` flag.

### 13. Config Schema

**File:** `packages/core/src/v1/config/config.ts`

Keep the deprecated `mode` field in the V1 schema until after migration, because `packages/core/src/v1/config/migrate.ts` still reads `info.mode` and rewrites those entries into primary agents. Update migration behavior and docs to map old built-ins to the new names, but do not remove `mode` from the V1 decoder in this change.

If there is a separate cleanup later to remove V1 `mode`, it must happen only after the migration path is no longer needed.

## Model Resolution Flow

1. User selects mode (Quick/Standard/Pro) via TUI selector or `--agent` CLI flag
2. Mode determines the primary model for the session
3. When primary agent delegates via `task` tool:
   - `@explore` → always uses opencode-go/deepseek-v4-flash
   - `@runner` → always uses opencode-go/mimo-v2.5
   - `@general` → inherits the current mode's model
4. Default mode is Quick if not configured

## Testing

- Update agent tests in `packages/opencode/test/agent/agent.test.ts`
- Update ACP tests that reference build/plan modes
- Update CLI tests for `--agent` flag
- Verify prompt composition includes the consult-first wording in `packages/opencode/test/session/system.test.ts`
- Verify mode switching works in TUI

## Migration Notes

- Users with `default_agent: "build"` in config should change to `default_agent: "quick"`
- Users with `default_agent: "plan"` should change to `default_agent: "standard"` or `"pro"`
- Users with legacy V1 `mode` entries must continue to decode successfully during migration; this feature must not turn those configs into parse failures.
- Custom agents defined in `{agent,agents}/**/*.md` or `{mode,modes}/*.md` continue to work unchanged
