# Prodex Fork Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Prodex as a macOS-only managed team distribution with GitHub Release binaries, managed global config, a one-command installer, and onboarding docs.

**Architecture:** Keep the fork distribution layer separate from upstream opencode internals. Add a Prodex-specific installer, a dedicated GitHub Actions release workflow, and documentation; reuse the existing opencode build script without modifying it. The installer owns user-machine setup and the workflow owns release artifact production.

**Tech Stack:** Bash, GitHub Actions, Bun, existing `packages/opencode/script/build.ts`, GitHub Releases, macOS zip assets, npm dependency installation for distributed `.opencode` plugins.

---

## File Structure

- Create `install-prodex`: Prodex-specific installer for macOS binaries and managed global config.
- Create `.github/workflows/release-prodex.yml`: manual release workflow that builds macOS binaries, packages managed config, and creates a GitHub Release.
- Create `PRODEX.md`: internal team documentation for installing, updating, releasing, and upgrading upstream.
- Modify `docs/superpowers/specs/2026-06-10-prodex-fork-distribution-design.md`: only if implementation discovers a necessary spec correction.

## Task 1: Create Prodex Installer

**Files:**
- Create: `install-prodex`

- [ ] **Step 1: Create the installer script**

Create `install-prodex` with this content:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP=prodex
REPO=hmSchuller/prodex
INSTALL_DIR="${HOME}/.opencode/bin"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

MUTED='\033[0;2m'
RED='\033[0;31m'
ORANGE='\033[38;5;214m'
NC='\033[0m'

usage() {
  cat <<EOF
Prodex Installer

Usage: install-prodex [options]

Options:
  -h, --help              Display this help message
  -v, --version <version> Install a specific Prodex release tag, with or without leading v
  -b, --binary <path>     Install from a local binary instead of downloading
      --no-modify-path    Don't modify shell config files (.zshrc, .bashrc, etc.)

Examples:
  curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | sh
  curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | sh -s -- --version v1.17.3-prodex.1
  ./install-prodex --binary /path/to/prodex
EOF
}

print_message() {
  local level=$1
  local message=$2
  local color=""

  case $level in
    info) color="${NC}" ;;
    warning) color="${ORANGE}" ;;
    error) color="${RED}" ;;
  esac

  printf "%b\n" "${color}${message}${NC}"
}

requested_version=${VERSION:-}
no_modify_path=false
binary_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -v|--version)
      if [[ -z "${2:-}" ]]; then
        print_message error "Error: --version requires a version argument"
        exit 1
      fi
      requested_version="$2"
      shift 2
      ;;
    -b|--binary)
      if [[ -z "${2:-}" ]]; then
        print_message error "Error: --binary requires a path argument"
        exit 1
      fi
      binary_path="$2"
      shift 2
      ;;
    --no-modify-path)
      no_modify_path=true
      shift
      ;;
    *)
      print_message warning "Warning: Unknown option '$1'"
      shift
      ;;
  esac
done

mkdir -p "$INSTALL_DIR"

raw_os=$(uname -s)
case "$raw_os" in
  Darwin*) os="darwin" ;;
  *)
    print_message error "Unsupported OS: $raw_os. Prodex releases are macOS-only."
    exit 1
    ;;
esac

arch=$(uname -m)
case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *)
    print_message error "Unsupported architecture: $arch"
    exit 1
    ;;
esac

if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
  rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || true)
  if [[ "$rosetta_flag" == "1" ]]; then
    arch="arm64"
  fi
fi

target="$os-$arch"
filename="${APP}-${target}.zip"
config_filename="prodex-config.tar.gz"

if ! command -v curl >/dev/null 2>&1; then
  print_message error "Error: curl is required but not installed."
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  print_message error "Error: unzip is required but not installed."
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  print_message error "Error: tar is required but not installed."
  exit 1
fi

