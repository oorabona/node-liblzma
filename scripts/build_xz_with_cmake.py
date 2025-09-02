#!/usr/bin/env python3
"""
Build XZ Utils using CMake from GitHub sources.

This script compiles liblzma from XZ sources using CMake, which works
with raw Git sources without needing autogen.sh or pre-built config files.

Usage:
  python3 build_xz_with_cmake.py <xz_source_dir> <install_prefix> [runtime_link] [enable_threads]
"""

import os
import sys
import subprocess
import platform
import argparse
import shutil
from pathlib import Path

def detect_cmake():
    """Check if CMake is available"""
    try:
        result = subprocess.run(['cmake', '--version'], 
                              capture_output=True, text=True, check=True)
        version_line = result.stdout.split('\n')[0]
        print(f"[PACKAGE] Found {version_line}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def get_cmake_generator():
    """Get appropriate CMake generator for the current platform"""
    system = platform.system()
    if system == "Windows":
        # Use Ninja or Unix Makefiles for better CI compatibility
        # Visual Studio generator can be problematic in CI environments
        return "Ninja" if shutil.which('ninja') else "Unix Makefiles"
    else:
        # Use Unix Makefiles on Linux/macOS (works with make, ninja, etc.)
        return "Unix Makefiles"

def configure_cmake(source_dir, build_dir, install_dir, runtime_link="static", enable_threads="no"):
    """Configure XZ build with CMake"""
    generator = get_cmake_generator()
    cmake_args = [
        'cmake',
        f'-G{generator}',
        f'-B{build_dir}',
        f'-DCMAKE_INSTALL_PREFIX={install_dir}',
        '-DCMAKE_BUILD_TYPE=Release',
        '-DBUILD_SHARED_LIBS=OFF' if runtime_link == 'static' else '-DBUILD_SHARED_LIBS=ON',
        # Build only liblzma, not the command-line tools
        '-DCREATE_XZ_SYMLINKS=OFF',
        '-DCREATE_LZMA_SYMLINKS=OFF',
        # Enable Position Independent Code for use in shared libraries
        '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
        # Disable compiler warnings that might cause issues in CI
        '-DCMAKE_C_FLAGS=-w'
    ]
    
    # Threading support
    if enable_threads.lower() in ['yes', 'true', '1']:
        cmake_args.append('-DENABLE_THREADS=ON')
        print("[THREAD] Threading support: enabled")
    else:
        cmake_args.append('-DENABLE_THREADS=OFF')
        print("[THREAD] Threading support: disabled")
    
    # Platform-specific configuration
    system = platform.system()
    if system == "Windows":
        # Set architecture for Windows builds
        cmake_args.extend(['-A', 'x64'])
        print("[BUILD] Windows x64 build configuration")
    elif system == "Darwin":
        # macOS specific optimizations
        cmake_args.extend([
            '-DCMAKE_OSX_DEPLOYMENT_TARGET=10.15'
        ])
        print("[BUILD] macOS build configuration")
    else:
        # Linux and other Unix systems
        print("[BUILD] Linux/Unix build configuration")
    
    cmake_args.append(source_dir)
    
    print(f"[CONFIG] Configuring CMake build...")
    print(f"   Source: {source_dir}")
    print(f"   Build: {build_dir}")
    print(f"   Install: {install_dir}")
    print(f"   Runtime: {runtime_link}")
    
    try:
        result = subprocess.run(cmake_args, check=True, cwd=source_dir)
        print("[SUCCESS] CMake configuration successful")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] CMake configuration failed with exit code {e.returncode}")
        return False

def build_cmake(build_dir):
    """Build the configured CMake project"""
    cmake_args = [
        'cmake',
        '--build', build_dir,
        '--config', 'Release',
        '--parallel'
    ]
    
    print("[BUILD] Building XZ with CMake...")
    
    try:
        result = subprocess.run(cmake_args, check=True)
        print("[SUCCESS] CMake build successful")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] CMake build failed with exit code {e.returncode}")
        return False

def install_cmake(build_dir, install_dir):
    """Install the built libraries to the target directory"""
    cmake_args = [
        'cmake',
        '--install', build_dir,
        '--prefix', install_dir,
        '--config', 'Release'
    ]
    
    print(f"[INSTALL] Installing to {install_dir}...")
    
    # Ensure install directory exists
    os.makedirs(install_dir, exist_ok=True)
    
    try:
        result = subprocess.run(cmake_args, check=True)
        print("[SUCCESS] CMake install successful")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] CMake install failed with exit code {e.returncode}")
        return False

def verify_build(install_dir, runtime_link="static"):
    """Verify that the build produced the expected files"""
    expected_files = ['include/lzma.h']  # Common file for all builds
    
    system = platform.system()
    if system == "Windows":
        expected_files.append('lib/liblzma.lib')
    else:
        if runtime_link == "static":
            expected_files.append('lib/liblzma.a')
        else:
            # For shared builds, look for .so files (or .dylib on macOS)
            if system == "Darwin":
                expected_files.append('lib/liblzma.dylib')
            else:
                expected_files.append('lib/liblzma.so')
    
    missing_files = []
    for file_path in expected_files:
        full_path = os.path.join(install_dir, file_path)
        if not os.path.exists(full_path):
            missing_files.append(file_path)
    
    if missing_files:
        print(f"[WARNING] Missing expected files: {', '.join(missing_files)}")
        return False
    else:
        print("[SUCCESS] Build verification successful - all expected files present")
        return True

def main():
    parser = argparse.ArgumentParser(
        description='Build XZ Utils using CMake',
        epilog='''
Examples:
  python3 build_xz_with_cmake.py deps/xz build/liblzma static yes
  python3 build_xz_with_cmake.py deps/xz build/liblzma shared no
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('source_dir', help='XZ source directory')
    parser.add_argument('install_dir', help='Installation directory')
    parser.add_argument('runtime_link', nargs='?', default='static',
                       choices=['static', 'shared'],
                       help='Runtime linking type (default: static)')
    parser.add_argument('enable_threads', nargs='?', default='no',
                       choices=['yes', 'no'],
                       help='Enable threading support (default: no)')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Verbose output')
    
    args = parser.parse_args()
    
    # Convert to absolute paths
    source_dir = os.path.abspath(args.source_dir)
    install_dir = os.path.abspath(args.install_dir)
    build_dir = os.path.join(source_dir, 'build-cmake')
    
    if args.verbose:
        print("[VERBOSE] Verbose mode enabled")
    
    # Validate source directory
    cmake_file = os.path.join(source_dir, 'CMakeLists.txt')
    if not os.path.exists(cmake_file):
        print(f"[ERROR] CMakeLists.txt not found in {source_dir}")
        return 1
    
    # Check CMake availability
    if not detect_cmake():
        print("[ERROR] CMake not found. Please install CMake to continue.")
        return 1
    
    # Clean build directory if it exists
    if os.path.exists(build_dir):
        import shutil
        print(f"[CLEAN] Cleaning existing build directory: {build_dir}")
        shutil.rmtree(build_dir)
    
    # Build process
    success = (
        configure_cmake(source_dir, build_dir, install_dir, 
                       args.runtime_link, args.enable_threads) and
        build_cmake(build_dir) and
        install_cmake(build_dir, install_dir) and
        verify_build(install_dir, args.runtime_link)
    )
    
    if success:
        print(f"[DONE] XZ build completed successfully!")
        print(f"   Libraries installed in: {install_dir}")
        return 0
    else:
        print("[ERROR] Build failed")
        return 1

if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[ERROR] Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
        sys.exit(1)