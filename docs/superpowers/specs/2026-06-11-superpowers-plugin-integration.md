# Superpowers Plugin Integration

**Date:** 2026-06-11
**Status:** Implemented
**Author:** opencode (auto-generated)

## Context

Prodex is a managed team distribution of opencode. The team uses [superpowers](https://github.com/obra/superpowers), an opencode plugin that provides specialized skills and workflows for software engineering tasks (TDD, debugging, brainstorming, etc.).

Currently, superpowers is installed per-developer in the local opencode cache. To ensure all team members have it available out of the box, superpowers should be included in the managed Prodex config that is distributed via `prodex-config.tar.gz`.

## Requirements

1. **Zero-config availability:** Teammates get superpowers automatically after running the install command
2. **Version consistency:** All teammates use the same superpowers version from the upstream git repository
3. **Automatic dependency installation:** The installer handles `npm install`/`bun install` to fetch the git dependency
4. **No manual setup:** No per-developer configuration or cache population required

## Design

### 1. Dependency Declaration

Add superpowers as a git dependency in `.opencode/package.json`:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "1.17.3",
    "superpowers": "git+https://github.com/obra/superpowers.git"
  }
}
```

**Rationale:** Using a git dependency (without a pinned tag/commit) ensures the latest version is fetched on each install. The installer already runs `npm install` or `bun install` after extracting the config tarball.

### 2. Plugin Registration

Add superpowers to the plugin array in `.opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  // ... existing config ...
  "plugin": [
    "superpowers",
  ],
}
```

**Rationale:** The `plugin` array tells opencode to load superpowers on startup. The string `"superpowers"` matches the npm package name.

### 3. Distribution Flow

1. Release workflow packages `.opencode/` into `prodex-config.tar.gz`
2. Installer extracts tarball to `~/.config/opencode/`
3. Installer runs `npm install --prefix "$CONFIG_DIR"` (or `bun install --cwd "$CONFIG_DIR"`)
4. npm/bun resolves `"superpowers": "git+https://github.com/obra/superpowers.git"` and installs it
5. On next `prodex` startup, the plugin loader finds superpowers in `node_modules/` and loads it

## Files Modified

| File | Change |
|------|--------|
| `.opencode/package.json` | Added `superpowers` git dependency |
| `.opencode/opencode.jsonc` | Added `"superpowers"` to `plugin` array |

## Out of Scope

- Pinning to a specific superpowers commit/tag (can be added later if needed)
- Configuring superpowers options (none required currently)
- Adding superpowers skills to managed config (skills are bundled within the plugin)

## Success Criteria

1. After running `install-prodex`, superpowers is available in `~/.config/opencode/node_modules/`
2. Starting `prodex` loads the superpowers plugin without errors
3. All superpowers skills (brainstorming, TDD, debugging, etc.) are accessible to teammates
