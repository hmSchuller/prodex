# Prodex Default-Behavior Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Prodex's distributed binary default to (a) refusing worktree creation unless `experimental.worktree.enabled` is `true`, and (b) skipping the per-task reviewer subagents in `subagent-driven-development` in favor of a single final review.

**Architecture:** Add one optional config field to the upstream `experimental` block. Gate `Worktree.create` and `Worktree.createFromInfo` on that field through a new `WorktreeDisabledError`. Add the new error name to the HTTP worktree error union so the existing handler maps it to a 400. Ship the override defaults in `.opencode/opencode.jsonc` (Prodex managed config): set the flag to `false` and append a single `instructions` entry that tells the agent to skip per-task reviews.

**Tech Stack:** TypeScript, Effect, opencode Schema, Bun, Drizzle (no DB changes), bun:test.

**Spec:** `docs/superpowers/specs/2026-06-23-prodex-default-behavior-overrides-design.md`

---

### Task 1: Add `experimental.worktree.enabled` to the config schema

**Files:**
- Modify: `packages/core/src/v1/config/config.ts:166-186`

- [ ] **Step 1: Add the field**

Open `packages/core/src/v1/config/config.ts`. Inside the `experimental: Schema.optional(Schema.Struct({ ... }))` block, add the new `worktree` field at the end (after `policies`, before the closing brace of the Struct):

```ts
worktree: Schema.optional(
  Schema.Struct({
    enabled: Schema.optional(Schema.Boolean).annotate({
      description:
        "Enable creation of new git worktrees via the worktree service. Listing, removing, and resetting existing worktrees still work when disabled. Defaults to true.",
    }),
  }),
),
```

- [ ] **Step 2: Verify type-check still passes**

Run: `bun typecheck` from `packages/core`
Expected: No errors. The new field is optional, so no other file needs to change for type-check to pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/v1/config/config.ts
git commit -m "feat(core): add experimental.worktree.enabled config field"
```

---

### Task 2: Add `WorktreeDisabledError` and config plumbing to the worktree service

**Files:**
- Modify: `packages/opencode/src/worktree/index.ts:1-153` (imports, error class, error union, layer)
- Modify: `packages/opencode/src/worktree/index.ts:297-309` (create, createFromInfo)

- [ ] **Step 1: Add the new typed error class**

In `packages/opencode/src/worktree/index.ts`, add a new error class next to the existing `NotGitError` (around line 64-66), following the same pattern:

```ts
export class DisabledError extends Schema.TaggedErrorClass<DisabledError>()("WorktreeDisabledError", {
  message: Schema.String,
}) {}
```

- [ ] **Step 2: Add `DisabledError` to the `Error` union**

Around line 98-106, add `DisabledError` to the exported `Error` union:

```ts
export type Error =
  | NotGitError
  | DisabledError
  | NameGenerationFailedError
  | CreateFailedError
  | StartCommandFailedError
  | RemoveFailedError
  | ResetFailedError
  | ListFailedError
```

- [ ] **Step 3: Add `Config.Service` to the layer requirements**

Update the `layer` type signature (lines 148-158) to require `Config.Service`:

```ts
export const layer: Layer.Layer<
  Service,
  never,
  | FSUtil.Service
  | Path.Path
  | AppProcess.Service
  | Git.Service
  | Project.Service
  | InstanceStore.Service
  | Database.Service
  | Config.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    // ...rest unchanged...
