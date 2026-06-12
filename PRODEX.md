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

## Install Layout

Prodex installs into a self-contained directory under `~/.prodex/`:

- `~/.prodex/bin/prodex-bin` — the pinned opencode binary
- `~/.prodex/bin/prodex` — launcher that exports `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR` and execs `prodex-bin`
- `~/.prodex/config/` — managed team config, refreshed on every install/update

The installer adds `~/.prodex/bin` to your `PATH` (in `.zshrc`/`.bashrc`/`.profile`/`.config/fish/config.fish` as appropriate). It does not touch `~/.config/opencode/`, so a standalone opencode install at `~/.opencode/bin/opencode` or `/opt/homebrew/bin/opencode` can coexist without conflict.

## Update

Run the same command again:

```bash
curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | bash
```

The installer always refreshes `~/.prodex/config/` from `prodex-config.tar.gz` and rewrites the `prodex` launcher. If the installed `prodex-bin` already matches the latest release, it skips only the binary reinstall.

## Managed Config

Prodex treats `~/.prodex/config/` as managed team config. The installer replaces it from `prodex-config.tar.gz` on every install or update.

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

Do not edit the managed config directly. Put project-specific overrides in a project `.opencode/` directory.

## Migration From An Older Prodex Install

Earlier Prodex releases wrote the binary to `~/.opencode/bin/prodex` and the managed config to `~/.config/opencode/`. The current installer no longer touches either of those paths. To finish migrating an older install:

1. Run the new installer once. It will set up `~/.prodex/` and add `~/.prodex/bin` to your `PATH`.
2. Restart your shell, or `hash -r`, so the new `prodex` on `PATH` is picked up.
3. Verify with `which prodex` (should report `~/.prodex/bin/prodex`) and `prodex --version`.
4. Optionally remove the old artifacts:
   ```bash
   rm -rf ~/.opencode/bin/prodex
   rm -rf ~/.config/opencode
   ```
   Skip the `~/.config/opencode/` cleanup if you also use a standalone opencode whose config lives there.

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
