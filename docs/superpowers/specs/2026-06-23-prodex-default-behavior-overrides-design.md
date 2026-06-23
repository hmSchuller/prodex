# Prodex: Default-Behavior Overrides (Worktree Off, Skim Reviews)

**Date:** 2026-06-23
**Status:** Approved
**Author:** opencode (auto-generated)

## Context

Prodex is a private distribution of opencode for a small team. Two product-behavior decisions are baked in at the distribution level:

1. **Worktrees are not created unless the user explicitly opts in.** Prodex users work in their primary working copy. Sandbox worktrees, branch isolation, and start-command bootstrapping are still useful, but they should not happen by default. Today the `POST /experimental/worktree` endpoint and the `Worktree.create` service method will create a worktree unconditionally.
2. **`superpowers:subagent-driven-development` runs reviews once at the end, not after every task.** The upstream skill body requires per-task spec-compliance and code-quality reviewer subagents. Prodex's smaller-team / faster-iteration style prefers a single final code-quality review of the whole implementation. Overriding this in the upstream skill body or forking the `superpowers` package would be heavy-handed; a small, explicit instruction in the Prodex-distributed system prompt is enough because the system prompt wins over skill body text.

Both changes are distribution-level. The upstream opencode source and the `superpowers` package stay untouched (modulo a small, neutral schema addition for the worktree flag). The Prodex build and managed config carry the overrides.

## Requirements

1. `Worktree.create` and `Worktree.createFromInfo` short-circuit with a typed `DisabledError` when the new `experimental.worktree.enabled` config flag is `false`. Listing, removing, and resetting existing worktrees still work.
2. The flag defaults to `true` in the upstream opencode source so behavior outside Prodex is unchanged. The Prodex managed config sets it to `false`.
3. A user can opt back in per project by setting `experimental.worktree.enabled: true` in `.opencode/opencode.jsonc` (project config beats managed config).
4. The drift instruction for `subagent-driven-development` lives in the Prodex managed config's `instructions` array, applies to every Prodex session, and tells the agent to skip per-task reviews and dispatch a single final code-quality reviewer.
5. The `using-superpowers` bootstrap and the `subagent-driven-development` skill body are unchanged.
6. Both changes survive upstream rebases cleanly: the schema addition is a single field, and the drift instruction lives entirely outside the opencode source.

## Design

### 1. Worktree enable flag in config schema

Add a new optional field to the `experimental` block in `packages/core/src/v1/config/config.ts`:

```ts
experimental: Schema.optional(
  Schema.Struct({
    // ...existing fields...
    worktree: Schema.optional(
      Schema.Struct({
        enabled: Schema.optional(Schema.Boolean).annotate({
          description:
            "Enable creation of new git worktrees via the worktree service. Listing, removing, and resetting existing worktrees still work when disabled. Defaults to true.",
        }),
      }),
    ),
  }),
),
```

`Schema.optional(Schema.Boolean)` keeps the field's absence equivalent to "use default" so the existing default-reading logic stays simple. Reading follows the existing `experimental.*` field access pattern (see `experimental.primary_tools` for the closest analog).

**Default.** `true` in upstream opencode. `false` in Prodex managed config (`.opencode/opencode.jsonc`).

### 2. Worktree service short-circuits on disabled

Modify `packages/opencode/src/worktree/index.ts`:

- Add a new typed error class `DisabledError extends Schema.TaggedErrorClass<DisabledError>()("WorktreeDisabledError", { message: Schema.String }) {}` next to the existing `NotGitError`, `CreateFailedError`, etc. Add it to the `Error` union.
- Add `Config.Service` to the `layer` type's requirements and provide it through `defaultLayer` / `appLayer` / `node` next to the other `Layer.provide(...)` calls.
- In `create` and `createFromInfo`, yield the config once at the top of the Effect, read `cfg.experimental?.worktree?.enabled`, and if it is `false` return `yield* new DisabledError({ message: "Worktree creation is disabled by configuration" })`. `makeWorktreeInfo`, `list`, `remove`, and `reset` are unchanged.
- `makeWorktreeInfo` stays untouched on purpose: callers that already hold an `Info` (for example, the session-sandbox flow that boots a worktree previously chosen by the user) still need it.

### 3. HTTP API translates `DisabledError` to a 400