```

Add the import at the top of the file next to the other opencode-relative imports:

```ts
import { Config } from "@/config/config"
```

(Confirm this is the right import by checking an existing consumer; if `@/config/config` is the established path, use it.)

- [ ] **Step 4: Add `Config.defaultLayer` to `appLayer` and `node` providers**

Update `appLayer` (around line 633-640) to provide `Config.defaultLayer`:

```ts
export const appLayer = layer.pipe(
  Layer.provide(Git.defaultLayer),
  Layer.provide(AppProcess.defaultLayer),
  Layer.provide(Project.defaultLayer),
  Layer.provide(Database.defaultLayer),
  Layer.provide(FSUtil.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(NodePath.layer),
)
```

Update the `node` LayerNode (around line 644-652) to include `Config.node`:

```ts
export const node = LayerNode.make(layer, [
  FSUtil.node,
  path,
  AppProcess.node,
  Git.node,
  Project.node,
  InstanceStore.node,
  Database.node,
  Config.node,
])
```

Confirm the layer accessor name (`Config.node` vs `Config.defaultNode`) by reading `packages/opencode/src/config/config.ts` for the existing `node` export. If the file uses a different naming convention, mirror it exactly.

- [ ] **Step 5: Gate `create` and `createFromInfo` on the flag**

Update `create` (lines 305-309):

```ts
const create = Effect.fn("Worktree.create")(function* (input?: CreateInput) {
  const cfg = yield* config.get()
  if (cfg.experimental?.worktree?.enabled === false) {
    return yield* new DisabledError({ message: "Worktree creation is disabled by configuration" })
  }
  const info = yield* makeWorktreeInfo({ name: input?.name })
  yield* createFromInfo(info, input?.startCommand)
  return info
})
```

Update `createFromInfo` (lines 297-303) so the gate also protects the lower-level path:

```ts
const createFromInfo = Effect.fn("Worktree.createFromInfo")(function* (info: Info, startCommand?: string) {
  const cfg = yield* config.get()
  if (cfg.experimental?.worktree?.enabled === false) {
    return yield* new DisabledError({ message: "Worktree creation is disabled by configuration" })
  }
  yield* setup(info)
  yield* boot(info, startCommand).pipe(
    Effect.catchCause((cause) => Effect.logError("worktree bootstrap failed", { cause })),
    Effect.forkIn(scope),
  )
})
```

`makeWorktreeInfo`, `list`, `remove`, and `reset` are intentionally unchanged so existing worktrees can still be listed, removed, and reset.

- [ ] **Step 6: Verify type-check passes**

Run: `bun typecheck` from `packages/opencode`
Expected: No errors. If `Config.node` does not exist as a named export, use the correct export name from `packages/opencode/src/config/config.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/worktree/index.ts
git commit -m "feat(worktree): add experimental.worktree.enabled gate"
```

---

### Task 3: Surface `WorktreeDisabledError` through the HTTP worktree API

**Files:**
- Modify: `packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts:60-75`

- [ ] **Step 1: Add the new error literal to the `WorktreeErrorName` union**

In `packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts`, inside the `WorktreeErrorName` union (lines 60-68), add `Schema.Literal("WorktreeDisabledError")` next to the existing entries (alphabetical order matches the existing file's style):

```ts
const WorktreeErrorName = Schema.Union([
  Schema.Literal("WorktreeCreateFailedError"),
  Schema.Literal("WorktreeDisabledError"),
  Schema.Literal("WorktreeListFailedError"),
  Schema.Literal("WorktreeNameGenerationFailedError"),
  Schema.Literal("WorktreeNotGitError"),
  Schema.Literal("WorktreeRemoveFailedError"),
  Schema.Literal("WorktreeResetFailedError"),
  Schema.Literal("WorktreeStartCommandFailedError"),
])
```

The existing handler in `packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts` already maps any thrown worktree error to `WorktreeApiError` via `error._tag`, so adding the literal is sufficient — no handler change needed.

- [ ] **Step 2: Verify type-check passes**

Run: `bun typecheck` from `packages/opencode`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts
git commit -m "feat(server): expose WorktreeDisabledError on worktree endpoints"
```

---

### Task 4: Add a test for the disabled-flag short-circuit

**Files:**
- Create: `packages/opencode/test/project/worktree-disabled.test.ts`

- [ ] **Step 1: Create the test file**

Create `packages/opencode/test/project/worktree-disabled.test.ts` with the following content. The test pattern follows the existing worktree test file (`packages/opencode/test/project/worktree.test.ts`) and the `tmpdir({ config: ... })` injection pattern used in `packages/opencode/test/tool/task.test.ts:445`.

```ts
import { afterEach, describe, expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { Worktree } from "../../src/worktree"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Git } from "../../src/git"
import { disposeAllInstances, provideInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const baseLayer = Layer.mergeAll(
  Worktree.defaultLayer,
  Config.defaultLayer,
  FSUtil.defaultLayer,
  CrossSpawnSpawner.defaultLayer,
  Git.defaultLayer,
)
const it = testEffect(baseLayer)
const wintest = process.platform !== "win32" ? it.instance : it.instance.skip

describe("Worktree disabled flag", () => {
  afterEach(() => disposeAllInstances())

  wintest(
    "create returns DisabledError when experimental.worktree.enabled is false",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const config = yield* Config.Service

        // Read the opencode.json written by the fixture; merge the disabled flag on top.
        const base = yield* config.get()
        yield* config.update({
          ...base,
          experimental: { ...base.experimental, worktree: { enabled: false } },
        })

        const svc = yield* Worktree.Service
        const exit = yield* svc.create().pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const failure = Cause.failureOption(exit.cause)
          expect(failure._tag === "Some" ? failure.value._tag : undefined).toBe("WorktreeDisabledError")
        }

        // No worktree directory was created under the project's data path.
        const { Global } = yield* (yield* import("@opencode-ai/core/global")).Service
        const dataWorktree = yield* Effect.tryPromise(() =>
          import("node:fs/promises").then((fs) =>
            fs.readdir(Global.Path.data + "/worktree/" + test.projectId).catch(() => [] as string[]),
          ),
        )
        expect(dataWorktree).toEqual([])
      }),
    { git: true },
  )
})
```

Notes on this test:
- The exact `test.projectId` accessor name may differ in this fixture. If `TestInstance` does not expose `projectId`, look up the project via `Project.Service` and use the resulting `id`. Confirm by reading `packages/opencode/test/fixture/fixture.ts` and `packages/opencode/src/project/project.ts`.
- If `Config.Service.update` is not the right way to mutate config from a test, use the same injection pattern as `packages/opencode/test/tool/task.test.ts` (via `tmpdir({ config: ... })`) and drop the `config.update(...)` call. Pick whichever pattern matches the existing worktree-test file most closely.
- If `Effect.exit` does not give access to `Cause.failureOption` the way the snippet shows, mirror the failure-assertion style used in other worktree tests in `packages/opencode/test/project/`.

- [ ] **Step 2: Run the new test**

Run: `bun test packages/opencode/test/project/worktree-disabled.test.ts`
Expected: PASS. (If the test fails because of an accessor name mismatch — e.g. `TestInstance.projectId` — adjust the accessor to match the fixture and rerun.)

- [ ] **Step 3: Run the existing worktree tests to make sure they still pass**

Run: `bun test packages/opencode/test/project/worktree.test.ts packages/opencode/test/project/worktree-remove.test.ts`
Expected: PASS. The `Worktree.defaultLayer` change in Task 2 added `Config.defaultLayer` to the providers; this is automatic but the test should still work because the default config has the flag absent, so `create` proceeds normally.

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/test/project/worktree-disabled.test.ts
git commit -m "test(worktree): cover experimental.worktree.enabled disabled flag"
```

---

### Task 5: Apply the Prodex managed config overrides

**Files:**
- Modify: `.opencode/opencode.jsonc`

- [ ] **Step 1: Add the `experimental.worktree.enabled: false` block**

Open `.opencode/opencode.jsonc`. Add a new `experimental` block at the end of the top-level object (after the `plugin` array, before the closing `}`):

```jsonc
  "experimental": {
    "worktree": {
      "enabled": false
    }
  },
