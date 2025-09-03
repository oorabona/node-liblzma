#!/usr/bin/env python3
"""
Download and extract XZ Utils from GitHub with intelligent version management.

Version priority:
1. XZ_VERSION environment variable (highest priority - for CI/CD overrides)
2. xz-version.json configuration file (stable default)
3. Fallback to v5.4.0 if no config found

Usage:
  python3 download_xz_from_github.py <tarball_path> <extract_dir>

Environment variables:
  XZ_VERSION: Specific version (e.g., 'v5.8.1', 'latest')
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

def load_version_config():
    """Load version configuration from xz-version.json"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, '..', 'xz-version.json')
    
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
                print(f"Loaded XZ config: {config.get('version', 'unknown')} ({config.get('comment', 'no comment')})")
                return config
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not read xz-version.json: {e}")
    
    # Fallback configuration
    return {
        'version': 'v5.4.0',
        'comment': 'Fallback stable version',
        'allow_override': True
    }

def get_latest_version():
    """Get the latest XZ version from GitHub API"""
    api_url = "https://api.github.com/repos/tukaani-project/xz/releases/latest"
    headers = {'User-Agent': 'node-liblzma'}
    req = urllib.request.Request(api_url, headers=headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            return data['tag_name']
    except Exception as e:
        print(f"Warning: Could not fetch latest version: {e}")
        return 'v5.8.1'  # Safe fallback

def determine_version():
    """Determine which XZ version to use based on priority hierarchy"""
    # 1. Environment variable has highest priority (CI/CD overrides)
    env_version = os.environ.get('XZ_VERSION', '').strip()
    if env_version:
        if env_version.lower() == 'latest':
            version = get_latest_version()
            print(f"[LAUNCH] Using latest XZ version: {version}")
            return version
        else:
            print(f"[TARGET] Using XZ version from environment: {env_version}")
            return env_version
    
    # 2. Repository configuration file
    config = load_version_config()
    configured_version = config.get('version', 'v5.4.0')
    print(f"[CONFIG] Using configured XZ version: {configured_version}")
    return configured_version

def validate_version(version):
    """Validate that the version exists on GitHub"""
    if not version.startswith('v'):
        version = 'v' + version
    
    # Check if version exists
    api_url = f"https://api.github.com/repos/tukaani-project/xz/releases/tags/{version}"
    headers = {'User-Agent': 'node-liblzma'}
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
    headers = {'User-Agent': 'node-liblzma'}
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
            if member.islink() or member.issym():
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

def main():
    parser = argparse.ArgumentParser(
        description='Download XZ Utils from GitHub with intelligent version management',
        epilog='''
Version priority:
  1. XZ_VERSION environment variable (e.g., XZ_VERSION=v5.8.1)
  2. xz-version.json configuration file
  3. Fallback to v5.4.0

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
    version = determine_version()
    
    # Validate version exists
    validated_version = validate_version(version)
    if not validated_version:
        print(f"[ERROR] Version {version} not found, falling back to v5.4.0")
        validated_version = 'v5.4.0'
    
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
    
    # Download if not cached
    if os.path.exists(tarball):
        print(f"[CACHED] Using cached tarball: {tarball}")
    else:
        url = get_tarball_url(validated_version)
        download_tarball(url, tarball)
    
    # Extract
    extract_tarball(tarball, dirname)
    
    print(f"[DONE] Successfully prepared XZ {validated_version}")
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\\n[ERROR] Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        sys.exit(1)