if [[ -z "$requested_version" ]]; then
  release_api="https://api.github.com/repos/${REPO}/releases/latest"
  specific_version=$(curl -fsSL "$release_api" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
  if [[ -z "$specific_version" ]]; then
    print_message error "Failed to fetch latest Prodex release information"
    exit 1
  fi
  release_url="https://github.com/${REPO}/releases/latest/download"
else
  specific_version="${requested_version#v}"
  specific_version="v${specific_version}"
  release_url="https://github.com/${REPO}/releases/download/${specific_version}"
fi

binary_url="${release_url}/${filename}"
config_url="${release_url}/${config_filename}"

installed_version=""
if command -v prodex >/dev/null 2>&1; then
  installed_version=$(prodex --version 2>/dev/null || true)
fi

tmp_dir="${TMPDIR:-/tmp}/prodex_install_$$"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
mkdir -p "$tmp_dir"

install_binary() {
  if [[ -n "$binary_path" ]]; then
    if [[ ! -f "$binary_path" ]]; then
      print_message error "Error: Binary not found at ${binary_path}"
      exit 1
    fi
    cp "$binary_path" "${INSTALL_DIR}/${APP}"
    chmod 755 "${INSTALL_DIR}/${APP}"
    print_message info "Installed Prodex from local binary: ${INSTALL_DIR}/${APP}"
    return
  fi

  if [[ "$installed_version" == "$specific_version" ]]; then
    print_message info "Prodex ${specific_version} already installed; skipping binary install."
    return
  fi

  print_message info "Installing Prodex ${specific_version} for ${target}"
  curl -fL -o "${tmp_dir}/${filename}" "$binary_url"
  unzip -q "${tmp_dir}/${filename}" -d "${tmp_dir}/binary"
  mv "${tmp_dir}/binary/prodex" "${INSTALL_DIR}/${APP}"
  chmod 755 "${INSTALL_DIR}/${APP}"
}

install_config() {
  if [[ -n "$binary_path" && -n "${SKIP_PRODEX_CONFIG:-}" ]]; then
    print_message info "Skipping managed config install because SKIP_PRODEX_CONFIG is set."
    return
  fi

  print_message info "Installing managed Prodex config to ${CONFIG_DIR}"
  curl -fL -o "${tmp_dir}/${config_filename}" "$config_url"
  rm -rf "$CONFIG_DIR"
  mkdir -p "$CONFIG_DIR"
  tar -xzf "${tmp_dir}/${config_filename}" -C "$CONFIG_DIR"

  if [[ -f "${CONFIG_DIR}/package.json" ]]; then
    if command -v npm >/dev/null 2>&1; then
      npm install --prefix "$CONFIG_DIR"
    elif command -v bun >/dev/null 2>&1; then
      bun install --cwd "$CONFIG_DIR"
    else
      print_message warning "Managed config includes package.json, but neither npm nor bun is available. Plugin dependencies were not installed."
    fi
  fi
}

add_to_path() {
  local config_file=$1
  local command=$2

  if grep -Fxq "$command" "$config_file"; then
    print_message info "PATH entry already exists in $config_file."
  elif [[ -w "$config_file" ]]; then
    printf "\n# prodex\n%s\n" "$command" >> "$config_file"
    print_message info "Added prodex to PATH in $config_file"
  else
    print_message warning "Manually add this to $config_file or similar:"
    print_message info "  $command"
  fi
}

configure_path() {
  if [[ "$no_modify_path" == "true" ]]; then
    return
  fi

  if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
    return
  fi

  current_shell=$(basename "${SHELL:-sh}")
  case "$current_shell" in
    fish) config_files="$HOME/.config/fish/config.fish" ;;
    zsh) config_files="${ZDOTDIR:-$HOME}/.zshrc ${ZDOTDIR:-$HOME}/.zshenv" ;;
    bash) config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile" ;;
    *) config_files="$HOME/.profile" ;;
  esac

  config_file=""
  for file in $config_files; do
    if [[ -f "$file" ]]; then
      config_file="$file"
      break
    fi
  done

  if [[ -z "$config_file" ]]; then
    print_message warning "No shell config file found. Manually add:"
    print_message info "  export PATH=$INSTALL_DIR:\$PATH"
    return
  fi

  if [[ "$current_shell" == "fish" ]]; then
    add_to_path "$config_file" "fish_add_path $INSTALL_DIR"
    return
  fi

  add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH"
}

install_binary
install_config
configure_path

print_message info ""
print_message info "Prodex is installed. Start it with: prodex"
```

- [ ] **Step 2: Make the installer executable**

Run:

```bash
chmod +x install-prodex
```

Expected: command exits with status `0`.

- [ ] **Step 3: Verify help output is Prodex-specific**

Run:

```bash
./install-prodex --help
```

Expected: output contains `Prodex Installer`, `install-prodex`, and `prodex`; output does not contain `OpenCode Installer`.

- [ ] **Step 4: Verify unsupported platforms fail clearly if not macOS**

Run this only on non-macOS environments:

```bash
./install-prodex --no-modify-path
```

Expected: fails with `Unsupported OS:` and does not create or modify `~/.opencode/bin/prodex`.

- [ ] **Step 5: Commit installer**

```bash
git add install-prodex
git commit -m "feat: add prodex installer"
```

## Task 2: Add Prodex Release Workflow

**Files:**
- Create: `.github/workflows/release-prodex.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/release-prodex.yml` with this content:

```yaml
name: release-prodex

