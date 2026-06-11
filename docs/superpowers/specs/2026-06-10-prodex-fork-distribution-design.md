# Prodex: Fork + GitHub Releases Distribution

**Date:** 2026-06-10
**Status:** Approved
**Author:** opencode (auto-generated)

## Context

Prodex is a private fork of [opencode](https://github.com/anomalyco/opencode) (`hmSchuller/prodex`) maintained for internal team use. The goal is to distribute the built tool and configuration customizations to a small development team (2-5 people, CLI-comfortable) without requiring them to build from source.

Current state:
- Single remote (`origin`) pointing to `hmSchuller/prodex`
- No upstream remote configured
- Full `.opencode/` config with custom agents, skills, plugins, themes, commands
- Existing build scripts: `packages/opencode/script/build.ts`, `script/publish.ts`
- Pinned to upstream version `v1.17.3`

## Requirements

1. **Distribution:** Pre-built CLI binaries via GitHub Releases
2. **Installation:** One-command install for teammates (binary + configs)
3. **Updates:** Teammates can update by re-running the install command
4. **Upstream sync:** Pin to specific opencode versions, upgrade intentionally
5. **Shared customizations:** Dev conventions, `.opencode/` configs, custom agents, custom skills, curated plugins
6. **Low maintenance:** Minimal infrastructure to maintain
7. **Platform:** macOS only (darwin-arm64, darwin-x64)

## Design

### 1. Binary Naming

- Installed command: `prodex` (not `opencode`)
- Install directory: `~/.opencode/bin/prodex`
- Release asset names: `prodex-darwin-arm64.zip`, `prodex-darwin-x64.zip`
- Config asset: `prodex-config.tar.gz`

### 2. Upstream Remote

Add `upstream` remote pointing to `anomalyco/opencode`:

```bash
git remote add upstream git@github.com:anomalyco/opencode.git
```

**Version pinning workflow:**
1. Fetch upstream: `git fetch upstream --tags`
2. Create a version branch: `git checkout -b upgrade/v1.18.0 dev`
3. Merge upstream tag: `git merge v1.18.0`
4. Resolve conflicts, test, merge to `dev`
5. Trigger release

### 3. Install Script

Create `install-prodex` at the repo root, forked from the existing `install` script.

**Behavior:**
1. Detect OS/arch (macOS only: darwin-arm64, darwin-x64)
2. Download binary: `https://github.com/hmSchuller/prodex/releases/latest/download/prodex-{arch}.zip`
3. Download configs: `https://github.com/hmSchuller/prodex/releases/latest/download/prodex-config.tar.gz`
4. Install binary to `~/.opencode/bin/prodex`
5. Replace managed global configs in `~/.config/opencode/`
6. Run dependency installation in `~/.config/opencode/` when the config includes `package.json`
7. Add `~/.opencode/bin` to PATH if needed

The installer is Prodex-specific. It must not inspect, compare against, overwrite, or otherwise modify an existing upstream `opencode` installation. All version checks use `prodex --version`; all GitHub URLs point to `hmSchuller/prodex`; all installed binary paths, output messages, and usage instructions refer to `prodex`.

**Teammate install command:**
```bash
curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | bash
```

**Update behavior:** Same command. Always replaces managed configs from the latest release. Checks installed binary version against the latest release and skips only the binary install if already up-to-date.

### 4. Config Distribution

The `prodex-config.tar.gz` release asset contains the managed `.opencode/` directory contents. It is authoritative for the team-managed global config. The installer removes the managed global config paths in `~/.config/opencode/` before extracting the new config.

Prodex is a managed team distribution. Teammates should not edit the managed global config directly; local customization belongs in project-level `.opencode/` directories, which opencode merges over global config natively.

**Included in the config tarball:**
- `agent/` — custom agents (duplicate-pr, triage)
- `skills/effect/` — Effect v4 skill
- `command/` — 8 custom commands
- `plugins/` — TUI smoke plugin, Nord theme
- `themes/` — custom themes
- `tool/` — GitHub PR search, triage tools
- `glossary/` — team glossary entries
- `opencode.jsonc` — base config with references, provider settings
- `tui.json` — TUI-specific config
- `package.json` and `package-lock.json` — pinned dependencies for distributed plugins

**NOT included (project-specific):**
- `AGENTS.md` — must be copied per-project manually
- `node_modules/` — dependencies are installed after extraction
- `env.d.ts` — local generated typing support
- `.gitignore` — repository-only ignore rules
- `references/` — local reference checkouts/cache

**Local overrides:** Teammates can override global configs at the project level using `.opencode/` in their project directory. opencode's config merging handles this natively and keeps personal/project-specific changes outside the managed global config.

### 5. Release Workflow

Create `.github/workflows/release-prodex.yml`.

**Trigger:** Manual `workflow_dispatch` with:
- `upstream_version` input (e.g., `1.18.0`)
- `prodex_release` input (e.g., `1`)

Release tags use `v{upstream_version}-prodex.{prodex_release}`. The upstream version identifies the opencode base version. The Prodex release number increments for fork-only or config-only releases on the same upstream base and resets to `1` after upgrading to a new upstream opencode version.

Examples:
- `v1.17.3-prodex.1` — first Prodex release based on opencode `1.17.3`
- `v1.17.3-prodex.2` — config-only or fork-only update on the same upstream base
- `v1.18.0-prodex.1` — first Prodex release after upgrading to opencode `1.18.0`

**Permissions:**
```yaml
permissions:
  contents: write
```

**Jobs:**

#### `build` job
1. Checkout `dev` branch
2. Setup Bun
3. Run the existing build script once without `--single`
4. Select the generated macOS outputs: `opencode-darwin-arm64` and `opencode-darwin-x64`
5. Rename each binary from `opencode` to `prodex`
6. Package as `prodex-darwin-arm64.zip` and `prodex-darwin-x64.zip`
7. Upload artifacts

#### `config` job
1. Checkout `dev` branch
2. Package `.opencode/` contents as `prodex-config.tar.gz`, excluding `node_modules/`, `env.d.ts`, `.gitignore`, `references/`, and transient/generated local state
3. Upload artifact

#### `release` job (depends on `build`, `config`)
1. Download all artifacts
2. Create GitHub Release with tag `v{upstream_version}-prodex.{prodex_release}`
3. Upload all assets (binary zips + config tarball)

### 6. Documentation

Create `PRODEX.md` at repo root covering:
- What Prodex is
- Install/update commands
- How to pin to a new upstream version
- What's included in the config tarball

## Files to Create

| File | Description |
|------|-------------|
| `install-prodex` | Install script for binary + configs |
| `.github/workflows/release-prodex.yml` | Simplified macOS release workflow |
| `PRODEX.md` | Team onboarding documentation |

## Out of Scope

- Windows/Linux builds
- Electron/desktop builds
- npm package publishing
- Code signing
- Automated upstream sync
- CI/CD for fork-specific tests

## Success Criteria

1. Teammate can install Prodex (binary + configs) with one command
2. Teammate can update with the same command
3. You can trigger a release that builds and publishes binaries + configs
4. Upstream version pinning is documented and repeatable
