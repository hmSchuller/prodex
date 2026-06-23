import { afterEach, describe, expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Git } from "../../src/git"
import { Worktree } from "../../src/worktree"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(Worktree.defaultLayer, FSUtil.defaultLayer, CrossSpawnSpawner.defaultLayer, Git.defaultLayer),
)

describe("Worktree disabled flag", () => {
  afterEach(() => disposeAllInstances())

  it.instance(
    "create returns WorktreeDisabledError when experimental.worktree.enabled is false",
    () =>
      Effect.gen(function* () {
        const svc = yield* Worktree.Service
        const exit = yield* svc.create().pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const error = Cause.squash(exit.cause)
          expect(error).toBeInstanceOf(Worktree.DisabledError)
          if (error instanceof Worktree.DisabledError) {
            expect(error._tag).toBe("WorktreeDisabledError")
            expect(error.message).toBe("Worktree creation is disabled by configuration")
          }
        }
      }),
    { git: true, config: { experimental: { worktree: { enabled: false } } } },
  )

  it.instance(
    "createFromInfo also returns WorktreeDisabledError when the flag is false",
    () =>
      Effect.gen(function* () {
        const svc = yield* Worktree.Service
        const exit = yield* svc
          .createFromInfo({
            name: "should-never-exist",
            branch: "opencode/should-never-exist",
            directory: "/tmp/should-never-exist",
          })
          .pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const error = Cause.squash(exit.cause)
          expect(error).toBeInstanceOf(Worktree.DisabledError)
        }
      }),
    { git: true, config: { experimental: { worktree: { enabled: false } } } },
  )
})
