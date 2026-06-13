# Prodex Local Install Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `script/install-local` — a single command to build the opencode binary and install it as `prodex` to `~/.prodex/` for quick dev iteration.

**Architecture:** A bash script that orchestrates the existing `packages/opencode/script/build.ts` build pipeline, then copies the binary to `~/.prodex/bin/` with a wrapper script that sets the prodex config environment variables. Config is symlinked from the repo's `.opencode/` directory for live edits during development.

**Tech Stack:** Bash, existing Bun build toolchain

---

### Task 1: Create script skeleton with argument parsing and platform detection

**Files:**
- Create: `script/install-local`

- [ ] **Step 1: Create the script with usage, argument parsing, platform detection, and helper functions**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${REPO_ROOT}/packages/opencode"
DIST_DIR="${BUILD_DIR}/dist"
INSTALL_DIR="${HOME}/.prodex/bin"
CONFIG_DIR="${HOME}/.prodex/config"
INNER_BIN="prodex-bin"
WRAPPER_NAME="prodex"

MUTED='\033[0;2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

usage() {
  cat <<EOF
Prodex Local Install

Builds the CLI binary and installs it as 'prodex' to ~/.prodex/bin/
for quick dev iteration without the release pipeline.

Usage: install-local [options]

Options:
  -h, --help          Display this help message
      --skip-build    Skip the build step, use existing binary in dist/
      --copy-config   Copy .opencode/ instead of symlinking

Examples:
  ./script/install-local
  ./script/install-local --skip-build
  ./script/install-local --copy-config
EOF
}

log()   { printf "%b\n" "${GREEN}$*${NC}"; }
info()  { printf "%b\n" "${MUTED}$*${NC}"; }
error() { printf "%b\n" "${RED}$*${NC}" >&2; }

# ── Parse arguments ──────────────────────────────────────────────────

skip_build=false
copy_config=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --skip-build) skip_build=true; shift ;;
    --copy-config) copy_config=true; shift ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Detect platform ──────────────────────────────────────────────────

raw_os=$(uname -s)
case "$raw_os" in
  Darwin*) os="darwin" ;;
  *) error "Unsupported OS: $raw_os"; exit 1 ;;
esac

arch=$(uname -m)
case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64) arch="x64" ;;
  *) error "Unsupported architecture: $arch"; exit 1 ;;
esac

if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
  rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || true)
  if [[ "$rosetta_flag" == "1" ]]; then
    arch="arm64"
  fi
fi

target="${os}-${arch}"

log "Platform: ${target}"
```

- [ ] **Step 2: Make the script executable and verify it runs**

Run:
```bash
chmod +x script/install-local
./script/install-local --help
```
Expected: Usage text is printed.

- [ ] **Step 3: Commit**

```bash
git add script/install-local
git commit -m "feat(script): add install-local skeleton with arg parsing and platform detection"
```

---

### Task 2: Add the build step

**Files:**
- Modify: `script/install-local`

- [ ] **Step 1: Add the build section after platform detection**

Append to `script/install-local` after the `log "Platform: ${target}"` line:

```bash
# ── Build ────────────────────────────────────────────────────────────

if ! $skip_build; then
  log "Building CLI for ${target} (skipping web UI embed)..."

  if ! command -v bun >/dev/null 2>&1; then
    error "bun is required but not installed."
    exit 1
  fi

  bun run "${BUILD_DIR}/script/build.ts" --single --skip-embed-web-ui
else
  log "Skipping build (--skip-build)"
fi
```

- [ ] **Step 2: Verify the script still runs with --help**

Run:
```bash
./script/install-local --help
```
Expected: Usage text is printed (no build triggered).

- [ ] **Step 3: Commit**

```bash
git add script/install-local
git commit -m "feat(script): add build step to install-local"
```

---

### Task 3: Add the install step (binary, wrapper, config, PATH)

**Files:**
- Modify: `script/install-local`

- [ ] **Step 1: Add the install section after the build section**

Append to `script/install-local`:

```bash
# ── Locate binary ────────────────────────────────────────────────────

