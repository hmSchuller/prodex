# Prodex Releases

Technical reference for creating releases and upgrading upstream opencode.

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