```

Trailing comma is fine because the file is `.jsonc`.

- [ ] **Step 2: Add the `instructions` array with the drift override**

In the same file, add a new `instructions` array. Place it after `experimental` (or before, ordering is irrelevant). Use a single-element array:

```jsonc
  "instructions": [
    "When using the superpowers:subagent-driven-development skill to execute an implementation plan, do NOT dispatch the per-task spec-compliance reviewer subagent or the per-task code-quality reviewer subagent. Tasks proceed straight from implementer self-review to the next task. After all tasks are complete, dispatch the single final code-quality reviewer subagent listed in the skill (\"Dispatch final code reviewer subagent for entire implementation\") before finishing the branch. The finishing-a-development-branch skill still runs at the end as the skill specifies."
  ],
```

- [ ] **Step 3: Verify the JSONC parses**

Run: `bun -e 'const c = await Bun.file(".opencode/opencode.jsonc").json(); console.log(JSON.stringify(c, null, 2))'`
Expected: Prints the parsed object. Confirm both `experimental.worktree.enabled === false` and `instructions` is a non-empty array.

- [ ] **Step 4: Commit**

```bash
git add .opencode/opencode.jsonc
git commit -m "feat(prodex-config): default worktree off, skip per-task reviews"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full type-check from the affected package directories**

Run: `bun typecheck` from `packages/core`
Run: `bun typecheck` from `packages/opencode`
Expected: Both pass with no new errors.

- [ ] **Step 2: Run the full worktree test suite**

Run: `bun test packages/opencode/test/project/worktree.test.ts packages/opencode/test/project/worktree-remove.test.ts packages/opencode/test/project/worktree-disabled.test.ts`
Expected: All PASS.

- [ ] **Step 3: Sanity check the worktree service still works for non-Prodex users**

Read `packages/opencode/src/worktree/index.ts` and confirm:
- `makeWorktreeInfo` is unchanged.
- `list`, `remove`, `reset` are unchanged.
- `create` and `createFromInfo` only short-circuit when `cfg.experimental?.worktree?.enabled === false`. Any other value (including `undefined`) lets the call proceed.
