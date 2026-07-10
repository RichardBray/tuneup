# Releasing

To cut a release: on a clean `main` branch, run `bun run release:patch` / `release:minor` / `release:major`.

This runs `bun pm version <bump>` (bumps package.json, commits, tags `vX.Y.Z`) then pushes the commit and tag. The `v*` tag push triggers `.github/workflows/release.yml`, which builds standalone binaries for macOS/Linux/Windows and creates the GitHub release with checksums.

Do not use `bun version` (npm-only, not a bun subcommand) - use `bun pm version`.
