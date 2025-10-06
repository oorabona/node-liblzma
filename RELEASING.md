# Release Process

## Prerequisites

1. Ensure all tests pass: `pnpm test`
2. Ensure build succeeds: `pnpm build`
3. Ensure working directory is clean: `git status`
4. Ensure you're on `master` branch: `git branch`
5. Ensure you have npm credentials: `npm whoami`

## Standard Release

### Step 1: Run release-it locally

```bash
# For patch release (1.1.9 → 1.1.10)
pnpm release patch

# For minor release (1.1.9 → 1.2.0)
pnpm release minor

# For major release (1.1.9 → 2.0.0)
pnpm release major
```

This will:
1. Update CHANGELOG.md (move [Unreleased] to new version section)
2. Bump version in package.json
3. Git commit with message "release: bump vX.Y.Z"
4. Create git tag vX.Y.Z
5. Push to GitHub

### Step 2: Wait for automated workflow

GitHub Actions will automatically:
1. Run full test suite
2. Build prebuilds for all platforms (3 OS × 4 Node versions)
3. Publish to npm with provenance
4. Create GitHub release

Monitor: https://github.com/oorabona/node-liblzma/actions

### Step 3: Verify release

1. Check npm: https://www.npmjs.com/package/node-liblzma
2. Check GitHub releases: https://github.com/oorabona/node-liblzma/releases
3. Test installation: `pnpm add node-liblzma@latest`

## Pre-release

For alpha/beta/rc releases, use the pre-release workflow:

```bash
# Trigger manually via GitHub UI
# https://github.com/oorabona/node-liblzma/actions/workflows/pre-release.yml
```

## Hotfix Release

For emergency patches on older versions:

```bash
pnpm release:hotfix
```

## Dry Run (Test Before Release)

Always test the release process without actually publishing:

```bash
# Dry run mode (no git push, no npm publish)
pnpm release major --dry-run
```

This will:
- Show you exactly what will happen
- Update local files (you can review)
- NOT push to GitHub
- NOT publish to npm

## Troubleshooting

### release-it fails with "Not authenticated"

Run: `npm login`

### Workflow fails with "NPM_TOKEN not found"

Contact repository admin to add NPM_TOKEN secret to GitHub repository settings.

### Tag already exists

Delete local and remote tag:

```bash
git tag -d v2.0.0
git push origin :refs/tags/v2.0.0
```

Then re-run: `pnpm release`

### Wrong branch

Ensure you're on `master`:

```bash
git checkout master
git pull origin master
```

## Release Architecture

The release process uses a **separation of concerns** approach:

1. **Local (Developer)**: Version management via `@oorabona/release-it-preset`
   - Updates CHANGELOG.md
   - Bumps package.json version
   - Creates git tag
   - Pushes to GitHub

2. **CI/CD (GitHub Actions)**: Build and publishing via `release.yml`
   - Runs tests
   - Builds platform-specific prebuilds
   - Publishes to npm with provenance
   - Creates GitHub release

This ensures:
- Developer controls version and changelog
- CI handles platform-specific builds (which can't be done locally)
- Clear audit trail for releases
- Automated quality gates before publishing
