# Prodex

An opinionated fork of opencode, designed to get the most out of OpenAI Plus and OpenCode Go subscriptions.

## Why Prodex?

Prodex optimizes for a $30/month budget that covers both OpenAI Plus and OpenCode Go. This combination powers sophisticated workflows without breaking the bank.

**Premium models for planning.** When you need thorough designs, complex refactors, or architectural decisions, Prodex leverages premium models to think deeply and produce detailed plans.

**Opensource models as workhorses.** For day-to-day execution—writing code, running tests, making edits—Prodex uses cheap, capable opensource models that get the job done efficiently.

**Zero day retention.** Your conversations aren't stored. Each session starts fresh, giving you privacy by default without needing to manage deletion.

The result: a coding assistant that punches above its price class, using expensive models where they matter most and economical models everywhere else.

## Install

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

### Install Layout

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

## What's Included

Prodex ships with managed configuration optimized for the subscription-based workflow:

- **Managed plugins** — superpowers plugin for enhanced capabilities
- **Primary agents** — pre-configured agents for common workflows
- **Commit command** — built-in conventional commit support

The managed config lives in `~/.prodex/config/` and is refreshed on every install/update. Do not edit it directly—put project-specific overrides in a project `.opencode/` directory.

## Migration From An Earlier Prodex Install

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

## Release and Contributing

For release workflow, upstream upgrades, and contributing, see [PRODEX-RELEASES.md](PRODEX-RELEASES.md).