The worktree handlers in `packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts` declare `error: WorktreeApiError` on every worktree endpoint. `WorktreeApiError` is an `httpApiStatus: 400` `ErrorClass` whose `name` field is a `Schema.Union` of literals matching the `_tag` of each worktree domain error (see `WorktreeErrorName`).

Add `Schema.Literal("WorktreeDisabledError")` to the `WorktreeErrorName` union. The handler in `packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts` already maps any thrown worktree error to `WorktreeApiError` via `Effect.mapError((error) => new WorktreeApiError({ name: error._tag, data: { message: error.message } }))`, so once the literal is in the union the new domain error flows through unchanged. The worktree service itself stays free of `HttpApi` types per `AGENTS.md`.

### 4. Session-sandbox worktree flow is unaffected

`packages/opencode/src/project/project.ts` uses the worktree path as the session sandbox only when a session was started in `workspace.worktree` mode. That path is gated per session, not per worktree-creation, and does not call `Worktree.create`. The new `DisabledError` does not reach it. No code change there.

### 5. Prodex managed config: worktree off

In `.opencode/opencode.jsonc` (the file already shipped via `prodex-config.tar.gz`), add an `experimental` block. The file currently has no `experimental` field, so the new key sits next to the existing `plugin` and `tools` keys:

```jsonc
"experimental": {
  "worktree": {
    "enabled": false
  }
}
```

### 6. Prodex managed config: drift instruction

In the same `.opencode/opencode.jsonc`, add an `instructions` array. The file currently has no `instructions` field, so the new key is a single-element array:

```jsonc
"instructions": [
  "When using the superpowers:subagent-driven-development skill to execute an implementation plan, do NOT dispatch the per-task spec-compliance reviewer subagent or the per-task code-quality reviewer subagent. Tasks proceed straight from implementer self-review to the next task. After all tasks are complete, dispatch the single final code-quality reviewer subagent listed in the skill (\"Dispatch final code reviewer subagent for entire implementation\") before finishing the branch. The finishing-a-development-branch skill still runs at the end as the skill specifies."
]
```

The `using-superpowers` bootstrap still injects the `<EXTREMELY_IMPORTANT>` block and tells the model to load the skill via the native `skill` tool. The skill body still describes the per-task review process. The system prompt's instruction is the explicit Prodex override and has higher priority than the skill body, so the agent follows it when invoking the skill.

### 7. User opt-in path

A user who wants worktrees back sets in their project config:

```jsonc
{
  "experimental": {
    "worktree": {
      "enabled": true
    }
  }
}
```

Project config beats managed config in the existing merge order, so the user's `true` wins over the Prodex `false`. No user-side change is required for the drift instruction — it is a Prodex-wide product decision.

## Files Modified

| File | Change |
|------|--------|
| `packages/core/src/v1/config/config.ts` | Add `experimental.worktree.enabled` to the `Info` schema. |
| `packages/opencode/src/worktree/index.ts` | Add `DisabledError`, depend on `Config.Service`, short-circuit `create` and `createFromInfo` when the flag is `false`. |
| `packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts` | Extend the worktree endpoint error union to include `DisabledError`; translate domain error to public API error. |
| `.opencode/opencode.jsonc` | Set `experimental.worktree.enabled` to `false`; append the `subagent-driven-development` drift instruction to `instructions`. |

## Out of Scope

- Forking the `superpowers` package or modifying any skill body.
- Removing the worktree service, the `/experimental/worktree` routes, or the session-sandbox worktree mode.
- Changes to the `install-prodex` script or the release workflow (`prodex-config.tar.gz` already packages `.opencode/`, so the new `opencode.jsonc` flows out automatically once committed).
- Per-user override of the drift instruction. It is a Prodex-wide product decision; if a user disagrees, the cleanest path is forking Prodex.

## Success Criteria

1. On a clean Prodex install, `POST /experimental/worktree` returns a disabled error and no git worktree is created. `GET /experimental/worktree`, `DELETE /experimental/worktree`, and `POST /experimental/worktree/reset` keep working.
2. Setting `experimental.worktree.enabled: true` in a project's `.opencode/opencode.jsonc` re-enables worktree creation for that project only.
3. Sessions started in `workspace.worktree` mode (per-session user opt-in) continue to work regardless of the flag.
4. When `subagent-driven-development` is invoked under Prodex, the implementer subagent runs tasks consecutively and a single final code-quality reviewer subagent is dispatched once after the last task.
5. Type-check (`bun typecheck` from `packages/opencode` and `packages/core`) passes with the new schema and service dependency.
