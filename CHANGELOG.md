# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/oorabona/node-liblzma/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/oorabona/node-liblzma/compare/v2.2.0...v3.0.0
[2.0.3]: https://github.com/oorabona/node-liblzma/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/oorabona/node-liblzma/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/oorabona/node-liblzma/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/oorabona/node-liblzma/compare/v1.1.9...v2.0.0
[1.1.9]: https://github.com/oorabona/node-liblzma/releases/tag/v1.1.9
[v2.1.0]: https://github.com/oorabona/node-liblzma/releases/tag/v2.1.0
[2.1.0]: https://github.com/oorabona/node-liblzma/releases/tag/v2.1.0
[v2.2.0]: https://github.com/oorabona/node-liblzma/releases/tag/v2.2.0
[2.2.0]: https://github.com/oorabona/node-liblzma/releases/tag/v2.2.0