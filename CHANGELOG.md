# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.1] - 2026-05-06

### ⚠️ BREAKING CHANGES
- scope package to @oorabona/nxz (#135) (nxz) ([a43c736](https://github.com/oorabona/node-liblzma/commit/a43c736))
- rename nxz-cli to nxz and bump to 7.0.0 (#134) (nxz) ([4db0a94](https://github.com/oorabona/node-liblzma/commit/4db0a94))
- redesign for v6 — universal stream-first API (#108) (tar-xz) ([b2c8a8c](https://github.com/oorabona/node-liblzma/commit/b2c8a8c))

### Added
- add --memlimit-decompress flag to CLI (#117) (nxz) ([2e3c25f](https://github.com/oorabona/node-liblzma/commit/2e3c25f))
- true streaming for Node extract()/list() — O(largest entry) (#113) (tar-xz) ([06a9937](https://github.com/oorabona/node-liblzma/commit/06a9937))
- wire memlimit through N-API decoder (#112) (native) ([0d09200](https://github.com/oorabona/node-liblzma/commit/0d09200))
- wire memlimit option through unxzAsync/unxz (#111) (wasm) ([6e2bc09](https://github.com/oorabona/node-liblzma/commit/6e2bc09))
- adopt Changesets for monorepo versioning + changelog generation (ci) ([adfbc99](https://github.com/oorabona/node-liblzma/commit/adfbc99))

### Changed
- enrich package metadata (description + keywords) for 3 packages (#141) ([5f0bb5b](https://github.com/oorabona/node-liblzma/commit/5f0bb5b))
- migrate TODO.md to TODO.local.md per private-backlog directive (#140) ([806bfc4](https://github.com/oorabona/node-liblzma/commit/806bfc4))
- sync llms.txt and CLAUDE.md to current monorepo state (#138) ([9f78901](https://github.com/oorabona/node-liblzma/commit/9f78901))
- refresh lockfile for latest transitive dependencies (deps) ([8d9f202](https://github.com/oorabona/node-liblzma/commit/8d9f202))
- refresh lockfile for latest transitive dependencies (deps) ([16fbaf7](https://github.com/oorabona/node-liblzma/commit/16fbaf7))
- refresh lockfile for latest transitive dependencies (deps) ([8f1be86](https://github.com/oorabona/node-liblzma/commit/8f1be86))
- document TarEntryTypeValue with JSDoc + expose in index (#137) (tar-xz) ([fe56124](https://github.com/oorabona/node-liblzma/commit/fe56124))
- refresh lockfile for latest transitive dependencies (deps) ([fbf8a0f](https://github.com/oorabona/node-liblzma/commit/fbf8a0f))
- refresh lockfile for latest transitive dependencies (deps) ([9f7968c](https://github.com/oorabona/node-liblzma/commit/9f7968c))
- add tar-xz API and nxz CLI to GitHub Pages (#133) (pages) ([2c22298](https://github.com/oorabona/node-liblzma/commit/2c22298))
- bump release-it-preset to 1.0.0-rc.0 and align Node CI (#132) (deps) ([dcf9427](https://github.com/oorabona/node-liblzma/commit/dcf9427))
- refresh lockfile for latest transitive dependencies (deps) ([2261c05](https://github.com/oorabona/node-liblzma/commit/2261c05))
- close 7 final coverage partials to reach 100% (#131) (tar-xz) ([0830fac](https://github.com/oorabona/node-liblzma/commit/0830fac))
- close 7 coverage partials with surgical v8 ignores (#130) (tar-xz) ([de86c0c](https://github.com/oorabona/node-liblzma/commit/de86c0c))
- close extract.ts coverage partials with v8 ignores (#129) (tar-xz) ([3abb041](https://github.com/oorabona/node-liblzma/commit/3abb041))
- close file.ts coverage partials with tests + v8 ignores (#128) (tar-xz) ([8e51020](https://github.com/oorabona/node-liblzma/commit/8e51020))
- cover three trivial file.ts branches (mtime=0, FILE type, mode=0) (#126) (tar-xz) ([5c496f8](https://github.com/oorabona/node-liblzma/commit/5c496f8))
- close remaining coverage gaps to 100% lines (#125) (tar-xz) ([7189f8e](https://github.com/oorabona/node-liblzma/commit/7189f8e))
- cover toAsyncIterable across Node and Browser variants (#124) (tar-xz) ([8c0f994](https://github.com/oorabona/node-liblzma/commit/8c0f994))
- wrap defensive-unreachable branches with v8 ignore start/stop (#123) (tar-xz) ([add1724](https://github.com/oorabona/node-liblzma/commit/add1724))
- restore 100% coverage on root src/ (errors.ts + pool.ts defensive guards) (#122) ([5e164e0](https://github.com/oorabona/node-liblzma/commit/5e164e0))
- restore 100% coverage on memlimit.ts after parser refactor (#121) (nxz) ([7c87610](https://github.com/oorabona/node-liblzma/commit/7c87610))
- close 3 follow-ups (preset 0.12, biome cleanup, parser CC refactor) (todo) ([de60b8f](https://github.com/oorabona/node-liblzma/commit/de60b8f))
- split parseMemlimitSize via extract-method (#120) (nxz) ([43c4d25](https://github.com/oorabona/node-liblzma/commit/43c4d25))
- remove dead biome suppression in tar-xz node-api spec (#119) (lint) ([49c7f14](https://github.com/oorabona/node-liblzma/commit/49c7f14))
- bump @oorabona/release-it-preset 0.11.0 → 0.12.0 (#118) (deps) ([7ac6d05](https://github.com/oorabona/node-liblzma/commit/7ac6d05))
- link upstream issue #21 for populate-script tag baseline follow-up (todo) ([ca6b389](https://github.com/oorabona/node-liblzma/commit/ca6b389))
- refresh lockfile for latest transitive dependencies (deps) ([9fcad2e](https://github.com/oorabona/node-liblzma/commit/9fcad2e))
- finalize nxz-cli v6.1.0 release notes and TODO ([9e30af4](https://github.com/oorabona/node-liblzma/commit/9e30af4))
- release v6.1.0 (nxz-cli) ([ecff028](https://github.com/oorabona/node-liblzma/commit/ecff028))
- close #25 per-package CHANGELOG scoping (PR #116) (todo) ([5833a22](https://github.com/oorabona/node-liblzma/commit/5833a22))
- scope per-package CHANGELOG via GIT_CHANGELOG_PATH (#116) (release) ([68d6d91](https://github.com/oorabona/node-liblzma/commit/68d6d91))
- close REFACTOR-BIOME-2026-04-29 (todo) ([9f37d1a](https://github.com/oorabona/node-liblzma/commit/9f37d1a))
- biome warnings sweep + cognitive-complexity extract-method (63→1) (#115) ([ad2e18f](https://github.com/oorabona/node-liblzma/commit/ad2e18f))
- clean up stale changesets — content shipped via release-it ([4d24fde](https://github.com/oorabona/node-liblzma/commit/4d24fde))
- release v6.1.0 (tar-xz) ([f22f6dc](https://github.com/oorabona/node-liblzma/commit/f22f6dc))
- finalize WIN32-TOCTOU-2026-04-29 — promote spec, mark TODO done ([1ee9db4](https://github.com/oorabona/node-liblzma/commit/1ee9db4))
- refresh lockfile for latest transitive dependencies (deps) ([06e9590](https://github.com/oorabona/node-liblzma/commit/06e9590))
- refresh lockfile for latest transitive dependencies (deps) ([f8f21d0](https://github.com/oorabona/node-liblzma/commit/f8f21d0))
- capture tar-xz v6 redesign in CHANGELOGs + TODO.md ([9abd0a2](https://github.com/oorabona/node-liblzma/commit/9abd0a2))
- release v5.0.1 (tar-xz) ([0c631f5](https://github.com/oorabona/node-liblzma/commit/0c631f5))
- sync workspace package versions to npm registry (3.2.0 -> 5.0.0) ([900a055](https://github.com/oorabona/node-liblzma/commit/900a055))
- refresh lockfile for latest transitive dependencies (deps) ([8345c25](https://github.com/oorabona/node-liblzma/commit/8345c25))
- propagate anti-flake cleanup pattern to 3 high-risk integration tests ([f752664](https://github.com/oorabona/node-liblzma/commit/f752664))
- add afterEach cleanup + timer tracking in error_recovery test (anti-flake) ([2d7f285](https://github.com/oorabona/node-liblzma/commit/2d7f285))
- refresh lockfile for latest transitive dependencies (deps) ([bc7e804](https://github.com/oorabona/node-liblzma/commit/bc7e804))
- refresh lockfile for latest transitive dependencies (deps) ([dedd2c1](https://github.com/oorabona/node-liblzma/commit/dedd2c1))
- bump @vitest/ui (#106) (deps-dev) ([276f0b4](https://github.com/oorabona/node-liblzma/commit/276f0b4))
- refresh lockfile for latest transitive dependencies (deps) ([8b7b5b9](https://github.com/oorabona/node-liblzma/commit/8b7b5b9))
- ignore pnpm/action-setup v6+ in Dependabot (corrupts lockfile) (ci) ([fd2cf8c](https://github.com/oorabona/node-liblzma/commit/fd2cf8c))
- refresh lockfile for latest transitive dependencies (deps) ([a01694e](https://github.com/oorabona/node-liblzma/commit/a01694e))
- refresh lockfile for latest transitive dependencies (deps) ([e2eca27](https://github.com/oorabona/node-liblzma/commit/e2eca27))
- refresh lockfile for latest transitive dependencies (deps) ([b1386e9](https://github.com/oorabona/node-liblzma/commit/b1386e9))
- refresh lockfile for latest transitive dependencies (deps) ([1ba850e](https://github.com/oorabona/node-liblzma/commit/1ba850e))
- refresh lockfile for latest transitive dependencies (deps) ([e66f8fb](https://github.com/oorabona/node-liblzma/commit/e66f8fb))
- refresh lockfile for latest transitive dependencies (deps) ([fd906d6](https://github.com/oorabona/node-liblzma/commit/fd906d6))
- refresh lockfile for latest transitive dependencies (deps) ([e085fa4](https://github.com/oorabona/node-liblzma/commit/e085fa4))
- bump @vitest/ui in the dev-dependencies group (#95) (deps-dev) ([01e828c](https://github.com/oorabona/node-liblzma/commit/01e828c))
- refresh lockfile for latest transitive dependencies (deps) ([cfe60ca](https://github.com/oorabona/node-liblzma/commit/cfe60ca))
- refresh lockfile for latest transitive dependencies (deps) ([1d0dd42](https://github.com/oorabona/node-liblzma/commit/1d0dd42))
- refresh lockfile for latest transitive dependencies (deps) ([775ed0f](https://github.com/oorabona/node-liblzma/commit/775ed0f))
- refresh lockfile for latest transitive dependencies (deps) ([9a66903](https://github.com/oorabona/node-liblzma/commit/9a66903))
- refresh lockfile for latest transitive dependencies (deps) ([3e2bd44](https://github.com/oorabona/node-liblzma/commit/3e2bd44))
- refresh lockfile for latest transitive dependencies (deps) ([d3bea99](https://github.com/oorabona/node-liblzma/commit/d3bea99))

### Fixed
- use absolute URLs in typedoc navigationLinks (#136) (docs) ([cd1185c](https://github.com/oorabona/node-liblzma/commit/cd1185c))
- include CHANGELOG.md and SECURITY.md in published tarball (tar-xz) ([408e955](https://github.com/oorabona/node-liblzma/commit/408e955))
- close Win32 symlink-swap TOCTOU with JS-pure 'wx'+retry fail-closed (#114) (tar-xz) ([b24040d](https://github.com/oorabona/node-liblzma/commit/b24040d))
- re-add @changesets/cli (was clobbered by pnpm add of changelog-github) (deps) ([6d76280](https://github.com/oorabona/node-liblzma/commit/6d76280))
- use 'changeset' so the bin resolves with --ignore-scripts (ci) ([78b91f7](https://github.com/oorabona/node-liblzma/commit/78b91f7))
- use always() in publish job to bypass skipped build (workspace target) (ci) ([2e08977](https://github.com/oorabona/node-liblzma/commit/2e08977))
- pin pnpm/action-setup to v5 in refresh-lockfile (v6 corrupts lockfile) (ci) ([f39d603](https://github.com/oorabona/node-liblzma/commit/f39d603))
- regenerate pnpm-lock.yaml (was broken with duplicate YAML document) (deps) ([e0c66ab](https://github.com/oorabona/node-liblzma/commit/e0c66ab))
- use squash merge in Dependabot auto-merge (linear history required) (ci) ([f3aee60](https://github.com/oorabona/node-liblzma/commit/f3aee60))
- point tar-xz demo Vite alias to browser entry ([8aea7ac](https://github.com/oorabona/node-liblzma/commit/8aea7ac))
- point demo Vite alias to browser entry (fixes docs build) ([e86dba5](https://github.com/oorabona/node-liblzma/commit/e86dba5))

## [5.0.0] - 2026-04-10

### ⚠️ BREAKING CHANGES
- drop Node.js 20 support, require >= 22 (Node 20 EOL April 2026) ([3cc4b14](https://github.com/oorabona/node-liblzma/commit/3cc4b14))

### Added
- drop Node.js 20 support, require >= 22 (Node 20 EOL April 2026) ⚠️ BREAKING ([3cc4b14](https://github.com/oorabona/node-liblzma/commit/3cc4b14))
- update XZ to v5.8.3 ([95cb868](https://github.com/oorabona/node-liblzma/commit/95cb868))

### Fixed
- add explicit types declaration for TypeScript 6 compatibility ([807f091](https://github.com/oorabona/node-liblzma/commit/807f091))
- remove GPG signing from XZ update checker (key mismatch) (ci) ([d9e2135](https://github.com/oorabona/node-liblzma/commit/d9e2135))
- also skip workspace package tests in XZ update checker (ci) ([9609ce4](https://github.com/oorabona/node-liblzma/commit/9609ce4))
- exclude WASM tests from XZ update checker workflow (ci) ([6bd6280](https://github.com/oorabona/node-liblzma/commit/6bd6280))
- authenticate GitHub API call and guard against null XZ version (ci) ([01bb0f4](https://github.com/oorabona/node-liblzma/commit/01bb0f4))
- correct failure detection logic in lockfile refresh workflow (ci) ([ff04cf8](https://github.com/oorabona/node-liblzma/commit/ff04cf8))
- use --ignore-scripts and replace tests with build+lint+typecheck (ci) ([df5df18](https://github.com/oorabona/node-liblzma/commit/df5df18))
- guard async onerror emission after stream close ([bf0ceaf](https://github.com/oorabona/node-liblzma/commit/bf0ceaf))
- update biome schema to 2.4.7 and remove obsolete biome-ignore ([ff74af0](https://github.com/oorabona/node-liblzma/commit/ff74af0))
- regenerate lockfile to resolve catalog: specifier mismatch ([444d2f0](https://github.com/oorabona/node-liblzma/commit/444d2f0))

### Changed
- update README for v5.0.0 (TS 6, Node 22, usage feedback section) ([4f788ea](https://github.com/oorabona/node-liblzma/commit/4f788ea))
- bump typescript from 5.9.3 to 6.0.2 (deps) ([499e00a](https://github.com/oorabona/node-liblzma/commit/499e00a))
- refresh lockfile for latest transitive dependencies (deps) ([791e802](https://github.com/oorabona/node-liblzma/commit/791e802))
- refresh lockfile for latest transitive dependencies (deps) ([2dcca0f](https://github.com/oorabona/node-liblzma/commit/2dcca0f))
- bump typescript from 5.9.3 to 6.0.2 (deps) ([b60c654](https://github.com/oorabona/node-liblzma/commit/b60c654))
- refresh lockfile for latest transitive dependencies (deps) ([4986854](https://github.com/oorabona/node-liblzma/commit/4986854))
- refresh lockfile for latest transitive dependencies (deps) ([d7acd12](https://github.com/oorabona/node-liblzma/commit/d7acd12))
- refresh lockfile for latest transitive dependencies (deps) ([6adcca0](https://github.com/oorabona/node-liblzma/commit/6adcca0))
- refresh lockfile for latest transitive dependencies (deps) ([39f2897](https://github.com/oorabona/node-liblzma/commit/39f2897))
- refresh lockfile for latest transitive dependencies (deps) ([0a64d7b](https://github.com/oorabona/node-liblzma/commit/0a64d7b))
- refresh lockfile for latest transitive dependencies (deps) ([6d88e20](https://github.com/oorabona/node-liblzma/commit/6d88e20))
- Merge pull request #91 from oorabona/update-xz-v5.8.3 ([b28cb65](https://github.com/oorabona/node-liblzma/commit/b28cb65))
- refresh lockfile for latest transitive dependencies (deps) ([fe8d366](https://github.com/oorabona/node-liblzma/commit/fe8d366))
- bump @vitest/ui from 4.1.0 to 4.1.2 in the dev-dependencies group (deps-dev) ([0b7d931](https://github.com/oorabona/node-liblzma/commit/0b7d931))
- refresh lockfile for latest transitive dependencies (deps) ([f6fc183](https://github.com/oorabona/node-liblzma/commit/f6fc183))
- refresh lockfile for latest transitive dependencies (deps) ([2103e1b](https://github.com/oorabona/node-liblzma/commit/2103e1b))
- refresh lockfile for latest transitive dependencies (deps) ([be8220a](https://github.com/oorabona/node-liblzma/commit/be8220a))
- bump @vitest/ui in the dev-dependencies group (deps-dev) ([c4a4f00](https://github.com/oorabona/node-liblzma/commit/c4a4f00))
- refresh lockfile for latest transitive dependencies (deps) ([ea7e065](https://github.com/oorabona/node-liblzma/commit/ea7e065))
- use gh CLI instead of curl for XZ version check (ci) ([8e78f4c](https://github.com/oorabona/node-liblzma/commit/8e78f4c))
- refresh lockfile for latest transitive dependencies (deps) ([85a6aba](https://github.com/oorabona/node-liblzma/commit/85a6aba))
- refresh lockfile for latest transitive dependencies (deps) ([71449c4](https://github.com/oorabona/node-liblzma/commit/71449c4))
- restore biome.json after PR creation path test ([7399457](https://github.com/oorabona/node-liblzma/commit/7399457))
- add force_change input and break biome to test PR creation path ([66f5745](https://github.com/oorabona/node-liblzma/commit/66f5745))
- temporarily break biome config to test refresh-lockfile PR path ([6638083](https://github.com/oorabona/node-liblzma/commit/6638083))
- refresh lockfile for latest transitive dependencies (deps) ([75d0c12](https://github.com/oorabona/node-liblzma/commit/75d0c12))
- bump the production-dependencies group with 4 updates (deps) ([aec594d](https://github.com/oorabona/node-liblzma/commit/aec594d))
- bump the production-dependencies group with 4 updates (deps) ([efd3121](https://github.com/oorabona/node-liblzma/commit/efd3121))
- bump vite from 7.3.1 to 8.0.0 (deps-dev) ([77174e6](https://github.com/oorabona/node-liblzma/commit/77174e6))
- bump vite from 7.3.1 to 8.0.0 (deps-dev) ([f9f323e](https://github.com/oorabona/node-liblzma/commit/f9f323e))
- bump the dev-dependencies group with 2 updates (deps-dev) ([3d4ea55](https://github.com/oorabona/node-liblzma/commit/3d4ea55))
- bump the dev-dependencies group with 2 updates (deps-dev) ([aea8e7e](https://github.com/oorabona/node-liblzma/commit/aea8e7e))

## [4.0.2] - 2026-03-19

### Fixed
- download XZ sources before WASM build in publish workflow (ci) ([3b02209](https://github.com/oorabona/node-liblzma/commit/3b02209))
- include WASM artifacts in npm publish pipeline ([774d989](https://github.com/oorabona/node-liblzma/commit/774d989))
- use lts-N dist-tag pattern for older major releases (ci) ([0753599](https://github.com/oorabona/node-liblzma/commit/0753599))
- use 'legacy' dist-tag instead of 'vN' (npm rejects semver-like tags) (ci) ([350f727](https://github.com/oorabona/node-liblzma/commit/350f727))
- auto-detect npm dist-tag for older major releases (ci) ([aa022d4](https://github.com/oorabona/node-liblzma/commit/aa022d4))
- remove macos-13 runner (no longer available on GitHub Actions) (ci) ([baa222a](https://github.com/oorabona/node-liblzma/commit/baa222a))

### Changed
- remove nightly schedule from CI workflow (ci) ([5d5c2a3](https://github.com/oorabona/node-liblzma/commit/5d5c2a3))
- update TODO.md with v4.0.1 release status ([b2d74eb](https://github.com/oorabona/node-liblzma/commit/b2d74eb))
- simplify npm dist-tag handling (ci) ([c03823b](https://github.com/oorabona/node-liblzma/commit/c03823b))

## [4.0.1] - 2026-03-13

### Fixed
- build separate macOS prebuilds for arm64 and x64 (ci) ([b0ab897](https://github.com/oorabona/node-liblzma/commit/b0ab897))
- build separate macOS prebuilds for arm64 and x64 (ci) ([d7c3232](https://github.com/oorabona/node-liblzma/commit/d7c3232))

## [4.0.0] - 2026-03-13

### ⚠️ BREAKING CHANGES
- remove deprecated default export and legacy string types ([5c958b6](https://github.com/oorabona/node-liblzma/commit/5c958b6))
- remove deprecated messages array (BREAKING) ([71a8f7e](https://github.com/oorabona/node-liblzma/commit/71a8f7e))

### Added
- remove deprecated default export and legacy string types ⚠️ BREAKING ([5c958b6](https://github.com/oorabona/node-liblzma/commit/5c958b6))
- remove deprecated messages array (BREAKING) ⚠️ BREAKING ([71a8f7e](https://github.com/oorabona/node-liblzma/commit/71a8f7e))

### Fixed
- use RELEASE_PAT to bypass ruleset for version bump push (ci) ([56164ee](https://github.com/oorabona/node-liblzma/commit/56164ee))
- split GPG import and committer identity for ghaction-import-gpg v7 (ci) ([d348972](https://github.com/oorabona/node-liblzma/commit/d348972))
- sync pnpm-lock.yaml with catalog specifiers (lockfile) ([d4073a9](https://github.com/oorabona/node-liblzma/commit/d4073a9))
- set macos matrix target to universal prebuild name (workflows) ([9f313dd](https://github.com/oorabona/node-liblzma/commit/9f313dd))
- set macos matrix target to universal prebuild name (workflows) ([f34682b](https://github.com/oorabona/node-liblzma/commit/f34682b))
- add non-null assertion for noUncheckedIndexedAccess compat (errors) ([6b4664c](https://github.com/oorabona/node-liblzma/commit/6b4664c))
- remove dead isUstarHeader export (tar-xz) ([5253776](https://github.com/oorabona/node-liblzma/commit/5253776))
- trigger publish.yml via workflow_dispatch instead of workflow_call (ci) ([98ae6dc](https://github.com/oorabona/node-liblzma/commit/98ae6dc))

### Changed
- add v4.0.0 release notes and migration guide ([eddce00](https://github.com/oorabona/node-liblzma/commit/eddce00))
- deduplicate types between index.d.ts and src/types.ts ([8683aaf](https://github.com/oorabona/node-liblzma/commit/8683aaf))
- extract createInputStream helper to shared utils (test) ([842ff6a](https://github.com/oorabona/node-liblzma/commit/842ff6a))
- default export removed — use named imports instead ([5c958b6](https://github.com/oorabona/node-liblzma/commit/5c958b6))
- legacy string types (CheckType, PresetType, FilterType, ModeType, FlagType) removed from index.d.ts — use numeric types ([5c958b6](https://github.com/oorabona/node-liblzma/commit/5c958b6))
- bump the production-dependencies group with 3 updates (deps) ([da198fb](https://github.com/oorabona/node-liblzma/commit/da198fb))
- bump the production-dependencies group with 3 updates (deps) ([f4002bf](https://github.com/oorabona/node-liblzma/commit/f4002bf))
- code health cleanup — dedup, CC reduction, TSDoc, coverage ([fed2915](https://github.com/oorabona/node-liblzma/commit/fed2915))
- achieve 100% branch coverage with v8 ignore start/stop (wasm) ([5455037](https://github.com/oorabona/node-liblzma/commit/5455037))
- improve streamBufferDecode branch coverage (wasm) ([3d22ba2](https://github.com/oorabona/node-liblzma/commit/3d22ba2))
- finalize backlog after full code health cleanup (todo) ([f0d1c62](https://github.com/oorabona/node-liblzma/commit/f0d1c62))
- reduce cognitive complexity in processBuffer and nxz CLI ([088a059](https://github.com/oorabona/node-liblzma/commit/088a059))
- remove dead guard, add coverage tests, improve TSDoc ([199eb5f](https://github.com/oorabona/node-liblzma/commit/199eb5f))
- update backlog after code health cleanup (todo) ([ea92228](https://github.com/oorabona/node-liblzma/commit/ea92228))
- code health cleanup — deduplicate, unify constants, fix shellcheck ([442e2a6](https://github.com/oorabona/node-liblzma/commit/442e2a6))
- update backlog after audit cleanup (todo) ([141769f](https://github.com/oorabona/node-liblzma/commit/141769f))
- improve streamBufferDecode branch coverage (wasm) ([b835b60](https://github.com/oorabona/node-liblzma/commit/b835b60))
- add inline WASM initialization tests (wasm) ([a826370](https://github.com/oorabona/node-liblzma/commit/a826370))
- enable noUncheckedIndexedAccess in tar-xz and nxz (packages) ([f96a080](https://github.com/oorabona/node-liblzma/commit/f96a080))
- add pnpm catalog for shared devDependencies (monorepo) ([f4c409e](https://github.com/oorabona/node-liblzma/commit/f4c409e))
- improve deprecation notice on messages array ([1fd62e3](https://github.com/oorabona/node-liblzma/commit/1fd62e3))
- bump node-addon-api from 8.5.0 to 8.6.0 in the production-dependencies group (deps) ([324da72](https://github.com/oorabona/node-liblzma/commit/324da72))
- bump the dev-dependencies group with 2 updates (deps-dev) ([cc874f1](https://github.com/oorabona/node-liblzma/commit/cc874f1))
- bump node-addon-api in the production-dependencies group (deps) ([5ad0b30](https://github.com/oorabona/node-liblzma/commit/5ad0b30))
- bump the dev-dependencies group with 2 updates (deps-dev) ([dedc3ed](https://github.com/oorabona/node-liblzma/commit/dedc3ed))
- add findings from astix project audit (todo) ([9078e5b](https://github.com/oorabona/node-liblzma/commit/9078e5b))
- remove obsolete root RELEASING.md (superseded by docs/RELEASING.md) ([b1490a2](https://github.com/oorabona/node-liblzma/commit/b1490a2))
- add native binding migration research (cmake-js, napi-rs) ([b79a056](https://github.com/oorabona/node-liblzma/commit/b79a056))
- remove downstream references from RELEASING.md ([d6d0518](https://github.com/oorabona/node-liblzma/commit/d6d0518))
- remove notify-downstream job, add Mermaid diagrams to RELEASING.md (ci) ([ec7f69d](https://github.com/oorabona/node-liblzma/commit/ec7f69d))
- add release process link, fix outdated test count and Node version (readme) ([fb6e0ff](https://github.com/oorabona/node-liblzma/commit/fb6e0ff))
- add release process documentation and fix pre-release Node matrix ([639e9c8](https://github.com/oorabona/node-liblzma/commit/639e9c8))
- update CHANGELOG, TODO, and memory for CI consolidation ([13dd7dc](https://github.com/oorabona/node-liblzma/commit/13dd7dc))

## [3.2.0] - 2026-02-28

### Added
- enable auto-merge on XZ update PRs (ci) ([eb4e2c7](https://github.com/oorabona/node-liblzma/commit/eb4e2c7))

### Fixed
- remove flaky timing assertion in async callback test (test) ([0e9349c](https://github.com/oorabona/node-liblzma/commit/0e9349c))
- revert import type from tar-xz, fix docs workflow step order (ci) ([20fd125](https://github.com/oorabona/node-liblzma/commit/20fd125))
- patch 5 dependabot alerts via pnpm overrides (security) ([451ac14](https://github.com/oorabona/node-liblzma/commit/451ac14))
- refresh lockfile to resolve 5 dependabot alerts (security) ([856bddd](https://github.com/oorabona/node-liblzma/commit/856bddd))

### Changed
- **Breaking**: bump engines.node to >=20 ([4169971](https://github.com/oorabona/node-liblzma/commit/4169971))
- move nxz CLI to packages/nxz/ standalone workspace package (cli) ([ec54c45](https://github.com/oorabona/node-liblzma/commit/ec54c45))
- reorganize tests into subdirectories (unit, integration, native, exports, cli) ([4169971](https://github.com/oorabona/node-liblzma/commit/4169971))
- upgrade Biome to 2.4.0, enable new lint rules ([e530f59](https://github.com/oorabona/node-liblzma/commit/e530f59))
- achieve 100% coverage for tar-xz and fix Codecov setup (test) ([b5d9ec8](https://github.com/oorabona/node-liblzma/commit/b5d9ec8))
- add packages/** to CI trigger paths (ci) ([e94026a](https://github.com/oorabona/node-liblzma/commit/e94026a))
- add workspace package build step to all CI workflows (ci) ([b166582](https://github.com/oorabona/node-liblzma/commit/b166582))
- bump the dev-dependencies group with 2 updates (deps-dev) ([d6a71cf](https://github.com/oorabona/node-liblzma/commit/d6a71cf))
- bump the dev-dependencies group with 3 updates (deps-dev) ([ca6c575](https://github.com/oorabona/node-liblzma/commit/ca6c575))
- bump vite from 6.4.1 to 7.3.1 (deps-dev) ([6cba706](https://github.com/oorabona/node-liblzma/commit/6cba706))

## [3.1.2] - 2026-02-06

### Changed
- align workspace package versions to root (3.1.1) and auto-sync in CI ([eaeeb5d](https://github.com/oorabona/node-liblzma/commit/eaeeb5d))

## [3.1.1] - 2026-02-06

### Fixed
- include prebuilds/ in npm package files ([71b2e0d](https://github.com/oorabona/node-liblzma/commit/71b2e0d))

## [3.1.0] - 2026-02-06

### Added
- add tar-xz library and nxz standalone CLI packages ([bb915c6](https://github.com/oorabona/node-liblzma/commit/bb915c6))

### Fixed
- restore packageManager field required by pnpm/action-setup ([ec6c358](https://github.com/oorabona/node-liblzma/commit/ec6c358))
- add USE_GLOBAL=false to coverage job for bundled liblzma build (ci) ([be6f7ad](https://github.com/oorabona/node-liblzma/commit/be6f7ad))
- add RUNTIME_LINK and ENABLE_THREAD_SUPPORT env vars to coverage job (ci) ([20adea6](https://github.com/oorabona/node-liblzma/commit/20adea6))
- add system deps and build cache to coverage job (ci) ([8d071b9](https://github.com/oorabona/node-liblzma/commit/8d071b9))
- use token param instead of env for Codecov action (ci) ([394b66b](https://github.com/oorabona/node-liblzma/commit/394b66b))
- remove tag push trigger from publish.yml and add manual-release workflow (ci) ([a7d6642](https://github.com/oorabona/node-liblzma/commit/a7d6642))

### Changed
- improve coverage to 100% lines/functions across all modules (coverage) ([a1ebf58](https://github.com/oorabona/node-liblzma/commit/a1ebf58))
- migrate poolOptions to Vitest 4 top-level config ([4faf866](https://github.com/oorabona/node-liblzma/commit/4faf866))
- add autoDecoderInit coverage tests (wasm) ([608ae36](https://github.com/oorabona/node-liblzma/commit/608ae36))
- bump the dev-dependencies group with 2 updates (deps-dev) ([7b11b3f](https://github.com/oorabona/node-liblzma/commit/7b11b3f))
- clean .npmrc and remove packageManager field ([f4dc9a4](https://github.com/oorabona/node-liblzma/commit/f4dc9a4))
- bump the dev-dependencies group with 2 updates (deps-dev) ([2a24fa8](https://github.com/oorabona/node-liblzma/commit/2a24fa8))
- improve coverage from 91% to 94.5% with targeted tests (wasm) ([63b9b5f](https://github.com/oorabona/node-liblzma/commit/63b9b5f))

## [3.0.0] - 2026-02-01

### Added
- **WebAssembly Browser Support**: Full WASM build of liblzma via Emscripten with API parity
  - `xzAsync()` / `unxzAsync()` — one-shot async compression/decompression
  - `xzSync()` / `unxzSync()` — synchronous variants (throw `LZMAError` in browser)
  - `createXz()` / `createUnxz()` — Web `TransformStream` for streaming in browsers
  - `parseFileIndex()` — pure TypeScript XZ index parser with real `uncompressedSize`
  - Two loading modes: fetch-based (`node-liblzma`) and inline base64 (`node-liblzma/inline`)
- **XZ Index Parsing**: Pure TypeScript parser for XZ file index, extracting uncompressed size, block count, and check type without requiring WASM initialization
- **Browser Demo**: Interactive example at `/examples/browser/` with progress bar, streaming, and WASM JIT warmup
- **WASM Build Pipeline**: Emscripten-based build script (`src/wasm/build.sh`) with CI integration
- **CLI Benchmarks**: `nxz --benchmark` script to compare performance against native `xz`
- **LLM Discoverability**: `llms.txt` for AI-assisted documentation discovery

### Changed
- **Breaking**: Package now exports conditional paths — `node-liblzma` resolves to native (Node.js) or WASM (browser) automatically
- **Breaking**: `createXz()` / `createUnxz()` return Web `TransformStream` in browser environments instead of Node.js Transform streams
- **README**: Complete restructure with Table of Contents, versioned changelog, and collapsible sections
- **Test Suite**: Expanded from 320+ to 458+ tests covering both native and WASM code paths
- **Coverage**: Configured meaningful exclusions (CLI, Emscripten glue, inline mode) — 91% statements

### Fixed
- **Progress Bar**: Resolved backpressure deadlock and UI thread blocking in browser streaming demo
- **WASM Memory**: Presets 7-9 correctly rejected when exceeding 256MB WASM memory limit
- **Error Recovery**: Fixed unhandled `LZMAProgrammingError` after stream close in error recovery tests
- **Security**: Resolved CodeQL alerts for TOCTOU race condition and biased random
- **CI**: Fixed WASM artifact flow, docs workflow build order, OIDC npm publish

## [2.2.0] - 2026-01-25

### Added
- add nxz command-line tool (cli) ([8506701](https://github.com/oorabona/node-liblzma/commit/8506701))
- add utility functions for improved DX ([02dadd7](https://github.com/oorabona/node-liblzma/commit/02dadd7))

### Changed
- update README badges ([face962](https://github.com/oorabona/node-liblzma/commit/face962))
- simplify commit message examples in contributing guide ([698508a](https://github.com/oorabona/node-liblzma/commit/698508a))
- create-tag → build-artifacts → publish ([6f98bb2](https://github.com/oorabona/node-liblzma/commit/6f98bb2))

## [2.1.0] - 2026-01-25

### Added
- add progress events to compression/decompression streams ([a9129a0](https://github.com/oorabona/node-liblzma/commit/a9129a0))
- update XZ to v5.8.2 ([fb4b407](https://github.com/oorabona/node-liblzma/commit/fb4b407))

### Fixed
- use RUNTIME_LINK=static for XZ update checks (ci) ([49dd1bd](https://github.com/oorabona/node-liblzma/commit/49dd1bd))
- add ENABLE_THREAD_SUPPORT for XZ from-source builds (ci) ([410f7f4](https://github.com/oorabona/node-liblzma/commit/410f7f4))
- add RUNTIME_LINK=static for XZ from-source builds (ci) ([fb21f19](https://github.com/oorabona/node-liblzma/commit/fb21f19))
- use USE_GLOBAL=false when testing new XZ versions (ci) ([795edf0](https://github.com/oorabona/node-liblzma/commit/795edf0))
- resolve security vulnerabilities in transitive dependencies (deps) ([ceb2ea3](https://github.com/oorabona/node-liblzma/commit/ceb2ea3))
- resolve all audit findings from multi-LLM review (core) ([8679c6e](https://github.com/oorabona/node-liblzma/commit/8679c6e))
- ERR_PACKAGE_PATH_NOT_EXPORTED (#40) ([3e414cc](https://github.com/oorabona/node-liblzma/commit/3e414cc))

### Changed
- add TypeDoc documentation with gh-pages deployment ([41376ff](https://github.com/oorabona/node-liblzma/commit/41376ff))
- Merge pull request #48 from oorabona/update-xz-v5.8.2 ([360bd71](https://github.com/oorabona/node-liblzma/commit/360bd71))
- use sensible defaults for build env vars (build) ([6c954b0](https://github.com/oorabona/node-liblzma/commit/6c954b0))
- update all dev dependencies to latest versions (deps) ([ad99118](https://github.com/oorabona/node-liblzma/commit/ad99118))
- bump the dev-dependencies group across 1 directory with 3 updates (#39) (deps-dev) ([1e0f637](https://github.com/oorabona/node-liblzma/commit/1e0f637))
- bump vite in the npm_and_yarn group across 1 directory (#34) (deps) ([e438407](https://github.com/oorabona/node-liblzma/commit/e438407))
- add CodeQL configuration file and update workflow to use it ([f00a1b0](https://github.com/oorabona/node-liblzma/commit/f00a1b0))
- add c8 ignores for the exceptional branches that we cannot test because "it shall not happen, ever" ([3758449](https://github.com/oorabona/node-liblzma/commit/3758449))
- optimize package size by 83% ! ([b1e8df1](https://github.com/oorabona/node-liblzma/commit/b1e8df1))
- linting ([22c8072](https://github.com/oorabona/node-liblzma/commit/22c8072))
- bump the dev-dependencies group with 3 updates (#26) (deps-dev) ([eec74b5](https://github.com/oorabona/node-liblzma/commit/eec74b5))

## [2.0.3] - 2025-10-07

### Fixed
- create dedicated .release-it.retry.json for publish workflow (ci) ([007ec61](https://github.com/oorabona/node-liblzma/commit/007ec61))
- ignore local .release-it.json in publish workflow (ci) ([0958cc3](https://github.com/oorabona/node-liblzma/commit/0958cc3))
- use correct release-it-preset CLI syntax (ci) ([210343e](https://github.com/oorabona/node-liblzma/commit/210343e))
- use npm config set for authentication (ci) ([8e6abcc](https://github.com/oorabona/node-liblzma/commit/8e6abcc))
- configure npm authentication in publish workflow (ci) ([5b085e4](https://github.com/oorabona/node-liblzma/commit/5b085e4))
- use tar.gz archives for cross-platform prebuild distribution (ci) ([bc6c213](https://github.com/oorabona/node-liblzma/commit/bc6c213))
- preserve prebuild directory structure to prevent file overwriting (ci) ([ac8f364](https://github.com/oorabona/node-liblzma/commit/ac8f364))
- remove build duplication and fix release-it command in publish workflow (ci) ([b0588ca](https://github.com/oorabona/node-liblzma/commit/b0588ca))
- skip build scripts in publish workflow (ci) ([eb7ab76](https://github.com/oorabona/node-liblzma/commit/eb7ab76))
- force bash shell for XZ download step on Windows (ci) ([73b6839](https://github.com/oorabona/node-liblzma/commit/73b6839))

## [2.0.2] - 2025-10-07

### Added
- refactor release workflow to use Pull Request strategy (ci) ([b2797fd](https://github.com/oorabona/node-liblzma/commit/b2797fd))
- optimize XZ management with artifacts and move prebuildify to CI-only (ci) ([de7d825](https://github.com/oorabona/node-liblzma/commit/de7d825))
- optimize XZ source management with artifacts and fix prebuildify PATH (ci) ([3984e19](https://github.com/oorabona/node-liblzma/commit/3984e19))
- optimize XZ source management with GitHub Actions artifacts (ci) ([0dec8f8](https://github.com/oorabona/node-liblzma/commit/0dec8f8))
- simplify republish workflow by removing target options and using boolean for npm publish (workflows) ([d1e188d](https://github.com/oorabona/node-liblzma/commit/d1e188d))

### Fixed
- remove CHANGELOG update and dry-run validation steps since default handles both directly (release) ([8ff80f8](https://github.com/oorabona/node-liblzma/commit/8ff80f8))
- skip native module compilation in release workflow (ci) ([53fc871](https://github.com/oorabona/node-liblzma/commit/53fc871))
- correct gyp staleness detection to prevent unconditional XZ downloads (build) ([6ed20dd](https://github.com/oorabona/node-liblzma/commit/6ed20dd))
- prevent double compilation and ensure prebuildify executes (ci) ([4dece66](https://github.com/oorabona/node-liblzma/commit/4dece66))
- add tag normalization and fix checkout refs for reproducible builds (workflows) ([2c7beee](https://github.com/oorabona/node-liblzma/commit/2c7beee))
- add automatic 'v' prefix normalization to prevent tag mismatch (workflows) ([862dd89](https://github.com/oorabona/node-liblzma/commit/862dd89))

## [2.0.1] - 2025-10-07

### Changed
- **Vitest Configuration**: Universal fork-based worker pool with increased timeouts to resolve Vitest bug #8201
  - Changed from conditional forks (macOS only) to universal forks for all platforms
  - Increased testTimeout from 5000ms to 10000ms
  - Added hookTimeout of 10000ms
  - Configured singleFork and isolate options for better stability
  - Increased workflow retry attempts from 3 to 5 for better reliability
- **CI/CD Workflow Architecture**:
  - Extracted hardcoded Node.js version to environment variable (NODE_VERSION: '22')
  - Added retry mechanism for all test executions (5 attempts with 10-minute timeout)
  - Changed `tags-ignore` to `tags` in ci-unified.yml to allow CI validation before releases
  - Removed duplicate test execution from release.yml (violates DRY and SRP principles)
  - Added check-ci job to verify CI passed before building prebuilds and publishing

### Fixed
- **Test Stability**: Fixed "Channel closed" (ERR_IPC_CHANNEL_CLOSED) errors on GitHub Actions macOS runners
- **Workflow Duplication**: Eliminated duplicate test execution between ci-unified.yml and release.yml
- **Release Safety**: Added CI verification step to ensure all checks pass before publishing to npm

## [2.0.0] - 2025-10-06

### Added
- **TypeScript Support**: Complete migration from CoffeeScript to TypeScript for better type safety and developer experience
- **Promise APIs**: New async functions `xzAsync()` and `unxzAsync()` with Promise support
- **Typed Error Classes**: 8 specialized error classes (`LZMAMemoryError`, `LZMADataError`, `LZMAFormatError`, etc.) with factory pattern for precise error handling
- **Concurrency Control**: `LZMAPool` class with EventEmitter-based monitoring for production environments
  - Automatic backpressure and queue management
  - Configurable concurrency limits
  - Real-time metrics (`active`, `queued`, `completed`, `failed`)
  - Events: `queue`, `start`, `complete`, `error-task`, `metrics`
- **File Helpers**: Simplified `xzFile()` and `unxzFile()` functions for file-based compression
- **Modern Testing**: Migrated from Mocha to Vitest with improved performance and TypeScript integration
- **100% Code Coverage**: Comprehensive test suite (320+ tests) covering all statements, branches, functions, and lines
- **Enhanced Tooling**:
  - [Biome](https://biomejs.dev/) for fast linting and formatting
  - Pre-commit hooks with nano-staged and simple-git-hooks
  - pnpm as package manager for better dependency management
- **Security**:
  - Fixed FunctionReference memory leak using smart pointers with custom deleter
  - Added 512MB buffer size validation to prevent DoS attacks
  - CodeQL workflow for continuous security scanning
  - Dependabot configuration for automated dependency updates
  - Enhanced tarball extraction with path validation and safety checks against path traversal
- **Thread Support**: Multi-threaded compression with configurable thread count
- **Automatic Filter Reordering**: LZMA2 filter automatically moved to end as required by liblzma
- **Factory Functions**: `createXz()` and `createUnxz()` to avoid circular dependencies in ESM
- **XZ Version Management**: Automated version tracking and update workflows for XZ Utils
- **CI/CD Enhancements**:
  - Unified CI pipeline with smart smoke/full test detection
  - Conditional test execution based on PR vs push vs schedule
  - Composite GitHub Actions for dependency installation and environment setup
  - XZ source caching with GitHub token support
  - Upgraded to setup-node v5 across all workflows
  - GITHUB_TOKEN environment variable for authenticated downloads
- **.gitattributes**: Line ending normalization for cross-platform consistency

### Changed
- **Breaking**: Requires Node.js >= 16 (updated from >= 12)
- **Breaking**: Module is now ESM-only (`"type": "module"`)
- **Build System**: Modernized to use CMake for XZ Utils compilation
  - Environment variable configuration for runtime linking (`RUNTIME_LINK=static|shared`)
  - Threading support configuration (`ENABLE_THREAD_SUPPORT=yes|no`)
  - Global liblzma usage option (`USE_GLOBAL=true|false`)
  - Disabled CLI tools to avoid libintl dependency on macOS
- **XZ Utils**: Updated from 5.6.3 to 5.8.1 with complete CMake support
- **macOS Support**: Enhanced dylib handling with proper RPATH configuration
  - Smart install_name verification and fixing for shared libraries
  - Proper linker flags via xcode_settings
  - Only applies install_name fixes to shared library builds
- **Windows Support**: Improved threading and DLL handling
  - Thread support now works with both static and shared builds
  - Fixed kernel32.lib linking for MSVC
  - Automated library name fixing for binding.gyp compatibility
  - Python-based DLL copying for better reliability
- **Vitest Configuration**: Fork-based worker pool on macOS to avoid IPC channel errors
- **CI Workflows**:
  - Consolidated from 5 workflows to 1 unified pipeline
  - Smoke tests and full tests are now mutually exclusive
  - Proper handling of skipped job states in CI summary
  - Enhanced caching strategy and matrix testing
  - Path filters to avoid unnecessary runs
- **Code Quality**: Simplified instance data management and improved buffer handling
- Standardized error messages (removed "BUG?" prefixes) for production-ready error handling
- Improved async callback handling and error management
- Enhanced TypeScript configuration for better test reliability

### Fixed
- **macOS Build Issues**:
  - Fixed dylib loading errors (`Library not loaded: @rpath/liblzma.5.dylib`)
  - Resolved libintl dependency issues by disabling XZ CLI tools
  - Fixed RPATH configuration in binding.gyp and CMake
  - Corrected install_name verification for shared vs static builds
- **Windows Build Issues**:
  - Fixed NAPI_VERSION redefinition error
  - Resolved DLL loading for shared library builds
  - Fixed threading support configuration
  - Corrected Windows library naming for compatibility
- **CI/CD Issues**:
  - Fixed pipeline failure when smoke test is skipped
  - Fixed conditional check for global liblzma usage
  - Removed unnecessary shell specifications
  - Fixed caching strategy and matrix configuration
- **Test Issues**:
  - Skip negative threads test if threading not supported
  - Fixed TypeScript error handling in tests
- **Code Issues**:
  - Resolved C++ exception handling with `NAPI_DISABLE_CPP_EXCEPTIONS`
  - Corrected memory management in async operations (Ref/Unref balance)
  - Fixed filter validation bug causing `LZMA_OPTIONS_ERROR` with multiple filters
  - Fixed memory leak in FunctionReference lifecycle management
  - Fixed memory leaks and race conditions in C++ bindings
  - Fixed filters array mutation by cloning in LZMAOptions
  - Fixed XzStream destructuring for clarity
  - Fixed LZMA2 filter ordering to ensure it's always last
- **General**:
  - Fixed download script symbolic link safety checks
  - Added `*.log` to .gitignore
  - Fixed tsconfig formatting
  - Improved code formatting consistency

## [1.1.9] - Previous Release

### Fixed
- Fix building if no prebuilt binary found

## [1.1.7]

### Fixed
- Fix build system
- Fix release system
- Fix documentation

## [1.1.0]

### Changed
- Refactor to deprecate Nan in favor of N-API
- Drop UBS building system to use standard `node-gyp`
- Support building on Linux, MacOSX and Windows
- Ability to build from preinstalled libraries as well as download from XZ website
- Deprecate Travis CI and AppVeyor to use GitHub Workflows

## [1.0.5]

### Added
- Added CI for OSX and Windows
- Implemented use of node-pre-gyp instead of node-gyp

### Fixed
- Better build script, bug fixing

## [1.0.3]

### Changed
- Updated to latest versions of dependencies

### Added
- NodeJS 6.x is now supported

## [1.0.2]

### Fixed
- Fixed build.yml to work with new UBS 0.6.1

## [1.0.1]

### Fixed
- Fixed minor bugs

## [1.0.0]

### Changed
- JS Library has been renamed to `lzma`

### Fixed
- All known bugs have been fixed

## [0.5.0]

### Changed
- Rewrote large parts with Nan so now it supports 0.12+, 3+, 4+

### Fixed
- Fixed syntax in XzStream.coffee

### Removed
- Apparently not anymore 0.10 support

## [0.4.3]

### Changed
- Changes in build system (now using ubs to compile/run tests)

### Fixed
- Applied a fix for 'availInAfter' in stream callback, after [#6032](https://github.com/joyent/node/issues/6032)
- Fixed bad variable init in binding module

## [0.3.0]

### Added
- Added multithread support
- ENABLE_MT is now available to compile with thread support
- Added new test cases

## [0.2.0]

### Added
- Full sync support
- Added new test cases (sync/async)

### Changed
- Completed import of NodeJS Zlib API

### Fixed
- Bug fixes

## [0.1.0] - Initial Release

### Added
- Initial version
- C++ binding support ENCODE/DECODE
- Async support

[Unreleased]: https://github.com/oorabona/node-liblzma/compare/v5.0.1...HEAD
[3.2.0]: https://github.com/oorabona/node-liblzma/compare/v3.1.2...v3.2.0
[3.1.2]: https://github.com/oorabona/node-liblzma/compare/v3.1.1...v3.1.2
[3.1.1]: https://github.com/oorabona/node-liblzma/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/oorabona/node-liblzma/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/oorabona/node-liblzma/compare/v2.2.0...v3.0.0
[2.0.3]: https://github.com/oorabona/node-liblzma/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/oorabona/node-liblzma/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/oorabona/node-liblzma/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/oorabona/node-liblzma/compare/v1.1.9...v2.0.0
[1.1.9]: https://github.com/oorabona/node-liblzma/releases/tag/v1.1.9
[2.1.0]: https://github.com/oorabona/node-liblzma/compare/v2.0.3...v2.1.0
[2.2.0]: https://github.com/oorabona/node-liblzma/compare/v2.1.0...v2.2.0
[v4.0.0]: https://github.com/oorabona/node-liblzma/releases/tag/v4.0.0
[4.0.0]: https://github.com/oorabona/node-liblzma/releases/tag/v4.0.0
[v4.0.1]: https://github.com/oorabona/node-liblzma/releases/tag/v4.0.1
[4.0.1]: https://github.com/oorabona/node-liblzma/releases/tag/v4.0.1
[v4.0.2]: https://github.com/oorabona/node-liblzma/releases/tag/v4.0.2
[4.0.2]: https://github.com/oorabona/node-liblzma/releases/tag/v4.0.2
[v5.0.0]: https://github.com/oorabona/node-liblzma/releases/tag/v5.0.0
[5.0.0]: https://github.com/oorabona/node-liblzma/releases/tag/v5.0.0
[v5.0.1]: https://github.com/oorabona/node-liblzma/releases/tag/v5.0.1
[5.0.1]: https://github.com/oorabona/node-liblzma/releases/tag/v5.0.1