import sys
from pathlib import Path

from native_sources import native_source_paths


def main():
    source_root = Path(sys.argv[1])
    for path in native_source_paths(source_root):
        print(path.as_posix())


if __name__ == "__main__":
    main()
