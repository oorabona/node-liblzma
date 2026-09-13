#!/usr/bin/env python3
"""
Download and extract XZ Utils from GitHub with intelligent version management.

Version priority:
1. XZ_VERSION environment variable (highest priority - for CI/CD overrides)
2. xz-version.json configuration file (stable default)

Features:
- Smart caching: Skip download if correct version already extracted
- GitHub API authentication: Use GITHUB_TOKEN to avoid rate limiting (60/h → 5000/h)
- Security: Path traversal protection and safe tarball extraction

Usage:
  python3 download_xz_from_github.py <tarball_path> <extract_dir>

Environment variables:
  XZ_VERSION: Specific version (e.g., 'v5.8.4', 'latest')
  GITHUB_TOKEN: GitHub token for authenticated API requests (optional, increases rate limit)
"""

import urllib.request
import urllib.error
import http.client
import json
import sys
import tarfile
import os
import argparse
import ssl
import re
import shutil
import time
from datetime import datetime
from pathlib import Path
import tempfile


class VersionResolutionError(Exception):
    """Raised when the requested XZ version cannot be resolved."""


GITHUB_NOT_FOUND = object()
REQUEST_TIMEOUT_SECONDS = 30
DOWNLOAD_CHUNK_SIZE = 64 * 1024
LOCK_RETRY_SECONDS = 0.1
LOCK_ORPHAN_SECONDS = 60
VERSION_TAG_PATTERN = re.compile(r'^v?(\d+\.\d+\.\d+)$')


def fail_version_resolution(version, source, cause):
    """Stop the build rather than silently choosing a different XZ version."""
    raise VersionResolutionError(
        f"Could not resolve XZ version {version} from {source}: {cause}"
    )


def get_github_headers():
    """Get headers with an optional GitHub token for authentication."""
    headers = {'User-Agent': 'node-liblzma'}

    # Use GITHUB_TOKEN if available (in CI) to avoid rate limiting
    # Increases limit from 60/hour to 5000/hour
    token = os.environ.get('GITHUB_TOKEN', '').strip()
    if token:
        headers['Authorization'] = f'token {token}'

    return headers


def github_get(api_url, version, source, read_body=True, response_handler=None):
    """Fetch a GitHub response, translating request and optional read failures."""
    headers = get_github_headers()
    req = urllib.request.Request(api_url, headers=headers)

    try:
        response = urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return GITHUB_NOT_FOUND
        fail_version_resolution(
            version,
            source,
            f'GitHub returned HTTP {e.code}: {e}',
        )
    except (urllib.error.URLError, ssl.SSLError, TimeoutError,
            http.client.HTTPException, ConnectionError, OSError) as e:
        fail_version_resolution(version, source, f'GitHub request failed: {e}')

    with response:
        if response_handler is not None:
            # The handler owns its file I/O, so do not misattribute its OSErrors
            # to GitHub requests.
            return response_handler(response)
        if not read_body:
            return None
        try:
            return response.read()
        except OSError as e:
            fail_version_resolution(version, source, f'GitHub request failed: {e}')


def canonicalize_version(version, source):
    """Return the sole accepted XZ tag spelling: vMAJOR.MINOR.PATCH."""
    match = VERSION_TAG_PATTERN.fullmatch(version)
    if not match:
        fail_version_resolution(
            version,
            source,
            'version must be a plain MAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH tag',
        )
    return 'v' + match.group(1)

