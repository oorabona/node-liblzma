{
  "targets": [
    {
      "variables": {
        "use_mt": "<!(echo $ENABLE_MT)"
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
      'link_settings': {
        'libraries': [
            '-llzma'
        ]
      }
    }
  ]
}
