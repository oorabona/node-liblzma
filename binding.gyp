# Modernized binding.gyp using CMake for XZ compilation across all platforms
# This replaces the complex manual configuration with CMake-based builds
{
  "variables": {
    "use_global_liblzma%": "<!(node -p \"process.env.USE_GLOBAL || (process.platform === 'linux' || process.platform === 'darwin' ? 'true' : 'false')\")",
    "runtime_link%": "<!(node -p \"(process.env.RUNTIME_LINK && process.env.RUNTIME_LINK.length > 0) ? process.env.RUNTIME_LINK : (process.platform === 'linux' || process.platform === 'darwin' ? 'shared' : 'static')\")",
    "enable_thread_support%": "<!(node -p \"process.env.ENABLE_THREAD_SUPPORT || 'yes'\")",
    "xz_vendor_dir": "<(module_root_dir)/deps/xz",
    "py3": "<!(node -p \"process.env.npm_config_python || 'python3'\")",
    "target_dir": "<(module_root_dir)/build",
    "liblzma_install_dir": "<(target_dir)/liblzma"
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
      # Compile liblzma using CMake for all platforms
      "targets": [
        {
          "target_name": "download_and_extract_xz",
          "type": "none",
          "hard_dependency": 1,
          "actions": [{
            "action_name": "download_and_extract_xz",
            "inputs": [
              "<(module_root_dir)/xz-version.json",
              "<(module_root_dir)/scripts/download_xz_from_github.py"
            ],
            "outputs": [
              "<(xz_vendor_dir)/CMakeLists.txt"
            ],
            "action": [
              "<(py3)",
              "<(module_root_dir)/scripts/download_xz_from_github.py",
              "<(module_root_dir)/deps/xz.tar.gz",
              "<(module_root_dir)/deps/"
            ]
          }]
        },
        {
          "target_name": "build_liblzma_cmake",
          "type": "none",
          "hard_dependency": 1,
          "dependencies": ["download_and_extract_xz"],
          "actions": [{
            "action_name": "build_liblzma_cmake",
            "inputs": ["<(xz_vendor_dir)/CMakeLists.txt"],
            "conditions": [
              ["OS == 'win'", {
                "conditions": [
                  ["runtime_link == 'static'", {
                    "outputs": [
                      "<(liblzma_install_dir)/lib/liblzma.lib",
                      "<(liblzma_install_dir)/include/lzma.h"
                    ]
                  }, {
                    "outputs": [
                      "<(liblzma_install_dir)/lib/liblzma.lib",
                      "<(liblzma_install_dir)/bin/liblzma.dll",
                      "<(liblzma_install_dir)/include/lzma.h"
                    ]
                  }]
                ]
              }, {
                "outputs": [
                  "<(liblzma_install_dir)/lib/liblzma.a",
                  "<(liblzma_install_dir)/include/lzma.h"
                ]
              }]
            ],
            "action": [
              "<(py3)",
              "<(module_root_dir)/scripts/build_xz_with_cmake.py",
              "<(xz_vendor_dir)",
              "<(liblzma_install_dir)"
            ]
          }]
        },
        {
          # Copy DLL to build directory for Windows shared builds
          "target_name": "copy_dlls_windows_shared",
          "type": "none",
          "dependencies": ["build_liblzma_cmake"],
          "conditions": [
            ["OS == 'win' and use_global_liblzma == 'false' and runtime_link == 'shared'", {
              "actions": [{
                "action_name": "copy_liblzma_dll",
                "inputs": ["<(liblzma_install_dir)/bin/liblzma.dll"],
                "outputs": ["<(target_dir)/Release/liblzma.dll"],
                "action": [
                  "<(py3)",
                  "<(module_root_dir)/scripts/copy_dll.py",
                  "<(liblzma_install_dir)/bin/liblzma.dll",
                  "<(target_dir)/Release"
                ]
              }]
            }]
          ]
        }
      ]
    }]
  ],
  "targets": [{
    "target_name": "node_lzma",
    "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "sources": ["<!@(<(py3) scripts/walk_sources.py src)"],
    "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
    "cflags": [
      "-std=c++2a",
      "-Wall",
      "-pthread",
      "-g",
      "-zdefs",
      "-Werror"
    ],
    "ldflags": ["-g"],
    "conditions": [
      ["OS=='win'", {
        # Windows configuration using CMake-built libraries
        "conditions": [
          ["enable_thread_support != 'no'", {
            "defines": ["ENABLE_THREAD_SUPPORT"]
          }],
          ["use_global_liblzma == 'false'", {
            "conditions": [
              ["runtime_link == 'shared'", {
                "dependencies": ["build_liblzma_cmake", "copy_dlls_windows_shared"]
              }, {
                "dependencies": ["build_liblzma_cmake"]
              }]
            ],
            "include_dirs": [
              "<(liblzma_install_dir)/include"
            ],
            "conditions": [
              ["runtime_link == 'static'", {
                "libraries": [
                  "<(liblzma_install_dir)/lib/liblzma.lib"
                ],
                "defines": ["LZMA_API_STATIC"],
                "msvs_settings": {
                  "VCLinkerTool": {
                    "AdditionalDependencies": ["kernel32.lib", "msvcrt.lib"]
                  }
                }
              }, {
                "libraries": [
                  "<(liblzma_install_dir)/lib/liblzma.lib"
                ],
                "msvs_settings": {
                  "VCLinkerTool": {
                    "AdditionalDependencies": ["kernel32.lib", "msvcrt.lib"]
                  }
                }
              }]
            ]
          }]
        ]
      }],
      ["OS!='win'", {
        "conditions": [
          ["enable_thread_support != 'no'", {
            "defines": ["ENABLE_THREAD_SUPPORT"]
          }],
          ["use_global_liblzma == 'true'", {
            # Use system pkg-config for liblzma
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
            # Use CMake-built liblzma
            "dependencies": ["build_liblzma_cmake"],
            "include_dirs": ["<(liblzma_install_dir)/include"],
            "library_dirs": ["<(liblzma_install_dir)/lib"],
            "conditions": [
              ["runtime_link == 'static'", {
                "libraries": ["<(liblzma_install_dir)/lib/liblzma.a"],
                "ldflags": [
                  "-Wl,--whole-archive",
                  "<(liblzma_install_dir)/lib/liblzma.a",
                  "-Wl,--no-whole-archive",
                  "-pthread"
                ],
                "defines": ["LZMA_API_STATIC"]
              }, {
                "conditions": [
                  ["OS == 'mac'", {
                    "libraries": [
                      "-L<(liblzma_install_dir)/lib",
                      "-llzma"
                    ],
                    "xcode_settings": {
                      "OTHER_LDFLAGS": [
                        "-Wl,-rpath,@loader_path",
                        "-Wl,-rpath,@loader_path/../liblzma/lib"
                      ]
                    },
                    "copies": [{
                      "destination": "<(PRODUCT_DIR)",
                      "files": ["<(liblzma_install_dir)/lib/liblzma.dylib"]
                    }]
                  }, {
                    "libraries": ["<(liblzma_install_dir)/lib/liblzma.so"],
                    "ldflags": ["-pthread"]
                  }]
                ]
              }]
            ]
          }]
        ]
      }]
    ]
  }]
}