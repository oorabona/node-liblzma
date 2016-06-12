{
  "targets": [
    {
      "variables": {
        "use_mt": "<!(echo $ENABLE_MT)",
        "dlldir%": "<(module_path)"
      },
      "target_name": "node-liblzma",
      "sources": [
        "src/bindings/node-liblzma.hpp",
        "src/bindings/node-liblzma.cpp",
        "src/bindings/module.cpp"
      ],
      "include_dirs" : [
          "<!(node -e \"require('nan')\")"
      ],
      "target_conditions": [
        ["use_mt==1", {"defines": ["LIBLZMA_ENABLE_MT"]}]
      ],
      'cflags_cc': [ '-std=c++11' ],
      "conditions" : [
        [ 'OS!="win"' , {
          "include_dirs": [ "<(module_root_dir)/deps/xz/include" ],
          "libraries": [ "<(module_root_dir)/deps/xz/lib/liblzma.a"]
        }, {
          "include_dirs" : [ "<(module_root_dir)\\deps\\xz\\include" ],
          "link_settings": {
            "libraries" : [ "-llzma" ],
            "conditions": [
              [ 'target_arch=="x64"', {
                "library_dirs" : [ "<(module_root_dir)\\deps\\xz\\bin_x86-64" ]
              }, {
                "library_dirs" : [ "<(module_root_dir)\\deps\\xz\\bin_i686" ]
              } ]
            ]
          }
        } ],
      ]
    },
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "<(module_name)" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/<(module_name).node" ],
          "destination": "<(module_path)"
        }
      ]
    }
  ]
}
