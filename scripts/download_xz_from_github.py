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
            print(f"🚀 Using latest XZ version: {version}")
            return version
        else:
            print(f"🎯 Using XZ version from environment: {env_version}")
            return env_version
    
    # 2. Repository configuration file
    config = load_version_config()
    configured_version = config.get('version', 'v5.4.0')
    print(f"📋 Using configured XZ version: {configured_version}")
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
    print(f"📥 Downloading from: {url}")
    headers = {'User-Agent': 'node-liblzma'}
    req = urllib.request.Request(url, headers=headers)
    
    with urllib.request.urlopen(req) as response:
        # GitHub redirects to the actual download URL
        final_url = response.geturl()
        print(f"📦 Resolved to: {final_url}")
        
        with urllib.request.urlopen(final_url) as final_response:
            with open(tarball_path, 'wb') as f:
                data = final_response.read()
                f.write(data)
                print(f"✅ Downloaded {len(data)} bytes to {tarball_path}")

def extract_tarball(tarball_path, extract_dir):
    """Extract tarball and rename root directory to 'xz'"""
    print(f"📂 Extracting to {extract_dir}/xz")
    
    with tarfile.open(tarball_path, 'r:gz') as tfile:
        members = tfile.getmembers()
        if not members:
            raise ValueError("Empty tarball")
        
        # GitHub creates directories like "tukaani-project-xz-{commit_hash}"
        root_dir = members[0].name.split('/')[0]
        print(f"📁 Root directory: {root_dir}")
        
        # Extract all members, renaming root directory to 'xz'
        for member in members:
            # Replace the root directory name with 'xz'
            member.name = member.name.replace(root_dir, 'xz', 1)
            # Use safer extraction method that's compatible with older Python versions
            try:
                tfile.extract(member, extract_dir, filter='data')
            except TypeError:
                # Fallback for Python versions that don't support filter parameter
                tfile.extract(member, extract_dir)
        
        print(f"✅ Successfully extracted XZ to {extract_dir}/xz")

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
        print("🔍 Verbose mode enabled")
    
    # Determine version to use
    version = determine_version()
    
    # Validate version exists
    validated_version = validate_version(version)
    if not validated_version:
        print(f"❌ Version {version} not found, falling back to v5.4.0")
        validated_version = 'v5.4.0'
    
    # Prepare paths
    tarball = os.path.abspath(args.tarball)
    dirname = os.path.abspath(args.dirname)
    
    # Ensure we're using .tar.gz extension (GitHub uses gzip, not xz)
    if tarball.endswith('.tar.xz'):
        tarball = tarball.replace('.tar.xz', '.tar.gz')
        print(f"📝 Adjusted tarball name to: {tarball}")
    
    # Create directories if needed
    os.makedirs(os.path.dirname(tarball), exist_ok=True)
    os.makedirs(dirname, exist_ok=True)
    
    # Download if not cached
    if os.path.exists(tarball):
        print(f"♻️ Using cached tarball: {tarball}")
    else:
        url = get_tarball_url(validated_version)
        download_tarball(url, tarball)
    
    # Extract
    extract_tarball(tarball, dirname)
    
    print(f"🎉 Successfully prepared XZ {validated_version}")
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\\n❌ Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)