dist_name="opencode-${target}"
binary_path="${DIST_DIR}/${dist_name}/bin/opencode"

if [[ ! -f "$binary_path" ]]; then
  error "Binary not found at ${binary_path}"
  if $skip_build; then
    error "Run without --skip-build to build first."
  fi
  exit 1
fi

# ── Install binary ───────────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"
cp "$binary_path" "${INSTALL_DIR}/${INNER_BIN}"
chmod 755 "${INSTALL_DIR}/${INNER_BIN}"
log "Installed binary: ${INSTALL_DIR}/${INNER_BIN}"

# ── Write wrapper ────────────────────────────────────────────────────

write_wrapper() {
  cat > "${INSTALL_DIR}/${WRAPPER_NAME}" <<WRAPPER
#!/usr/bin/env bash
# Generated by install-local. Do not edit; rerun the script to update.
export OPENCODE_CONFIG="\${HOME}/.prodex/config/opencode.jsonc"
export OPENCODE_CONFIG_DIR="\${HOME}/.prodex/config"
exec "\${HOME}/.prodex/bin/${INNER_BIN}" "\$@"
WRAPPER
  chmod 755 "${INSTALL_DIR}/${WRAPPER_NAME}"
}

write_wrapper
log "Wrote wrapper: ${INSTALL_DIR}/${WRAPPER_NAME}"

# ── Install config ───────────────────────────────────────────────────

install_config() {
  local src="${REPO_ROOT}/.opencode"

  if [[ -L "$CONFIG_DIR" ]]; then
    rm -f "$CONFIG_DIR"
  elif [[ -d "$CONFIG_DIR" ]]; then
    rm -rf "$CONFIG_DIR"
  fi

  if $copy_config; then
    mkdir -p "$CONFIG_DIR"
    cp -R "${src}/" "${CONFIG_DIR}/"
    log "Copied config: ${CONFIG_DIR}"
  else
    ln -s "$src" "$CONFIG_DIR"
    log "Symlinked config: ${CONFIG_DIR} -> ${src}"
  fi
}

install_config

# ── Check PATH ───────────────────────────────────────────────────────

if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  echo ""
  info "~/.prodex/bin is not in your PATH."
  info "Add this to your shell config:"
  info "  export PATH=\"\$HOME/.prodex/bin:\$PATH\""
fi

# ── Done ─────────────────────────────────────────────────────────────

echo ""
log "Prodex installed. Run: prodex"
```

- [ ] **Step 2: Verify the script runs with --help**

Run:
```bash
./script/install-local --help
```
Expected: Usage text is printed.

- [ ] **Step 3: Commit**

```bash
git add script/install-local
git commit -m "feat(script): add install step to install-local (binary, wrapper, config, PATH)"
```

---

### Task 4: Smoke test the full flow

- [ ] **Step 1: Run install-local with --skip-build (requires existing build in dist/)**

If a build already exists:
```bash
./script/install-local --skip-build
```
Expected: Binary is installed, wrapper is written, config is symlinked, "Prodex installed" message.

If no build exists, run the full build:
```bash
./script/install-local
```
Expected: Builds the binary (~30-60s), then installs as above.

- [ ] **Step 2: Verify prodex runs**

Run:
```bash
~/.prodex/bin/prodex --version
```
Expected: Prints a version string.

- [ ] **Step 3: Verify config symlink**

Run:
```bash
ls -la ~/.prodex/config
```
Expected: Symlink pointing to `{repo}/.opencode/`.

- [ ] **Step 4: Verify wrapper sets env vars**

Run:
```bash
OPENCODE_CONFIG="" OPENCODE_CONFIG_DIR="" ~/.prodex/bin/prodex --version 2>&1
```
Expected: Prints version (wrapper overrides env vars).

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add script/install-local
git commit -m "fix(script): fix issues found during smoke test"
```