def load_version_config():
    """Load version configuration from xz-version.json"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, '..', 'xz-version.json')

    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except FileNotFoundError:
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            'file does not exist',
        )
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            f'invalid JSON: {e}',
        )
    except OSError as e:
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            f'could not read file: {e}',
        )

    if not isinstance(config, dict):
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            'configuration must be a JSON object',
        )

    print(f"Loaded XZ config: {config.get('version', 'unknown')} ({config.get('comment', 'no comment')})")
    return config, config_path

def get_latest_version():
    """Get the latest XZ version from the GitHub API."""
    api_url = "https://api.github.com/repos/tukaani-project/xz/releases/latest"
    response_body = github_get(api_url, 'latest', 'XZ_VERSION=latest')
    if response_body is GITHUB_NOT_FOUND:
        fail_version_resolution(
            'latest',
            'XZ_VERSION=latest',
            'GitHub latest release was not found',
        )

    try:
        data = json.loads(response_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        fail_version_resolution(
            'latest',
            'XZ_VERSION=latest',
            f'malformed GitHub response: invalid JSON: {e}',
        )

    if not isinstance(data, dict):
        fail_version_resolution(
            'latest',
            'XZ_VERSION=latest',
            'malformed GitHub response: body must be a JSON object',
        )

    tag_name = data.get('tag_name')
    if not isinstance(tag_name, str) or not tag_name.strip():
        fail_version_resolution(
            'latest',
            'XZ_VERSION=latest',
            'malformed GitHub response: "tag_name" must be a nonblank string',
        )

    return canonicalize_version(tag_name.strip(), 'GitHub latest release')

def determine_version():
    """Determine which XZ version to use based on priority hierarchy"""
    # 1. Environment variable has highest priority (CI/CD overrides)
    env_version = os.environ.get('XZ_VERSION', '').strip()
    if env_version:
        if env_version.lower() == 'latest':
            version = get_latest_version()
            print(f"[LAUNCH] Using latest XZ version: {version}")
            return version, 'XZ_VERSION=latest'
        else:
            version = canonicalize_version(env_version, 'XZ_VERSION')
            print(f"[TARGET] Using XZ version from environment: {version}")
            return version, 'XZ_VERSION'
    
    # 2. Repository configuration file
    config, config_path = load_version_config()
    configured_version = config.get('version')
    if not isinstance(configured_version, str) or not configured_version.strip():
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            'required "version" must be a nonblank string',
        )
    configured_version = canonicalize_version(
        configured_version.strip(), f'xz-version.json ({config_path})'
    )
    print(f"[CONFIG] Using configured XZ version: {configured_version}")
    return configured_version, f'xz-version.json ({config_path})'

def validate_version(version, source):
    """Validate a version on GitHub through the output-free request helper."""
    # Check if version exists
    api_url = f"https://api.github.com/repos/tukaani-project/xz/releases/tags/{version}"
    if github_get(api_url, version, source, read_body=False) is GITHUB_NOT_FOUND:
        print(f"Warning: Version {version} not found on GitHub")
        return None

    return version

def get_tarball_url(version):
    """Get the tarball URL for a specific version"""
    return f'https://api.github.com/repos/tukaani-project/xz/tarball/{version}'

def download_tarball(url, tarball_path, version, source):
    """Download tarball from GitHub with proper user agent"""
    print(f"[DOWNLOAD] Downloading from: {url}")

    def write_response(response):
        total_bytes = 0
        with open(tarball_path, 'wb') as tarball_file:
            while True:
                chunk = response.read(DOWNLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                tarball_file.write(chunk)
                total_bytes += len(chunk)
        return response.geturl(), total_bytes

    final_url, total_bytes = github_get(
        url, version, source, read_body=False, response_handler=write_response
    )
    print(f"[PACKAGE] Resolved to: {final_url}")
    print(f"[SUCCESS] Downloaded {total_bytes} bytes to {tarball_path}")

def is_safe_path(member_path, extract_dir):
    """Validate that the extraction path is safe and within bounds."""
    # Reject obviously dangerous patterns first
    if not member_path or member_path.startswith('/') or member_path.startswith('\\'):
        return False
    
    # Normalize path separators and check for traversal patterns
    normalized_path = member_path.replace('\\', '/')
    if '..' in normalized_path:
        return False
    
    # Check each path component
    path_parts = Path(normalized_path).parts
    for part in path_parts:
        # Reject dangerous components
        if part in ('..', '.', '') or part.startswith('..'):
            return False
        # Reject absolute path indicators
        if os.path.isabs(part) or ':' in part:
            return False
        # Reject null bytes and other control characters
        if '\x00' in part or any(ord(c) < 32 for c in part if c not in '\t'):
            return False
    
    # Final validation: resolve the full path and ensure it's within bounds
    extract_dir = os.path.abspath(extract_dir)
    try:
        member_abs_path = os.path.abspath(os.path.join(extract_dir, normalized_path))
        # Ensure the resolved path is within the extraction directory
        common_path = os.path.commonpath([member_abs_path, extract_dir])
        if common_path != extract_dir:
            return False
        # Double-check with string prefix (for additional safety)
        if not member_abs_path.startswith(extract_dir + os.sep) and member_abs_path != extract_dir:
            return False
    except (ValueError, OSError):
        return False
    
    return True

def is_xz_already_extracted(extract_dir, version):
    """Check if XZ is already extracted with the correct version"""
    xz_dir = os.path.join(extract_dir, 'xz')
    cmake_file = os.path.join(xz_dir, 'CMakeLists.txt')
    version_file = os.path.join(xz_dir, '.xz-version')

    # Check if XZ directory exists with CMakeLists.txt
    if not os.path.exists(cmake_file):
        return False

    # Check if version file exists and matches
    if os.path.exists(version_file):
        try:
            with open(version_file, 'r') as f:
                cached_version = f.read().strip()
                if cached_version == version:
                    print(f"[CACHE HIT] XZ {version} already extracted")
                    return True
                else:
                    # Older trees may contain an equivalent but non-canonical
                    # spelling. Re-extract them rather than migrating a marker
                    # for a tree that this run did not publish.
                    print(f"[CACHE MISS] Version mismatch: cached {cached_version} != requested {version}")
                    return False
        except IOError:
            pass

    # Version file doesn't exist, assume cache miss
    print(f"[CACHE MISS] No version file found")
    return False

def extract_tarball(tarball_path, extract_dir):
    """Extract tarball and rename root directory to 'xz' with security validation."""
    print(f"[EXTRACT] Extracting to {extract_dir}/xz")
    
    # Ensure extract_dir exists and is absolute
    extract_dir = os.path.abspath(extract_dir)
    os.makedirs(extract_dir, exist_ok=True)
    
    with tarfile.open(tarball_path, 'r:gz') as tfile:
        members = tfile.getmembers()
        if not members:
            raise ValueError("Empty tarball")
        
        # GitHub creates directories like "tukaani-project-xz-{commit_hash}"
        root_dir = members[0].name.split('/')[0]
        print(f"[DIR] Root directory: {root_dir}")
        
        # Security validation: check all members before extraction
        safe_members = []
        for member in members:
            # Create the new path by replacing root directory with 'xz'
            if not member.name.startswith(root_dir):
                raise ValueError(
                    f"Tarball member is not in its root directory: {member.name}"
                )
                
            new_name = member.name.replace(root_dir, 'xz', 1)
            
            # Validate the new path is safe
            if not is_safe_path(new_name, extract_dir):
                raise ValueError(
                    f"Unsafe tarball path: {member.name} -> {new_name}"
                )
            
            # Additional safety checks for member properties
            if member.islnk() or member.issym():
                # Validate link targets are also safe
                if member.linkname and not is_safe_path(member.linkname, extract_dir):
                    raise ValueError(f"Unsafe tarball link target: {member.linkname}")
            
            # Create a new member with the safe name
            safe_member = member
            safe_member.name = new_name
            safe_members.append(safe_member)
        
        if not safe_members:
            raise ValueError("No safe members to extract")
        
        # Extract all validated members
        for member in safe_members:
            try:
                # Use data filter for additional safety on Python 3.12+
                tfile.extract(member, extract_dir, filter='data')
            except TypeError:
                # Fallback for Python versions that don't support filter parameter
                # Manual validation since we can't use the data filter
                if member.isfile() and member.size > 100 * 1024 * 1024:  # 100MB limit
                    raise ValueError(
                        f"Oversized tarball file: {member.name} ({member.size} bytes)"
                    )
                tfile.extract(member, extract_dir)
            except Exception as e:
                print(f"[ERROR] Failed to extract {member.name}: {e}")
                raise

        print(f"[SUCCESS] Successfully extracted XZ to {extract_dir}/xz")

def write_version_marker(extract_dir, version):
    """Write version marker file for cache validation"""
    xz_dir = os.path.join(extract_dir, 'xz')
    version_file = os.path.join(xz_dir, '.xz-version')

    with open(version_file, 'w') as f:
        f.write(version)
    print(f"[VERSION] Wrote version marker: {version}")


def versioned_tarball_path(tarball, version):
    """Keep archives isolated by canonical tag, never at the legacy shared path."""
    return os.path.join(
        os.path.dirname(tarball), f'xz-{version}.tar.gz'
    )


class XZCacheLock:
    """Cooperative directory lock with recovery for abandoned locks."""

    def __init__(self, extract_dir):
        self.path = os.path.join(extract_dir, '.xz-cache.lock')
        self.acquired = False

    @staticmethod
    def _owner_is_alive(lock_path):
        try:
            with open(os.path.join(lock_path, 'owner'), 'r') as owner_file:
                pid = int(owner_file.read().strip())
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        except (OSError, ValueError):
            return None
        return True

    def _is_abandoned(self):
        try:
            lock_age = time.time() - os.path.getmtime(self.path)
        except FileNotFoundError:
            return False
        owner_is_alive = self._owner_is_alive(self.path)
        if owner_is_alive is False:
            return True
        # A lock without readable owner metadata may be from a killed process.
        # Wait briefly so that a creator can finish recording its PID first.
        return owner_is_alive is None and lock_age >= LOCK_ORPHAN_SECONDS

    def __enter__(self):
        while True:
            try:
                os.mkdir(self.path)
                try:
                    with open(os.path.join(self.path, 'owner'), 'w') as owner_file:
                        owner_file.write(str(os.getpid()))
                except Exception:
                    shutil.rmtree(self.path, ignore_errors=True)
                    raise
                self.acquired = True
                return self
            except FileExistsError:
                if self._is_abandoned():
                    try:
                        shutil.rmtree(self.path)
                        print(f"[LOCK] Removed abandoned XZ cache lock: {self.path}")
                    except FileNotFoundError:
                        pass
                    continue
                print(f"[LOCK] Waiting for XZ cache lock: {self.path}")
                time.sleep(LOCK_RETRY_SECONDS)

    def __exit__(self, exc_type, exc_value, traceback):
        if self.acquired:
            shutil.rmtree(self.path)
            self.acquired = False


def publish_staged_tree(staged_xz_dir, extract_dir):
    """Publish a complete staged tree, restoring the old tree on replacement failure."""
    destination = os.path.join(extract_dir, 'xz')
    backup = None
    if os.path.exists(destination):
        backup = tempfile.mkdtemp(prefix='.xz-previous-', dir=extract_dir)
        os.rmdir(backup)
        os.replace(destination, backup)

    try:
        os.replace(staged_xz_dir, destination)
    except Exception:
        if backup is not None:
            os.replace(backup, destination)
        raise

    if backup is not None:
        shutil.rmtree(backup)


def extract_and_publish(tarball, extract_dir, version):
    """Extract to a sibling staging directory and publish only after it is complete."""
    staging_dir = tempfile.mkdtemp(prefix='.xz-staging-', dir=extract_dir)
    try:
        extract_tarball(tarball, staging_dir)
        write_version_marker(staging_dir, version)
        publish_staged_tree(os.path.join(staging_dir, 'xz'), extract_dir)
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)

def main():
    parser = argparse.ArgumentParser(
        description='Download XZ Utils from GitHub with intelligent version management',
        epilog='''
Version priority:
  1. XZ_VERSION environment variable (e.g., XZ_VERSION=v5.8.4)
  2. xz-version.json configuration file

Examples:
  python3 download_xz_from_github.py deps/xz.tar.gz deps/
  XZ_VERSION=latest python3 download_xz_from_github.py deps/xz.tar.gz deps/
  XZ_VERSION=v5.6.4 python3 download_xz_from_github.py deps/xz.tar.gz deps/
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('tarball', help='Output tarball path (.tar.gz will be used)')
    parser.add_argument('dirname', help='Extract directory')
    parser.add_argument('--verbose', '-v', action='store_true', 
                       help='Verbose output')
    
    args = parser.parse_args()
    
    if args.verbose:
        print("[VERBOSE] Verbose mode enabled")
    
    # Determine version to use
    version, version_source = determine_version()

    # Prepare and validate paths
    tarball = os.path.abspath(args.tarball)
    dirname = os.path.abspath(args.dirname)

    # Additional security validation for output paths
    if not tarball or not dirname:
        print("[ERROR] Invalid paths provided")
        return 1

    # Ensure paths don't contain suspicious patterns
    suspicious_patterns = ['..', '~', '$']
    for pattern in suspicious_patterns:
        if pattern in args.tarball or pattern in args.dirname:
            print(f"[ERROR] Suspicious pattern '{pattern}' detected in paths")
            return 1

    # Ensure we're using .tar.gz extension (GitHub uses gzip, not xz)
    if tarball.endswith('.tar.xz'):
        tarball = tarball.replace('.tar.xz', '.tar.gz')
        print(f"[NOTE] Adjusted tarball name to: {tarball}")

    # Create directories if needed
    os.makedirs(os.path.dirname(tarball), exist_ok=True)
    os.makedirs(dirname, exist_ok=True)

    # The argument is retained for binding.gyp compatibility, but this legacy
    # shared filename is never read or written. A cache hit therefore means an
    # archive belonging to this canonical tag, not merely any prior archive.
    tarball = versioned_tarball_path(tarball, version)

    # Serialise inspection, download, extraction, and publication. A crashed
    # owner is identified by its dead PID (or unreadable metadata after a short
    # grace period) and its lock is removed, so stale locks cannot block forever.
    with XZCacheLock(dirname):
        # Do this before GitHub API calls to avoid rate limiting on a valid cache.
        if is_xz_already_extracted(dirname, version):
            print(f"[SKIP] XZ {version} already available, skipping download")
            return 0

        validated_version = validate_version(version, version_source)
        if not validated_version:
            fail_version_resolution(
                version,
                version_source,
                'GitHub release tag was not found; update the requested version',
            )

        if os.path.exists(tarball):
            print(f"[CACHED] Using cached tarball: {tarball}")
        else:
            temporary_tarball = f'{tarball}.tmp-{os.getpid()}'
            try:
                url = get_tarball_url(validated_version)
                download_tarball(url, temporary_tarball, version, version_source)
                os.replace(temporary_tarball, tarball)
            finally:
                try:
                    os.unlink(temporary_tarball)
                except FileNotFoundError:
                    pass

        extract_and_publish(tarball, dirname, validated_version)

    print(f"[DONE] Successfully prepared XZ {validated_version}")
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\\n[ERROR] Interrupted by user", file=sys.stderr)
        sys.exit(1)
    except VersionResolutionError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        sys.exit(1)
