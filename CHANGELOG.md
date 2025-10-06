# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
