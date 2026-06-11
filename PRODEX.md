# Prodex

Prodex is the internal team distribution of opencode. It is maintained in `hmSchuller/prodex` and ships a prebuilt `prodex` CLI plus managed team configuration.

## Install

Run:

```bash
curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | bash
```

Then start Prodex from a project directory:

```bash
prodex
```

The installer supports macOS on Apple Silicon and Intel:

- `darwin-arm64`
- `darwin-x64`

## Update

Run the same command again:

```bash
curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | bash
```

The installer always refreshes the managed config in `~/.config/opencode/`. If the installed `prodex` binary already matches the latest release, it skips only the binary reinstall.

## Managed Config

Prodex treats `~/.config/opencode/` as managed team config. The installer replaces it from `prodex-config.tar.gz` on every install or update.

Included managed config:

- `agent/`
- `skills/`
- `command/`
- `plugins/`
- `themes/`
- `tool/`
- `glossary/`
- `opencode.jsonc`
- `tui.json`
- `package.json`
- `package-lock.json`

Do not edit the managed global config directly. Put project-specific overrides in a project `.opencode/` directory.

## Release Tags

Prodex release tags use this format:

```text
v<upstream-opencode-version>-prodex.<prodex-release-number>
```

Examples:

- `v1.17.3-prodex.1`: first Prodex release based on opencode `1.17.3`
- `v1.17.3-prodex.2`: Prodex-only update on the same opencode base
- `v1.18.0-prodex.1`: first Prodex release after upgrading to opencode `1.18.0`

The `prodex` release number resets to `1` after each upstream opencode upgrade.

## Creating A Release

1. Push the intended release state to `dev`.
2. Open GitHub Actions for `hmSchuller/prodex`.
3. Run the `release-prodex` workflow manually.
4. Enter `upstream_version`, for example `1.18.0`.
5. Enter `prodex_release`, for example `1`.
6. Confirm the release contains these assets:

- `prodex-darwin-arm64.zip`
- `prodex-darwin-x64.zip`
- `prodex-config.tar.gz`

## Upgrading Upstream

Add the upstream remote once:

```bash
git remote add upstream git@github.com:anomalyco/opencode.git
```

For each upgrade:

```bash
git fetch upstream --tags
git checkout -b upgrade/v1.18.0 dev
git merge v1.18.0
```

Resolve conflicts, test the fork, merge back to `dev`, then create `v1.18.0-prodex.1` with the release workflow.