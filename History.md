# History.md

> **Note**: This file is deprecated. Please see [CHANGELOG.md](./CHANGELOG.md) for the current changelog following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

# 2.0.0
* **Breaking**: Modernized testing framework from Mocha to Vitest
* **Breaking**: Modernized stack from Coffeescript to Typescript
* **Feature**: Added 100% code coverage (51 tests covering all statements, branches, functions, and lines)
* **Feature**: Implemented automatic filter reordering (LZMA2 filter automatically moved to end as required by liblzma)
* **Fix**: Resolved C++ exception handling issues with NAPI_DISABLE_CPP_EXCEPTIONS for better performance
* **Fix**: Corrected memory management in async operations (Ref/Unref balance)
* **Fix**: Fixed filter validation bug causing LZMA_OPTIONS_ERROR with multiple filters
* **CI**: Consolidated GitHub Actions workflows from 5 separate workflows to 1 unified pipeline
* **CI**: Enhanced caching strategy and matrix testing with conditional execution
* **CI**: Added path filters to avoid unnecessary CI runs for documentation-only changes
* **CI**: Optimized XZ source downloading with single download shared across all jobs
* **Performance**: Improved async callback handling and error management
* **Testing**: Added comprehensive edge case coverage including malformed inputs and threading tests
* **Testing**: Enhanced TypeScript configuration for better test reliability

# 1.1.9
* Fix building if no prebuilt binary found

# 1.1.7
* Fix build system
* Fix release system
* Fix documentation

# 1.1.0
* Refactor to deprecate Nan in favor of N-API
* Drop UBS building system to use standard `node-gyp`
* Support building on Linux, MacOSX and Windows
* Ability to build from preinstalled libraries as well as download from XZ website
* Deprecate Travis CI and AppVeyor to use GitHub Workflows

# 1.0.5
* Added CI for OSX and Windows
* Implemented use of node-pre-gyp instead of node-gyp
* Better build script, bug fixing.

# 1.0.3
* Updated to latest versions of dependencies
* NodeJS 6.x is now supported

# 1.0.2
* Fixed build.yml to work with new UBS 0.6.1.

# 1.0.1
* Fixed minor bugs

# 1.0.0
* All known bugs have been fixed
* JS Library has been renamed to ```lzma```, no big deal :smile:

# 0.5.0
* Rewrote large parts with Nan so now it supports 0.12+, 3+, 4+
* BUG: Apparently not anymore 0.10 ...
* Fixed syntax in XzStream.coffee

# 0.4.3
* Changes in build system (now using ubs to compile/run tests)
* Applied a fix for 'availInAfter' in stream callback, after [#6032](https://github.com/joyent/node/issues/6032)
* Fixed bad variable init in binding module

# 0.3.0
* Added multithread support
* ENABLE_MT is now available to compile with thread support
* Added new test cases

# 0.2.0
* Bug fixes :)
* Completed import of NodeJS Zlib API
* Full sync support
* Added new test cases (sync/async)

# 0.1.0
* Initial version
* C++ binding support ENCODE/DECODE
* Async support
