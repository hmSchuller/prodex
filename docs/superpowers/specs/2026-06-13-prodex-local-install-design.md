# Prodex: Local Install Script

**Date:** 2026-06-13
**Status:** Draft

## Context

The existing `install-prodex` script downloads prodex binaries from GitHub Releases. The `script/release-cli` spec covers building and publishing releases. Neither covers the simple case: build the binary locally and install it as `prodex` for quick dev iteration without touching GitHub.

Current state:
- `bun dev` runs from source (no compilation, no prodex branding)
- `./packages/opencode/script/build.ts --single` compiles a Bun binary for the current platform
- `install-prodex --binary <path> --version <ver>` can install from a local binary, but requires a version arg and always downloads config from GitHub
- No single command exists to build + install as `prodex` locally

## Requirements

1. Single command to build the binary and install it as `prodex` to `~/.prodex/`
2. Skips the web UI embed for speed (dev iteration doesn't need it)
3. Config from `.opencode/` is available immediately (symlink for live edits)
4. The wrapper script sets `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR` matching prodex conventions
5. Option to skip build if binary already exists in `dist/`

## Design

### Script: `script/install-local`

A bash script at the repo root.

**Flags:**
- `--skip-build` — skip the build step, use existing binary in `packages/opencode/dist/`
- `--copy-config` — copy `.opencode/` instead of symlinking

**Flow:**

1. Build: `./packages/opencode/script/build.ts --single --skip-embed-web-ui`
2. Locate the built binary at `packages/opencode/dist/opencode-{os}-{arch}/bin/opencode`
3. Copy binary to `~/.prodex/bin/prodex-bin`
4. Write wrapper at `~/.prodex/bin/prodex`:
   ```bash
   #!/usr/bin/env bash
   export OPENCODE_CONFIG="${HOME}/.prodex/config/opencode.jsonc"
   export OPENCODE_CONFIG_DIR="${HOME}/.prodex/config"
   exec "${HOME}/.prodex/bin/prodex-bin" "$@"
   ```
5. Symlink `~/.prodex/config` → `{repo}/.opencode/` (or copy if `--copy-config`)
6. Ensure `~/.prodex/bin` is in PATH (print instructions if not)

### Platform Detection

Reuses the same logic as `install-prodex`: detect `os` from `uname -s`, `arch` from `uname -m`, with Rosetta fallback on macOS x64.

### Binary Naming

The build script produces `opencode-{platform}-{arch}/bin/opencode`. The install script renames it to `prodex-bin` when copying to `~/.prodex/bin/`.

## Files to Create

| File | Description |
|------|-------------|
| `script/install-local` | Bash script — build + local install |

## Files Modified

None.

## Out of Scope

- GitHub Release publishing (covered by `script/release-cli`)
- npm publishing
- Config tarball packaging
- Cross-platform builds
- Web UI embedding

## Success Criteria

1. `./script/install-local` builds and installs `prodex` to `~/.prodex/bin/prodex`
2. `prodex --version` works after install
3. Config changes in `.opencode/` are reflected immediately (symlink)
4. `./script/install-local --skip-build` skips the build step
5. Completes in under 60 seconds with `--skip-build`
