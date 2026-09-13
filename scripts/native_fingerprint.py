#!/usr/bin/env python3
"""Print the fingerprint for the native addon build inputs."""

import hashlib
import json
import sys
from pathlib import Path


REQUIRED_FILES = (
    "binding.gyp",
    "scripts/binding_config.py",
    "scripts/build_xz_with_cmake.py",
    "scripts/download_xz_from_github.py",
    "scripts/walk_sources.py",
    "scripts/copy_dll.py",
)


def fail(message):
    print(f"native_fingerprint.py: {message}", file=sys.stderr)
    raise SystemExit(1)


def add_input(digest, repo_root, path, contents):
    digest.update(path.relative_to(repo_root).as_posix().encode("utf-8"))
    digest.update(b"\0")
    digest.update(contents)
    digest.update(b"\0")


def read_file(path):
    if not path.is_file():
        fail(f"required input is missing: {path}")
    try:
        return path.read_bytes()
    except OSError as error:
        fail(f"could not read required input {path}: {error}")


def main():
    repo_root = Path(__file__).resolve().parent.parent
    bindings_dir = repo_root / "src" / "bindings"
    if not bindings_dir.is_dir():
        fail(f"required input directory is missing: {bindings_dir}")

    digest = hashlib.sha256()
    for path in sorted((path for path in bindings_dir.rglob("*") if path.is_file()), key=lambda path: path.relative_to(repo_root).as_posix()):
        add_input(digest, repo_root, path, read_file(path))

    for relative_path in REQUIRED_FILES:
        path = repo_root / relative_path
        add_input(digest, repo_root, path, read_file(path))

    version_path = repo_root / "xz-version.json"
    try:
        version_data = json.loads(read_file(version_path))
    except json.JSONDecodeError as error:
        fail(f"could not parse required input {version_path}: {error}")
    version = version_data.get("version")
    if not isinstance(version, str):
        fail(f"required version is missing or invalid in {version_path}")
    add_input(digest, repo_root, version_path, version.encode("utf-8"))

    print(digest.hexdigest())


if __name__ == "__main__":
    main()
