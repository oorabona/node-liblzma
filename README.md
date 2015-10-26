Node-liblzma
==========

[![NPM Version](https://img.shields.io/npm/v/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![NPM Downloads](https://img.shields.io/npm/dm/node-liblzma.svg)](https://npmjs.org/package/node-liblzma)
[![Build Status](https://travis-ci.org/oorabona/node-liblzma.png)](https://travis-ci.org/oorabona/node-liblzma)
[![Dependency Status](https://david-dm.org/oorabona/node-liblzma.svg)](https://david-dm.org/oorabona/node-liblzma)
[![devDependency Status](https://david-dm.org/oorabona/node-liblzma/dev-status.svg)](https://david-dm.org/oorabona/node-liblzma#info=devDependencies)

An other way to deal with the XZ compression format in NodeJS !
Now supports NodeJS 0.12+, and all flavors of iojs/nodejs 3+/4+ !!

# What is liblzma/XZ ?

[XZ](http://tukaani.org/xz/xz-file-format.txt) is a container for compressed
archives. It is among the best
compressors out there according to several benchmarks:
* [Gzip vs Bzip2 vs LZMA vs XZ vs LZ4 vs LZO](http://pokecraft.first-world.info/wiki/Quick_Benchmark:_Gzip_vs_Bzip2_vs_LZMA_vs_XZ_vs_LZ4_vs_LZO)
* [Large Text Compression Benchmark](http://mattmahoney.net/dc/text.html#2118)
* [Linux Compression Comparison (GZIP vs BZIP2 vs LZMA vs ZIP vs Compress)](http://bashitout.com/2009/08/30/Linux-Compression-Comparison-GZIP-vs-BZIP2-vs-LZMA-vs-ZIP-vs-Compress.html)

It has a good balance between compression time/ratio and decompression time/memory.

# About this project

This project is close to node-xz or lzma-native as I have chosen to bind XZ library to NodeJS.
But there are some differences:

* Both download and deploy a specific liblzma version to be compiled from the sources.
I did not want to rely on an embedded liblzma version and instead use the system
one (most Linux distros have liblzma, if not look at INSTALL below) ;

* (Almost) complete NodeJS Zlib API / implementation compatibility so that switching
from __zlib/deflate__ to __xz__ might be as easy as a string search/replace in your code editor :smile:

> Also, as stated in src/liblzma/api/lzma/lzma12.h

> "LZMA1 shouldn't be used for new applications unless you _really_ know
> what you are doing. LZMA2 is almost always a better choice."

Therefore only LZMA2 is supported by this interface.

# Related projects

Thanks to the community, there are several choices out there:
* [lzma-purejs](https://github.com/cscott/lzma-purejs)
A pure JavaScript implementation of the algorithm
* [node-xz](https://github.com/robey/node-xz)
Node binding of XZ library
* [lzma-native](https://github.com/addaleax/lzma-native)
A very complete implementation of XZ library bindings
* Others are also available but they fork "xz" process in the background.

# Installation

## Using system dev libraries to compile

You need to have the development package installed on your system. So you can
either install it manually by downloading [XZ SDK](http://tukaani.org/xz/) and
build it, or if you have root access, you can do (e.g. if you have Debian based distro):

``` bash
# apt-get install liblzma-dev
```

## Using temporary beta install to enable multi threading (fast and easy)

If you do not plan on having a local install, with the use of [UBS](https://github.com/oorabona/ubs),
you do not need to download/configure/install XZ yourself anymore.

You can temporary build XZ with threads enabled just for this library by running:

```bash
$ ENABLE_MT=1 npm install
```

## Local install of XZ sources (manual)

If you did install locally, set the include directory and library directory search paths
as GCC [environment variables](https://gcc.gnu.org/onlinedocs/gcc/Environment-Variables.html).

``` bash
$ export CPATH=$HOME/path/to/headers
$ export LIBRARY_PATH=$HOME/path/to/lib
$ export LD_LIBRARY_PATH=$HOME/path/to/lib:$LD_LIBRARY_PATH
```

The latest is needed for tests to be run right after.

Once done, a simple:

``` bash
$ npm install
```

Will build and launch tests suite with [Mocha](https://github.com/visionmedia/mocha).

If you want to try the __unstable__ threading support, then opt in with

``` bash
$ ENABLE_MT=1 npm install
```

> This will work only if you have compiled liblzma with threading enabled !

# Usage

As the API is very close to NodeJS Zlib, you will probably find a good reference
[there](http://www.nodejs.org/api/zlib.html).

Otherwise examples can be found as part of the test suite, so feel free to use them!
They are written in [CoffeeScript](http://www.coffeescript.org).

# Bugs

If you find one, feel free to contribute as post a new issue!
PR are accepted as well :)

If you compile with threads, you may see a bunch of warnings about `-Wmissing-field-initializers`.
This is _normal_ and does not prevent threading from being active and working.
I did not yet figure how to fix this except by masking the warning..

# License

This software is released under LGPL3.0+