on:
  workflow_dispatch:
    inputs:
      upstream_version:
        description: "Upstream opencode version, without leading v"
        required: true
        type: string
      prodex_release:
        description: "Prodex release number for this upstream version"
        required: true
        type: string

permissions:
  contents: write

concurrency: release-prodex-${{ inputs.upstream_version }}-prodex.${{ inputs.prodex_release }}

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@f43a0e5ff2bd294095638e18286ca9a3d1956744
        with:
          ref: dev

      - uses: ./.github/actions/setup-bun

      - name: Build opencode binaries
        run: ./packages/opencode/script/build.ts
        env:
          OPENCODE_VERSION: ${{ inputs.upstream_version }}-prodex.${{ inputs.prodex_release }}

      - name: Package Prodex macOS binaries
        run: |
          set -euo pipefail
          mkdir -p prodex-artifacts

          for target in darwin-arm64 darwin-x64; do
            src="packages/opencode/dist/opencode-${target}/bin/opencode"
            work="prodex-artifacts/${target}"
            mkdir -p "$work"
            cp "$src" "$work/prodex"
            chmod 755 "$work/prodex"
            (cd "$work" && zip -r "../prodex-${target}.zip" prodex)
          done

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: prodex-binaries
          path: prodex-artifacts/prodex-darwin-*.zip

  config:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@f43a0e5ff2bd294095638e18286ca9a3d1956744
        with:
          ref: dev

      - name: Package managed config
        run: |
          set -euo pipefail
          tar \
            --exclude='node_modules' \
            --exclude='env.d.ts' \
            --exclude='.gitignore' \
            --exclude='references' \
            -czf prodex-config.tar.gz \
            -C .opencode \
            .

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: prodex-config
          path: prodex-config.tar.gz

  release:
    runs-on: ubuntu-latest
    needs:
      - build
      - config
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093
        with:
          path: artifacts

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: v${{ inputs.upstream_version }}-prodex.${{ inputs.prodex_release }}
        run: |
          set -euo pipefail
          gh release create "$TAG" \
            artifacts/prodex-binaries/prodex-darwin-arm64.zip \
            artifacts/prodex-binaries/prodex-darwin-x64.zip \
            artifacts/prodex-config/prodex-config.tar.gz \
            --title "$TAG" \
            --notes "Prodex release $TAG based on opencode ${{ inputs.upstream_version }}"
```

- [ ] **Step 2: Validate workflow YAML parses**

Run:

```bash
bun -e 'const text = await Bun.file(".github/workflows/release-prodex.yml").text(); if (!text.includes("release-prodex")) process.exit(1); if (!text.includes("prodex-darwin-arm64.zip")) process.exit(1); if (!text.includes("prodex-config.tar.gz")) process.exit(1); console.log("workflow smoke check passed")'
```

Expected: prints `workflow smoke check passed`.

- [ ] **Step 3: Verify the workflow references only Prodex release assets**

Run:

```bash
rg 'prodex-darwin-arm64|prodex-darwin-x64|prodex-config|opencode-linux|opencode-windows' .github/workflows/release-prodex.yml
```

Expected: output includes `prodex-darwin-arm64`, `prodex-darwin-x64`, and `prodex-config`; output does not include `opencode-linux` or `opencode-windows`.

- [ ] **Step 4: Commit workflow**

```bash
git add .github/workflows/release-prodex.yml
git commit -m "feat: add prodex release workflow"
```

## Task 3: Add Prodex Documentation

**Files:**
- Create: `PRODEX.md`

- [ ] **Step 1: Create team documentation**

Create `PRODEX.md` with this content:

````markdown
# Prodex

Prodex is the internal team distribution of opencode. It is maintained in `hmSchuller/prodex` and ships a prebuilt `prodex` CLI plus managed team configuration.

## Install

Run:

```bash
curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | sh
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
curl -fsSL https://raw.githubusercontent.com/hmSchuller/prodex/dev/install-prodex | sh
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
````

