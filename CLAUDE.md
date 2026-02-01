# Project: node-liblzma

NodeJS wrapper for liblzma (XZ/LZMA2 compression library).

## Quick Start

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Project Structure

```
node-liblzma/
├── docs/                    # Documentation (see DOCUMENTATION_INDEX.md)
├── lib/                     # Compiled JavaScript output
├── src/
│   ├── bindings/            # Native C++ addon source
│   └── *.ts                 # TypeScript source files
├── scripts/                 # Build scripts (Python)
├── TODO.md                  # Main backlog
└── .claude/
    └── skills/
        └── project-experience/     # Project-specific skill
            ├── SKILL.md             # Patterns, conventions, setup
            └── GOTCHAS.md           # Project-specific gotchas
```

## Stack

- **Language:** TypeScript + C++ (native addon)
- **Package Manager:** pnpm
- **Test Framework:** Vitest 3.x
- **Linter:** Biome 2.x
- **Build:** node-gyp + tsc
- **Native:** node-addon-api (N-API)

## Conventions

### Code Style
- ESM modules (`"type": "module"`)
- Biome for linting and formatting
- TypeScript strict mode

### Git
- Branch naming: `<type>/<description>`
- Commit format: Conventional commits
- Pre-commit hook: nano-staged with Biome

### Testing
- Unit tests with Vitest
- Coverage with monocart or v8

## Commands Reference

| Action | Command |
|--------|---------|
| Install | `pnpm install` |
| Build TS | `pnpm build` |
| Build Native | `pnpm prebuildify` |
| Test | `pnpm test` |
| Test (watch) | `pnpm test:watch` |
| Test (coverage) | `pnpm test:coverage` |
| Lint | `pnpm lint` |
| Format | `pnpm format:write` |
| Check all | `pnpm check` |
| Typecheck | `pnpm type-check` |
| Release | `pnpm release` |

## Important Notes

- Native addon requires liblzma system library or will build from source
- Uses prebuildify for prebuilt binaries
- Supports Node.js >= 16.0.0
- License: LGPL-3.0

## Workflow Integration

This project uses the standard Claude Code workflow:
1. `/clarify` - Scope clarification
2. `/spec` - Specification production
3. `/implement` - Implementation
4. `/review` - Code review
5. `/finalize` - Story completion

Run `/workflow <task>` to execute the full cycle.
