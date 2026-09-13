"""Select the native addon sources compiled from the checked-out tree."""

from pathlib import Path


SOURCE_SUFFIXES = (".cc", ".cpp", ".h", ".hpp", ".c")


def native_source_paths(source_root: Path):
    """Return sorted source paths beneath the supplied source root."""
    return sorted(
        path
        for path in source_root.rglob("*")
            if path.suffix in SOURCE_SUFFIXES
            and (path.is_file() or (path.is_symlink() and not path.exists()))
    )
