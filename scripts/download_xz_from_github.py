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
import json
import sys
import tarfile
import os
import argparse
from datetime import datetime
from pathlib import Path
import tempfile


class VersionResolutionError(Exception):
    """Raised when the requested XZ version cannot be resolved."""


def fail_version_resolution(version, source, cause):
    """Stop the build rather than silently choosing a different XZ version."""
    raise VersionResolutionError(
        f"Could not resolve XZ version {version} from {source}: {cause}"
    )


def get_github_headers():
    """Get headers with optional GitHub token for authentication"""
    headers = {'User-Agent': 'node-liblzma'}

    # Use GITHUB_TOKEN if available (in CI) to avoid rate limiting
    # Increases limit from 60/hour to 5000/hour
    token = os.environ.get('GITHUB_TOKEN', '').strip()
    if token:
        headers['Authorization'] = f'token {token}'
        print("[AUTH] Using GitHub token for authenticated requests")

    return headers

def load_version_config():
    """Load version configuration from xz-version.json"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, '..', 'xz-version.json')

    if not os.path.exists(config_path):
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            'file does not exist',
        )

    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            f'invalid JSON: {e}',
        )
    except IOError as e:
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
    """Get the latest XZ version from GitHub API"""
    api_url = "https://api.github.com/repos/tukaani-project/xz/releases/latest"
    headers = get_github_headers()
    req = urllib.request.Request(api_url, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            return data['tag_name']
    except Exception as e:
        fail_version_resolution(
            'latest',
            'XZ_VERSION=latest',
            f'could not query the GitHub releases API: {e}; check network access',
        )

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
            print(f"[TARGET] Using XZ version from environment: {env_version}")
            return env_version, 'XZ_VERSION'
    
    # 2. Repository configuration file
    config, config_path = load_version_config()
    configured_version = config.get('version')
    if not isinstance(configured_version, str) or not configured_version.strip():
        fail_version_resolution(
            'repository pin',
            f'xz-version.json ({config_path})',
            'missing required "version" key',
        )
    configured_version = configured_version.strip()
    print(f"[CONFIG] Using configured XZ version: {configured_version}")
    return configured_version, f'xz-version.json ({config_path})'

def validate_version(version):
    """Validate that the version exists on GitHub"""
    if not version.startswith('v'):
        version = 'v' + version

    # Check if version exists
    api_url = f"https://api.github.com/repos/tukaani-project/xz/releases/tags/{version}"
    headers = get_github_headers()
    req = urllib.request.Request(api_url, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            return version
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"Warning: Version {version} not found on GitHub")
            return None
        raise

def get_tarball_url(version):
    """Get the tarball URL for a specific version"""
    return f'https://api.github.com/repos/tukaani-project/xz/tarball/{version}'

def download_tarball(url, tarball_path):
    """Download tarball from GitHub with proper user agent"""
    print(f"[DOWNLOAD] Downloading from: {url}")
    headers = get_github_headers()
    req = urllib.request.Request(url, headers=headers)
    
    with urllib.request.urlopen(req) as response:
        # GitHub redirects to the actual download URL
        final_url = response.geturl()
        print(f"[PACKAGE] Resolved to: {final_url}")
        
        with urllib.request.urlopen(final_url) as final_response:
            with open(tarball_path, 'wb') as f:
                data = final_response.read()
                f.write(data)
                print(f"[SUCCESS] Downloaded {len(data)} bytes to {tarball_path}")

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
                print(f"[SKIP] Skipping member not in root directory: {member.name}")
                continue
                
            new_name = member.name.replace(root_dir, 'xz', 1)
            
            # Validate the new path is safe
            if not is_safe_path(new_name, extract_dir):
                print(f"[SECURITY] Rejecting unsafe path: {member.name} -> {new_name}")
                continue
            
            # Additional safety checks for member properties
            if member.islnk() or member.issym():
                # Validate link targets are also safe
                if member.linkname and not is_safe_path(member.linkname, extract_dir):
                    print(f"[SECURITY] Rejecting unsafe link target: {member.linkname}")
                    continue
            
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
                    print(f"[SECURITY] Skipping oversized file: {member.name} ({member.size} bytes)")
                    continue
                tfile.extract(member, extract_dir)
            except Exception as e:
                print(f"[ERROR] Failed to extract {member.name}: {e}")
                continue

        print(f"[SUCCESS] Successfully extracted XZ to {extract_dir}/xz")

def write_version_marker(extract_dir, version):
    """Write version marker file for cache validation"""
    xz_dir = os.path.join(extract_dir, 'xz')
    version_file = os.path.join(xz_dir, '.xz-version')

    try:
        with open(version_file, 'w') as f:
            f.write(version)
        print(f"[VERSION] Wrote version marker: {version}")
    except IOError as e:
        print(f"[WARNING] Could not write version marker: {e}")

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

    # Check if already extracted with correct version (smart cache)
    # Do this BEFORE any GitHub API calls to avoid rate limiting
    if is_xz_already_extracted(dirname, version):
        print(f"[SKIP] XZ {version} already available, skipping download")
        return 0

    # Only validate version if we need to download (avoids GitHub API call when cached)
    validated_version = validate_version(version)
    if not validated_version:
        fail_version_resolution(
            version,
            version_source,
            'GitHub release tag was not found; update the requested version',
        )

    # Download if not cached
    if os.path.exists(tarball):
        print(f"[CACHED] Using cached tarball: {tarball}")
    else:
        url = get_tarball_url(validated_version)
        download_tarball(url, tarball)

    # Extract
    extract_tarball(tarball, dirname)

    # Write version marker for future cache validation
    write_version_marker(dirname, validated_version)

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
