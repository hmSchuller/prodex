# Prodex: Local CLI Release Script

**Date:** 2026-06-12
**Status:** Implemented
**Author:** opencode (auto-generated)

## Context

The existing fork-distribution spec (`2026-06-10`) defines a full GitHub Actions workflow for building and releasing Prodex. The user wants a simpler alternative: a local script that builds the CLI binary and uploads it to GitHub Releases, without CI, npm publishing, Docker, Homebrew, or AUR.

Current state:
- `packages/opencode/script/build.ts` already supports building cross-platform binaries
- `packages/opencode/script/build.ts` already supports uploading to GitHub Releases when `OPENCODE_RELEASE=true` and `GH_REPO` are set (line 232-241)
- `packages/script/src/index.ts` computes version by fetching `opencode-ai` from npm — not suitable for a fork
- No GitHub Releases exist yet on `hmSchuller/prodex`
- Release assets must be named `prodex-{platform}-{arch}.zip` per the self-contained install spec

## Requirements

1. Single command to build and release the CLI
2. Version is explicit (passed as argument), not derived from npm
3. Builds for current platform by default (fast iteration), with option for all platforms
4. Creates a GitHub Release on `hmSchuller/prodex` if it doesn't exist
5. Uploads binary archives to the release
6. Binary must be named `prodex` in the release asset (not `opencode`)
7. Release assets must follow the naming from the self-contained install spec: `prodex-darwin-arm64.zip`, `prodex-darwin-x64.zip`, `prodex-linux-arm64.tar.gz`, `prodex-linux-x64.tar.gz`

## Design

### 1. Script: `script/release-cli`

A bash script at the repo root. Entry point for local releases.

**Arguments:**
- `version` (required) — the release version, e.g., `1.17.4-prodex.1`
- `--single` (optional) — build only for the current platform
- `--dry-run` (optional) — print what would happen without doing it

**Environment:**
- Requires `gh` CLI authenticated with write access to `hmSchuller/prodex`
- Requires `bun` installed

### 2. Version Handling

The script sets `OPENCODE_VERSION` to the provided version argument. This bypasses the npm registry lookup in `packages/script/src/index.ts:37-48`.

The version follows the Prodex tagging convention from the fork distribution spec: `v{upstream_version}-prodex.{prodex_release}` — e.g., `1.17.4-prodex.1`.

The script passes the version to `OPENCODE_VERSION` which is embedded into the binary at compile time via the `define` block in `build.ts:191`.

### 3. Build Flow

1. Validate inputs (version arg present, `gh` authenticated)
2. Set environment variables:
   ```
   OPENCODE_VERSION={version}
   OPENCODE_RELEASE=true
   GH_REPO=hmSchuller/prodex
   OPENCODE_CHANNEL=latest
   ```
3. Create draft GitHub Release: `gh release create v{version} --draft --repo hmSchuller/prodex --title "v{version}"`
4. Run `bun run packages/opencode/script/build.ts` (with `--single` if requested)
   - The build script handles: compile binaries → create tar.gz/zip → upload to release via `gh release upload`
5. Rename assets: the build produces `opencode-{platform}-{arch}.zip/tar.gz` but the install spec expects `prodex-{platform}-{arch}.zip/tar.gz`. The script renames them after upload (or before, using `gh release upload --clobber`)
6. Publish the release: `gh release edit v{version} --draft=false --repo hmSchuller/prodex`

### 4. Asset Renaming

The build script (`build.ts:233-238`) creates archives named after the package name (`opencode`). The installer expects `prodex-*` names.

The script renames assets after the build produces them but before upload:

```bash
# In packages/opencode/dist/:
opencode-darwin-arm64.zip   → prodex-darwin-arm64.zip
opencode-darwin-x64.zip     → prodex-darwin-x64.zip
opencode-linux-arm64.tar.gz → prodex-linux-arm64.tar.gz
opencode-linux-x64.tar.gz   → prodex-linux-x64.tar.gz
```

The script also renames the binary inside each archive from `opencode` to `prodex` before uploading. This is done by extracting, renaming, and re-packaging.

### 5. Single-Platform Builds

With `--single`, the build script filters targets to only the current platform/arch (`build.ts:116-134`). This skips cross-compilation and is significantly faster (~30s vs ~5min).

The release is still created and published, but only contains the local platform's asset. Subsequent runs with `--single` on other machines (or CI) can upload additional assets to the same release using `--clobber`.

### 6. Dry-Run Mode

With `--dry-run`, the script prints:
- The version and tag
- Whether it's a single or full build
- The `gh` and `bun` commands it would run
- Exits without executing anything

### 7. Error Handling

- If the release tag already exists, abort with an error (use `gh release view v{version}` to check)
- If the build fails, leave the draft release in place for debugging, print the release URL
- If upload fails, retry once with `--clobber`

## Files to Create

| File | Description |
|------|-------------|
| `script/release-cli` | Bash script — build + release orchestrator |

## Files Modified

None. The script orchestrates existing build infrastructure via environment variables.

## Out of Scope

- npm package publishing
- Docker image publishing
- Homebrew formula updates
- AUR package updates
- SDK, plugin, or lildax publishing
- Desktop/electron builds
- CI workflow integration (covered by existing spec)
- Config tarball (`prodex-config.tar.gz`) — this is a separate asset handled by the CI workflow
- Code signing

## Success Criteria

1. `./script/release-cli 1.17.4-prodex.1` builds the current platform's binary, creates a GitHub Release, and uploads the asset
2. `./script/release-cli 1.17.4-prodex.1 --single` completes in under 60 seconds
3. `gh release view v1.17.4-prodex.1 --repo hmSchuller/prodex` shows the release with assets
4. The release asset is named `prodex-darwin-arm64.zip` (or the appropriate platform)
5. The binary inside the archive is named `prodex`
6. Re-running the same version fails cleanly with "release already exists"
