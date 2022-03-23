Node-liblzma
==========

[![NPM Version](https://img.shields.io/npm/v/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![NPM Downloads](https://img.shields.io/npm/dm/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![Test on Linux](https://github.com/oorabona/node-liblzma/actions/workflows/ci-linux.yml/badge.svg)](https://github.com/oorabona/node-liblzma/actions/workflows/ci-linux.yml)
[![Test on MacOS](https://github.com/oorabona/node-liblzma/actions/workflows/ci-macos.yml/badge.svg)](https://github.com/oorabona/node-liblzma/actions/workflows/ci-macos.yml)
[![Test on Windows](https://github.com/oorabona/node-liblzma/actions/workflows/ci-windows.yml/badge.svg)](https://github.com/oorabona/node-liblzma/actions/workflows/ci-windows.yml)

# What is liblzma/XZ ?

[XZ](https://tukaani.org/xz/xz-file-format.txt) is a container for compressed archives. It is among the best compressors out there according to several benchmarks:
* [Gzip vs Bzip2 vs LZMA vs XZ vs LZ4 vs LZO](http://pokecraft.first-world.info/wiki/Quick_Benchmark:_Gzip_vs_Bzip2_vs_LZMA_vs_XZ_vs_LZ4_vs_LZO)
* [Large Text Compression Benchmark](http://mattmahoney.net/dc/text.html#2118)
* [Linux Compression Comparison (GZIP vs BZIP2 vs LZMA vs ZIP vs Compress)](http://bashitout.com/2009/08/30/Linux-Compression-Comparison-GZIP-vs-BZIP2-vs-LZMA-vs-ZIP-vs-Compress.html)

It has a good balance between compression time/ratio and decompression time/memory.

# About this project

This project aims towards providing:
* A quick and easy way to play with XZ compression:
Quick and easy as it conforms to zlib API, so that switching from __zlib/deflate__ to __xz__ might be as easy as a string search/replace in your code editor :smile:

* Complete integration with XZ sources/binaries:
You can either use system packages or download a specific version and compile it!
See [installation](#installation) below.

> Only LZMA2 is supported for compression output.
But the library can open and read any LZMA1 or LZMA2 compressed file.

# What's new ?

It has been quite some time since I first published this package.
In the meantime, [N-API](https://nodejs.org/api/n-api.html) eventually became the _de facto_ standard to provide stable ABI API for NodeJS Native Modules.

It therefore replaces good ol' [nan](https://github.com/nodejs/nan) !

It supports all NodeJS versions >= 12 and lots has been done to change CICD pipelines and testing.

It has been tested and works on:
- Linux x64 (Ubuntu)
- OSX (`macos-11`)
- Raspberry Pi 2/3/4 (both on 32-bit and 64-bit architectures)
- Windows (`windows-2019` and `windows-2022` are part of GitHub CI)

> Notes:
> - For [Windows](https://github.com/oorabona/node-liblzma/actions/workflows/ci-windows.yml)
> There is no "global" installation of the LZMA library on the Windows machine provisionned by GitHub, so it is pointless to build with this config
- For [Linux](https://github.com/oorabona/node-liblzma/actions/workflows/ci-linux.yml)
- For [MacOS](https://github.com/oorabona/node-liblzma/actions/workflows/ci-macos.yml)

## Prebuilt images

Several prebuilt versions are bundled within the package.
- Windows x86_64
- Linux x86_64
- MacOS x86_64 / Arm64

If your OS/architecture matches, you will use this version which has been compiled using the following default flags:

Flag | Description | Default value | Possible values
-----|-------------|---------------|----------------
USE_GLOBAL | Should the library use the system provided DLL/.so library ? | `yes` (`no` if OS is Windows) | `yes` or `no`
RUNTIME_LINK | Should the library be linked statically or use the shared LZMA library ? | `shared` | `static` or `shared`
ENABLE_THREAD_SUPPORT | Does the LZMA library support threads ? | `yes` | `yes` or `no`

If not `node-gyp` will automagically start compiling stuff according to the environment variables set, or the default values above.

If you want to change compilation flags, please read on [here](#installation).

# Related projects

Thanks to the community, there are several choices out there:
* [lzma-purejs](https://github.com/cscott/lzma-purejs)
A pure JavaScript implementation of the algorithm
* [node-xz](https://github.com/robey/node-xz)
Node binding of XZ library
* [lzma-native](https://github.com/addaleax/lzma-native)
A very complete implementation of XZ library bindings
* Others are also available but they fork "xz" process in the background.

# API comparison

```js
var lzma = require('node-liblzma');
```

Zlib            | XZlib                   | Arguments
----------------|-------------------------|---------------
createGzip      | createXz                | ([lzma_options, [options]])
createGunzip    | createUnxz              | ([lzma_options, [options]])
gzip            | xz                      | (buf, [options], callback)
gunzip          | unxz                    | (buf, [options], callback)
gzipSync        | xzSync                  | (buf, [options])
gunzipSync      | unxzSync                | (buf, [options])

## Constants

`options` is an `Object` with the following possible attributes:

Attribute            | Type     | Available options
---------------------|----------|------------
check                | Uint32   | NONE
 | |CRC32
 | |CRC64
 | |SHA256
preset | Uint32 | DEFAULT
 | |EXTREME
flag | Uint32 | TELL_NO_CHECK
 | |TELL_UNSUPPORTED_CHECK
 | |TELL_ANY_CHECK
 | |CONCATENATED
mode | Uint32 | FAST
 | |NORMAL
filters | Array | LZMA2 (added by default)
 | |X86
 | |POWERPC
 | |IA64
 | |ARM
 | |ARMTHUMB
 | |SPARC

For further information about each of these flags, you will find reference at [XZ SDK](http://7-zip.org/sdk.html).

# Installation

Well, as simple as this one-liner:

```sh
$ npm i node-liblzma --save
```

--OR--

```sh
$ yarn add node-liblzma
```

If you want to recompile the source, for example to disable threading support in the module, then you have to opt out with:

``` bash
$ ENABLE_THREAD_SUPPORT=no npm install node-liblzma --build-from-source
```

> Note:
Enabling thread support in the library will **NOT** work if the LZMA library itself has been built without such support.

To build the module, you have the following options:
1. Using system development libraries
2. Ask the build system to download `xz` and build it
3. Compile `xz` yourself, outside `node-liblzma`, and have it use it after

## Using system dev libraries to compile

You need to have the development package installed on your system. If you have Debian based distro:

```
# apt-get install liblzma-dev
```

## Automatic download and compilation to statically link `xz`

If you do not plan on having a local install, you can ask for automatic download and build of whatever version of `xz` you want.

Just do:

```sh
$ npm install node-liblzma --build-from-source
```

When no option is given in the commandline arguments, it will build with default values.

## Local install of `xz` sources (outside `node-liblzma`)

So you did install `xz` somewhere outside the module and want the module to use it.

For that, you need to set the include directory and library directory search paths as GCC [environment variables](https://gcc.gnu.org/onlinedocs/gcc/Environment-Variables.html).

```sh
$ export CPATH=$HOME/path/to/headers
$ export LIBRARY_PATH=$HOME/path/to/lib
$ export LD_LIBRARY_PATH=$HOME/path/to/lib:$LD_LIBRARY_PATH
```

The latest is needed for tests to be run right after.

Once done, this should suffice:

```sh
$ npm install
```

# Tests

You can run tests with:

```sh
$ npm test
```

It will build and launch tests suite with [Mocha](https://github.com/visionmedia/mocha).

# Usage

As the API is very close to NodeJS Zlib, you will probably find a good reference
[there](http://www.nodejs.org/api/zlib.html).

Otherwise examples can be found as part of the test suite, so feel free to use them!
They are written in [CoffeeScript](http://www.coffeescript.org).

# Bugs

If you find one, feel free to contribute and post a new issue!
PR are accepted as well :)

Kudos goes to [addaleax](https://github.com/addaleax) for helping me out with C++ stuff !

If you compile with threads, you may see a bunch of warnings about `-Wmissing-field-initializers`.
This is _normal_ and does not prevent threading from being active and working.
I did not yet figure how to fix this except by masking the warning..

# License

This software is released under [LGPL3.0+](LICENSE)
