import sys
from pathlib import Path

from native_sources import native_source_paths


def main():
    source_root = Path(sys.argv[1]).resolve()
    for path in native_source_paths(source_root.parent):
        print(path)


if __name__ == "__main__":
    main()
