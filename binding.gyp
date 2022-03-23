# Some of this file is built with the help of
# https://n8.io/converting-a-c-library-to-gyp/
# and the work done for grpc (kudos !)
# https://chromium.googlesource.com/external/github.com/grpc/grpc/+/refs/heads/chromium-deps/2016-08-17/binding.gyp
{
  "variables": {
    "use_global_liblzma%": "<!(node -p \"process.env.USE_GLOBAL || (!os.type().startsWith('Win'))\")",
    "runtime_link%": "<!(node -p \"process.env.RUNTIME_LINK?.length > 0 ? process.env.RUNTIME_LINK : (!os.type().startsWith('Win') ? 'shared' : 'static')\")",
    "enable_thread_support%": "<!(node -p \"process.env.ENABLE_THREAD_SUPPORT || 'yes'\")",
    "xz_vendor_dir": "<(module_root_dir)/deps/xz",
    "py3": "<!(node -p \"process.env.npm_config_python || 'python3'\")",
    "target_dir": "<(module_root_dir)/build"
  },
  "target_defaults": {
    "conditions": [
      ["OS == 'mac'", {
        "xcode_settings": {
          "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          "CLANG_CXX_LIBRARY": "libc++",
          "MACOSX_DEPLOYMENT_TARGET": "10.9",
          "OTHER_CFLAGS": [
            "-stdlib=libc++",
            "-arch x86_64",
            "-arch arm64",
            "-std=c++2a"
          ],
          "OTHER_LDFLAGS": [
            "-Wl,-bind_at_load",
            "-framework CoreFoundation -framework CoreServices",
            "-arch x86_64",
            "-arch arm64"
          ]
        }
      }],
      ["OS == 'win'", {
        "msvs_disabled_warnings": [4275, 4005],
        "configurations": {
          "Release": {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "RuntimeLibrary": 0, # static release
                "Optimization": 3,
                "FavorSizeOrSpeed": 1,
                "InlineFunctionExpansion": 2,
                "WholeProgramOptimization": "true",
                "OmitFramePointers": "true",
                "EnableFunctionLevelLinking": "true",
                "EnableIntrinsicFunctions": "true",
                "RuntimeTypeInfo": "false",
                "PreprocessorDefinitions": ["WIN32_LEAN_AND_MEAN"],
                "ExceptionHandling": "0",
                "AdditionalOptions": [
                  "/EHsc",
                  "/utf-8",
                  "/std:c++latest"
                ]
              },
              "VCLibrarianTool": {
                "AdditionalOptions": ["/LTCG"]
              },
              "VCLinkerTool": {
                "LinkTimeCodeGeneration": 1,
                "OptimizeReferences": 2,
                "EnableCOMDATFolding": 2,
                "LinkIncremental": 1
              }
            },
            "defines": [
              "NDEBUG",
              "_NDEBUG"
            ]
          },
          "Debug": {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "PreprocessorDefinitions": ["WIN32_LEAN_AND_MEAN"],
                "ExceptionHandling": "0",
                "AdditionalOptions": [
                  "/EHsc",
                  "/utf-8",
                  "/std:c++latest"
                ],
                "RuntimeLibrary": 1, # static debug
              },
              "VCLibrarianTool": {
                "AdditionalOptions": ["/LTCG"]
              },
              "VCLinkerTool": {
                "LinkTimeCodeGeneration": 1,
                "LinkIncremental": 1
              }
            },
            "defines": [
              "DEBUG",
              "_DEBUG"
            ]
          }
        },
        "defines": [
          "_WIN32_WINNT=0x0600",
          "_HAS_EXCEPTIONS=0",
          "UNICODE",
          "_UNICODE",
          "NOMINMAX"
        ]
      },
      {
        "configurations": {
          "Release": {
            "ldflags": ["-Wl,-s"]
          },
          "Debug": {}
        },
        "defines": ["_GLIBCXX_USE_CXX11_ABI=1"]
      }]
    ]
  },
  "conditions": [
    ["use_global_liblzma == 'false'", {
      # Compile liblzma from here
      "conditions": [
        ["OS == 'win'", {
          "targets": [{
            "target_name": "download_and_extract_deps",
            "type": "none",
            "hard_dependency": 1,
            "actions": [{
              "action_name": "download_and_extract_deps",
              "inputs": [""],
              "outputs": ["<(xz_vendor_dir)/autogen.sh"],
              "action": [
                "<!(node -p \"process.env.npm_config_python || 'python3'\")",
                "<(module_root_dir)/scripts/download_extract_deps.py",
                "<(module_root_dir)/deps/xz.tar.xz",
                "<(module_root_dir)/deps/"
              ]
            }]
          }]
        }],
        ["OS == 'win' and runtime_link == 'shared'", {
          "targets": [{
            "target_name": "lzma",
            "product_prefix": "lib",
            "type": "shared_library",
            "hard_dependency": 1,
            "defines": [
              "WIN32",
              "HAVE_CONFIG_H",
              "LIBLZMADLL_EXPORTS",
              "DLL_EXPORT"
            ],
            "include_dirs": [
              "<(xz_vendor_dir)/src",
              "<(xz_vendor_dir)/windows/vs2019",
              "<(xz_vendor_dir)/src/liblzma/common",
              "<(xz_vendor_dir)/src/common",
              "<(xz_vendor_dir)/src/liblzma/api",
              "<(xz_vendor_dir)/src/liblzma/check",
              "<(xz_vendor_dir)/src/liblzma/delta",
              "<(xz_vendor_dir)/src/liblzma/lz",
              "<(xz_vendor_dir)/src/liblzma/lzma",
              "<(xz_vendor_dir)/src/liblzma/rangecoder",
              "<(xz_vendor_dir)/src/liblzma/simple"
            ],
            "sources": [
              "<(xz_vendor_dir)/src/common/tuklib_cpucores.c",
              "<(xz_vendor_dir)/src/common/tuklib_physmem.c",
              "<(xz_vendor_dir)/src/liblzma/check/check.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_fast.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_table.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_fast.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_table.c",
              "<(xz_vendor_dir)/src/liblzma/check/sha256.c",
              "<(xz_vendor_dir)/src/liblzma/common/alone_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/alone_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/auto_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_buffer_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_header_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_header_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_util.c",
              "<(xz_vendor_dir)/src/liblzma/common/common.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_decoder_memusage.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_encoder_memusage.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_preset.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_buffer_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_common.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_flags_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_flags_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/hardware_cputhreads.c",
              "<(xz_vendor_dir)/src/liblzma/common/hardware_physmem.c",
              "<(xz_vendor_dir)/src/liblzma/common/index.c",
              "<(xz_vendor_dir)/src/liblzma/common/index_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/index_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/index_hash.c",
              "<(xz_vendor_dir)/src/liblzma/common/outqueue.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_buffer_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_encoder_mt.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_common.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/vli_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/vli_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/vli_size.c",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_common.c",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/fastpos_table.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_optimum_fast.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_optimum_normal.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_presets.c",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder_mf.c",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/price_table.c",
              "<(xz_vendor_dir)/src/liblzma/simple/arm.c",
              "<(xz_vendor_dir)/src/liblzma/simple/armthumb.c",
              "<(xz_vendor_dir)/src/liblzma/simple/ia64.c",
              "<(xz_vendor_dir)/src/liblzma/simple/powerpc.c",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_coder.c",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/simple/sparc.c",
              "<(xz_vendor_dir)/src/liblzma/simple/x86.c",
              "<(xz_vendor_dir)/src/common/mythread.h",
              "<(xz_vendor_dir)/src/common/sysdefs.h",
              "<(xz_vendor_dir)/src/common/tuklib_common.h",
              "<(xz_vendor_dir)/src/common/tuklib_config.h",
              "<(xz_vendor_dir)/src/common/tuklib_cpucores.h",
              "<(xz_vendor_dir)/src/common/tuklib_integer.h",
              "<(xz_vendor_dir)/src/common/tuklib_physmem.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/base.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/bcj.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/block.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/check.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/container.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/delta.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/filter.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/hardware.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/index.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/index_hash.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/lzma12.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/stream_flags.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/version.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/vli.h",
              "<(xz_vendor_dir)/src/liblzma/check/check.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_table_be.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_table_le.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_table_be.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_table_le.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc_macros.h",
              "<(xz_vendor_dir)/src/liblzma/common/alone_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/block_buffer_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/block_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/block_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/common.h",
              "<(xz_vendor_dir)/src/liblzma/common/easy_preset.h",
              "<(xz_vendor_dir)/src/liblzma/common/filter_common.h",
              "<(xz_vendor_dir)/src/liblzma/common/filter_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/filter_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/index.h",
              "<(xz_vendor_dir)/src/liblzma/common/index_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/memcmplen.h",
              "<(xz_vendor_dir)/src/liblzma/common/outqueue.h",
              "<(xz_vendor_dir)/src/liblzma/common/stream_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_common.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_common.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_private.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/fastpos.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_common.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_private.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder_hash.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder_hash_table.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/price.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/range_common.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/range_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/range_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_coder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_private.h",
              "<(xz_vendor_dir)/windows/vs2019/config.h"
            ]
          }]
        }],
        ["OS == 'win' and runtime_link == 'static'", {
          "targets": [{
            "target_name": "lzma",
            "product_prefix": "lib",
            "type": "static_library",
            "hard_dependency": 1,
            "defines": [
              "WIN32",
              "HAVE_CONFIG_H"
            ],
            "include_dirs": [
              "<(xz_vendor_dir)/src",
              "<(xz_vendor_dir)/windows/vs2019",
              "<(xz_vendor_dir)/src/liblzma/common",
              "<(xz_vendor_dir)/src/common",
              "<(xz_vendor_dir)/src/liblzma/api",
              "<(xz_vendor_dir)/src/liblzma/check",
              "<(xz_vendor_dir)/src/liblzma/delta",
              "<(xz_vendor_dir)/src/liblzma/lz",
              "<(xz_vendor_dir)/src/liblzma/lzma",
              "<(xz_vendor_dir)/src/liblzma/rangecoder",
              "<(xz_vendor_dir)/src/liblzma/simple"
            ],
            "sources": [
              "<(xz_vendor_dir)/src/common/tuklib_cpucores.c",
              "<(xz_vendor_dir)/src/common/tuklib_physmem.c",
              "<(xz_vendor_dir)/src/liblzma/check/check.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_fast.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_table.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_fast.c",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_table.c",
              "<(xz_vendor_dir)/src/liblzma/check/sha256.c",
              "<(xz_vendor_dir)/src/liblzma/common/alone_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/alone_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/auto_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_buffer_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_header_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_header_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/block_util.c",
              "<(xz_vendor_dir)/src/liblzma/common/common.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_decoder_memusage.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_encoder_memusage.c",
              "<(xz_vendor_dir)/src/liblzma/common/easy_preset.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_buffer_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_common.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_flags_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/filter_flags_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/hardware_cputhreads.c",
              "<(xz_vendor_dir)/src/liblzma/common/hardware_physmem.c",
              "<(xz_vendor_dir)/src/liblzma/common/index.c",
              "<(xz_vendor_dir)/src/liblzma/common/index_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/index_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/index_hash.c",
              "<(xz_vendor_dir)/src/liblzma/common/outqueue.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_buffer_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_buffer_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_encoder_mt.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_common.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/vli_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/vli_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/common/vli_size.c",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_common.c",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/fastpos_table.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_optimum_fast.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_optimum_normal.c",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_presets.c",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder_mf.c",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/price_table.c",
              "<(xz_vendor_dir)/src/liblzma/simple/arm.c",
              "<(xz_vendor_dir)/src/liblzma/simple/armthumb.c",
              "<(xz_vendor_dir)/src/liblzma/simple/ia64.c",
              "<(xz_vendor_dir)/src/liblzma/simple/powerpc.c",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_coder.c",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_decoder.c",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_encoder.c",
              "<(xz_vendor_dir)/src/liblzma/simple/sparc.c",
              "<(xz_vendor_dir)/src/liblzma/simple/x86.c",
              "<(xz_vendor_dir)/src/common/mythread.h",
              "<(xz_vendor_dir)/src/common/sysdefs.h",
              "<(xz_vendor_dir)/src/common/tuklib_common.h",
              "<(xz_vendor_dir)/src/common/tuklib_config.h",
              "<(xz_vendor_dir)/src/common/tuklib_cpucores.h",
              "<(xz_vendor_dir)/src/common/tuklib_integer.h",
              "<(xz_vendor_dir)/src/common/tuklib_physmem.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/base.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/bcj.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/block.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/check.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/container.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/delta.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/filter.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/hardware.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/index.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/index_hash.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/lzma12.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/stream_flags.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/version.h",
              "<(xz_vendor_dir)/src/liblzma/api/lzma/vli.h",
              "<(xz_vendor_dir)/src/liblzma/check/check.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_table_be.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc32_table_le.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_table_be.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc64_table_le.h",
              "<(xz_vendor_dir)/src/liblzma/check/crc_macros.h",
              "<(xz_vendor_dir)/src/liblzma/common/alone_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/block_buffer_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/block_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/block_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/common.h",
              "<(xz_vendor_dir)/src/liblzma/common/easy_preset.h",
              "<(xz_vendor_dir)/src/liblzma/common/filter_common.h",
              "<(xz_vendor_dir)/src/liblzma/common/filter_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/filter_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/index.h",
              "<(xz_vendor_dir)/src/liblzma/common/index_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/memcmplen.h",
              "<(xz_vendor_dir)/src/liblzma/common/outqueue.h",
              "<(xz_vendor_dir)/src/liblzma/common/stream_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/common/stream_flags_common.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_common.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/delta/delta_private.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/fastpos.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma2_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_common.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/lzma/lzma_encoder_private.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder_hash.h",
              "<(xz_vendor_dir)/src/liblzma/lz/lz_encoder_hash_table.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/price.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/range_common.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/range_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/rangecoder/range_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_coder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_decoder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_encoder.h",
              "<(xz_vendor_dir)/src/liblzma/simple/simple_private.h",
              "<(xz_vendor_dir)/windows/vs2019/config.h"
            ]
          }]
        }],
        ["OS!='win'", {
          "targets": [{
            "target_name": "download_and_extract_deps",
            "type": "none",
            "hard_dependency": 1,
            "actions": [{
              "action_name": "download",
              "inputs": [""],
              "outputs": ["<(xz_vendor_dir)/autogen.sh"],
              "action": [
                "<!(node -p \"process.env.npm_config_python || 'python3'\")",
                "<(module_root_dir)/scripts/download_extract_deps.py",
                "<(module_root_dir)/deps/xz.tar.xz",
                "<(module_root_dir)/deps/"
              ]
            }]
          },
          {
            "target_name": "lzma",
            "type": "none",
            "hard_dependency": 1,
            "actions": [{
              "action_name": "build",
              # a hack to run ./configure during `node-gyp configure`
              "inputs": [""],
              "outputs": [""],
              "action": [
                "sh",
                "-c",
                "cd <(xz_vendor_dir) && ./configure --enable-static --enable-shared --disable-scripts --disable-lzmainfo \
                --disable-lzma-links --disable-lzmadec --disable-xzdec --disable-xz --disable-rpath --enable-threads=<(enable_thread_support) \
                --disable-dependency-tracking --prefix=\"<(target_dir)/liblzma\" && make && make install"
              ]
            }]
          }]
        }]
      ]
    }]
  ],
  "targets": [{
    "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "cflags": [
      "-std=c++2a", # because GCC 9 and earlier do not support -std=c++20
      "-Wall",
      "-pthread",
      "-g",
      "-zdefs",
      "-Werror"
    ],
    "ldflags": ["-g"],
    "conditions": [
      ["OS=='win'", {
        "conditions": [
          ["runtime_link == 'static'", {
            "dependencies": ["lzma"],
            "msvs_settings": {
              "VCLinkerTool": {
                "AdditionalOptions": [
                  "/WHOLEARCHIVE:liblzma<(STATIC_LIB_SUFFIX)",
                  "/FORCE:MULTIPLE"
                ]
              }
            }
          },{
            "dependencies": ["lzma"]
          }]
        ],
        "include_dirs": [
          "<(xz_vendor_dir)/src",
          "<(xz_vendor_dir)/windows/vs2019",
          "<(xz_vendor_dir)/src/liblzma/common",
          "<(xz_vendor_dir)/src/common",
          "<(xz_vendor_dir)/src/liblzma/api",
          "<(xz_vendor_dir)/src/liblzma/check",
          "<(xz_vendor_dir)/src/liblzma/delta",
          "<(xz_vendor_dir)/src/liblzma/lz",
          "<(xz_vendor_dir)/src/liblzma/lzma",
          "<(xz_vendor_dir)/src/liblzma/rangecoder",
          "<(xz_vendor_dir)/src/liblzma/simple"
        ]
      }],
      ["OS!='win'", {
        "conditions": [
          ["enable_thread_support != 'no'", {
            "defines": ["ENABLE_THREAD_SUPPORT"]
          }],
          ["use_global_liblzma == 'true'", {
            # Use pkg-config for include and lib
            "include_dirs": ["<!@(pkg-config --cflags-only-I liblzma | sed s\/-I//g)"],
            "conditions": [
              ["runtime_link == \"static\"", {
                "libraries": ["<!@(pkg-config --libs --static liblzma)"],
                "ldflags": [
                  "-Wl,--whole-archive",
                  "-Wl,-Bstatic",
                  "-l:liblzma.a",
                  "-Wl,-Bdynamic",
                  "-Wl,--no-whole-archive"
                ],
                "defines": ["LZMA_API_STATIC"]
              },{
                "libraries": [
                  "<!@(pkg-config --libs liblzma)",
                ],
                "ldflags": [
                  "-Wl,--disable-new-dtags",
                ]
              }]
            ]
          },{
            "include_dirs": ["<(target_dir)/liblzma/include"],
            "library_dirs": ["<(target_dir)/liblzma/lib"],
            "libraries": [
              "-L<(target_dir)/liblzma/lib -llzma -pthread -lpthread"
            ],
            "ldflags": [
              "-Wl,--whole-archive",
              "-l:liblzma.a",
              "-Wl,--no-whole-archive"
            ],
            "defines": ["LZMA_API_STATIC"],
            "dependencies": ["lzma"]
          }]
        ]
      }]
    ],
    "target_name": "node_lzma",
    "sources": ["<!@(<(py3) scripts/walk_sources.py src)"],
    "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"]
  }]
}