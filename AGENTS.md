# Agent Instructions & Guidelines (AGENTS.md)

This file contains operational protocols, constraints, and release procedures that all AI agents working on this codebase must strictly follow.

---

## 🏷️ Version Tagging & Release Protocol

Whenever the user asks to **create a tag or release a new version** (e.g., `vX.Y.Z`):

You **MUST** synchronously update all version references across the following files **BEFORE** creating and pushing the git tag:

1. **`package.json`**: Bump `"version": "X.Y.Z"`
2. **`package-lock.json`**: Update lockfile version (recommended: run `npm version X.Y.Z --no-git-tag-version`)
3. **`src-tauri/Cargo.toml`**: Bump `version = "X.Y.Z"` under `[package]`
4. **`src-tauri/Cargo.lock`**: Synchronize lockfile (run `cargo check --manifest-path src-tauri/Cargo.toml`)
5. **`src-tauri/tauri.conf.json`**: Bump `"version": "X.Y.Z"`
6. **`Casks/smith.rb`**: Bump `version "X.Y.Z"`

### Step-by-Step Procedure:

```bash
# 1. Bump Node & Tauri versions
npm version X.Y.Z --no-git-tag-version

# 2. Update Cargo.toml & Cargo.lock
# (Edit src-tauri/Cargo.toml to version = "X.Y.Z", then run cargo check)
cargo check --manifest-path src-tauri/Cargo.toml

# 3. Update tauri.conf.json & Casks/smith.rb
# (Edit src-tauri/tauri.conf.json and Casks/smith.rb to version "X.Y.Z")

# 4. Verify test suite
npm test

# 5. Commit version bump to main
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json Casks/smith.rb
git commit -m "chore: release vX.Y.Z"
git push origin main

# 6. Create and push tag
git tag vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

---

## 🛠️ Verification & Test Commands

Always verify changes with the following commands before committing:

- **Full Project Build**: `npm run build` (`tsc && npm run build:ui && npm run build:server`)
- **Tauri Desktop Shell Check**: `cargo check --manifest-path src-tauri/Cargo.toml`
- **Vitest Test Suite**: `npm test`

---

## 📌 Naming Conventions

- The product name is **Smith**.
- Do **NOT** introduce "Smith ADE" or "Autonomous Agentic Development Environment" in user-facing copy, documentation, or configuration descriptors.