- [ ] **Step 2: Verify docs mention install, update, release, and upstream upgrade**

Run:

```bash
rg 'Install|Update|Creating A Release|Upgrading Upstream|v<upstream-opencode-version>-prodex' PRODEX.md
```

Expected: each searched topic appears in the output.

- [ ] **Step 3: Commit docs**

```bash
git add PRODEX.md
git commit -m "docs: add prodex distribution guide"
```

## Task 4: Verify Local Packaging Semantics

**Files:**
- Modify only if verification finds a release-blocking issue in `install-prodex`, `.github/workflows/release-prodex.yml`, or `PRODEX.md`.

- [ ] **Step 1: Create a local config tarball using workflow exclusions**

Run:

```bash
mkdir -p /tmp/prodex-plan-check && tar --exclude='node_modules' --exclude='env.d.ts' --exclude='.gitignore' --exclude='references' -czf /tmp/prodex-plan-check/prodex-config.tar.gz -C .opencode .
```

Expected: command exits with status `0` and creates `/tmp/prodex-plan-check/prodex-config.tar.gz`.

- [ ] **Step 2: Inspect tarball contents**

Run:

```bash
tar -tzf /tmp/prodex-plan-check/prodex-config.tar.gz | rg '(^\./package.json$|^\./package-lock.json$|^\./opencode.jsonc$|^\./tui.json$|node_modules|env.d.ts|references|\.gitignore)'
```

Expected: output includes `./package.json`, `./package-lock.json`, `./opencode.jsonc`, and `./tui.json`; output does not include `node_modules`, `env.d.ts`, `references`, or `.gitignore`.

- [ ] **Step 3: Check installer does not reference upstream release URLs**

Run:

```bash
rg 'anomalyco/opencode|opencode/releases|command -v opencode|which opencode|opencode --version|OpenCode Installer' install-prodex
```

Expected: no matches.

- [ ] **Step 4: Check installer does reference Prodex release URLs and command**

Run:

```bash
rg 'hmSchuller/prodex|prodex --version|APP=prodex|Prodex Installer' install-prodex
```

Expected: matches for all four patterns.

- [ ] **Step 5: Run package typecheck from the opencode package**

Run:

```bash
bun typecheck
```

Working directory: `packages/opencode`

Expected: exits with status `0`.

- [ ] **Step 6: Commit verification fixes if any were needed**

If Task 4 required edits, run:

```bash
git add install-prodex .github/workflows/release-prodex.yml PRODEX.md
git commit -m "fix: finalize prodex distribution packaging"
```

If Task 4 required no edits, do not create an empty commit.

## Task 5: Final Review

**Files:**
- Review: `install-prodex`
- Review: `.github/workflows/release-prodex.yml`
- Review: `PRODEX.md`
- Review: `docs/superpowers/specs/2026-06-10-prodex-fork-distribution-design.md`

- [ ] **Step 1: Confirm working tree state**

Run:

```bash
git status --short
```

Expected: only intentional files are modified, staged, or committed.

- [ ] **Step 2: Confirm spec success criteria map to implementation**

Check these mappings manually:

- One-command install: `install-prodex` and `PRODEX.md` install command.
- Update with same command: `install-prodex` always refreshes config and skips only current binary.
- Release builds binaries and config: `.github/workflows/release-prodex.yml` build, config, and release jobs.
- Upstream pinning documented: `PRODEX.md` upstream upgrade section.

Expected: each success criterion has an implementation path.

- [ ] **Step 3: Show final diff for review**

Run:

```bash
git show --stat --oneline HEAD~3..HEAD
```

Expected: recent commits include installer, workflow, docs, and any final packaging fix commit.

- [ ] **Step 4: Do not push or create a PR unless explicitly requested**

No command is needed. Stop and report the final state to the user.

## Self-Review

- Spec coverage: all requirements map to tasks: distribution via Task 2, installation/update via Task 1, upstream sync documentation via Task 3, shared config packaging via Tasks 1 and 2, macOS-only scope via Tasks 1 and 2.
- Placeholder scan: no placeholder markers or deferred implementation steps remain.
- Type and name consistency: assets use `prodex-darwin-arm64.zip`, `prodex-darwin-x64.zip`, and `prodex-config.tar.gz`; release tags use `v{upstream_version}-prodex.{prodex_release}`; command name is consistently `prodex`.
