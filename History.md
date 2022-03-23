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
