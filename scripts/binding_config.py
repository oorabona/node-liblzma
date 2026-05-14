"""Resolve binding.gyp variables without invoking node.

Replaces the previous `<!(node -p "process.env.X || default")` shell-outs
that fail on Windows under mise/pnpm/aube when node.exe is not in the
shell PATH inherited by node-gyp's child process (see issue #153).

Python is used because node-gyp already requires it to evaluate gyp files
(see `find Python` step in node-gyp output), so it is the most reliable
interpreter available at this point in the install lifecycle.

Subcommands:
  use_global_liblzma     env USE_GLOBAL or platform default ("true" on linux/darwin, "false" elsewhere)
  runtime_link           env RUNTIME_LINK or platform default ("shared" on linux/darwin, "static" elsewhere)
  enable_thread_support  env ENABLE_THREAD_SUPPORT or "yes"
  py3                    env npm_config_python or platform default ("python3" on linux/darwin, "python" on win32)
  node_addon_api_include absolute path to node-addon-api include dir (POSIX-style)
  node_addon_api_gyp     absolute path to node-addon-api node_api.gyp (POSIX-style)
"""

import json
import os
import sys
from pathlib import Path


def is_unix():
    return sys.platform in ("linux", "darwin")


def env_or(name, default):
    val = os.environ.get(name)
    return val if val else default


def use_global_liblzma():
    return env_or("USE_GLOBAL", "true" if is_unix() else "false")


def runtime_link():
    return env_or("RUNTIME_LINK", "shared" if is_unix() else "static")


def enable_thread_support():
    return env_or("ENABLE_THREAD_SUPPORT", "yes")


def py3():
    return env_or("npm_config_python", "python3" if is_unix() else "python")


def find_node_addon_api():
    """Locate node-addon-api package by walking up from the script dir.

    pnpm/aube can hoist node-addon-api outside the local node_modules tree,
    so we walk every parent's node_modules looking for the package.
    """
    here = Path(__file__).resolve().parent
    for ancestor in [here, *here.parents]:
        nm = ancestor / "node_modules" / "node-addon-api"
        if nm.is_dir():
            return nm
    sys.exit("node-addon-api not found in any parent node_modules")


def node_addon_api_include():
    pkg = find_node_addon_api()
    pkg_json = pkg / "package.json"
    include_subpath = None
    if pkg_json.is_file():
        try:
            with pkg_json.open(encoding="utf-8") as f:
                data = json.load(f)
            include_subpath = data.get("include_dir") or data.get("include")
        except (OSError, json.JSONDecodeError):
            include_subpath = None
    if include_subpath:
        resolved = (pkg / include_subpath).resolve()
    else:
        resolved = pkg
    return str(resolved).replace(os.sep, "/")


def node_addon_api_gyp():
    """Return the gyp dependency reference matching `require('node-addon-api').gyp`.

    node-addon-api exposes `node_api.gyp:nothing` (single legacy target) as
    its canonical gyp dependency string. The `:nothing` suffix tells gyp
    which target to depend on; without it, gyp can't resolve the dependency
    (target name defaults differ from file basename here).
    """
    pkg = find_node_addon_api()
    gyp_path = (pkg / "node_api.gyp").resolve()
    if not gyp_path.is_file():
        sys.exit(f"node-addon-api node_api.gyp not found at {gyp_path}")
    return f"{str(gyp_path).replace(os.sep, '/')}:nothing"


COMMANDS = {
    "use_global_liblzma": use_global_liblzma,
    "runtime_link": runtime_link,
    "enable_thread_support": enable_thread_support,
    "py3": py3,
    "node_addon_api_include": node_addon_api_include,
    "node_addon_api_gyp": node_addon_api_gyp,
}


def main():
    if len(sys.argv) != 2:
        sys.exit(f"usage: {sys.argv[0]} <{'|'.join(COMMANDS)}>")
    name = sys.argv[1]
    handler = COMMANDS.get(name)
    if handler is None:
        sys.exit(f"unknown variable: {name}")
    sys.stdout.write(handler())


if __name__ == "__main__":
    main()
