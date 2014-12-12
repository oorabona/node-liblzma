{
  "targets": [
    {
      "variables": {
        "use_mt": "<!(echo $ENABLE_MT)"
      },
      "target_name": "node_libxz",
      "sources": [
        "src/bindings/node_libxz.cpp",
        "src/bindings/node_libxz.h"
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
