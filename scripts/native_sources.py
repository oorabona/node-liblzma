"""Select the native addon sources compiled from the checked-out tree."""

from pathlib import Path


SOURCE_SUFFIXES = (".cc", ".cpp", ".h", ".hpp", ".c")


def native_source_paths(repo_root: Path):
    """Return the sorted repository-relative source paths used by binding.gyp."""
    source_root = repo_root / "src"
    return sorted(
        (
            path.relative_to(repo_root).as_posix()
            for path in source_root.rglob("*")
            if path.is_file() and path.suffix in SOURCE_SUFFIXES
        ),
    )
