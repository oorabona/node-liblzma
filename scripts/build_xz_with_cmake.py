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
        # Disable CLI tools completely (they have libintl dependency issues on macOS)
        '-DXZ_TOOL_XZ=OFF',
        '-DXZ_TOOL_LZMAINFO=OFF',
        '-DXZ_TOOL_XZDEC=OFF',
        '-DXZ_TOOL_LZMADEC=OFF',
        # Enable Position Independent Code for use in shared libraries
        '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
        # Disable compiler warnings that might cause issues in CI
        '-DCMAKE_C_FLAGS=-w',
    ]
    
    # Platform-specific configuration
    system = platform.system()
    
    # Threading support - XZ 5.8+ has full XZ_THREADS support
    if enable_threads.lower() in ['yes', 'true', '1']:
        cmake_args.append('-DXZ_THREADS=yes')
        print("[THREAD] Threading support: enabled (XZ_THREADS=yes)")
    else:
        cmake_args.append('-DXZ_THREADS=no')
        print("[THREAD] Threading support: disabled (XZ_THREADS=no)")
    
    if system == "Windows":
        # Use Visual Studio generator for Windows builds (supports -A x64)
        cmake_args.extend(['-G', 'Visual Studio 17 2022', '-A', 'x64'])
        print("[BUILD] Windows x64 build configuration")
    elif system == "Darwin":
        # macOS specific optimizations
        cmake_args.extend([
            '-DCMAKE_OSX_DEPLOYMENT_TARGET=10.15'
        ])

        # For shared libraries on macOS, configure proper install_name
        if runtime_link == "shared":
            cmake_args.extend([
                '-DCMAKE_INSTALL_NAME_DIR=@rpath',
                '-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON',
                '-DCMAKE_INSTALL_RPATH=@loader_path;@loader_path/../lib',
                '-DCMAKE_MACOSX_RPATH=ON'
            ])
            print("[BUILD] macOS shared library: configured @rpath install_name")

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
        result = subprocess.run(cmake_args, check=True, cwd=source_dir, capture_output=True, text=True)
        print("[SUCCESS] CMake configuration successful")
        
        # Log all CMake output for threading diagnostics
        print(f"[DEBUG] Full CMake configuration output:")
        for line in result.stdout.split('\n'):
            if line.strip():
                print(f"[DEBUG]   {line.strip()}")
        
        if result.stderr.strip():
            print(f"[DEBUG] CMake stderr:")
            for line in result.stderr.split('\n'):
                if line.strip():
                    print(f"[DEBUG]   {line.strip()}")
        
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] CMake configuration failed with exit code {e.returncode}")
        if e.stdout:
            print(f"[ERROR] stdout: {e.stdout}")
        if e.stderr:
            print(f"[ERROR] stderr: {e.stderr}")
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

def fix_windows_lib_names(install_dir):
    """Fix Windows library naming: CMake creates lzma.lib but binding.gyp expects liblzma.lib"""
    if platform.system() != "Windows":
        return True

    import shutil
    lib_dir = os.path.join(install_dir, 'lib')
    source_lib = os.path.join(lib_dir, 'lzma.lib')
    target_lib = os.path.join(lib_dir, 'liblzma.lib')

    if os.path.exists(source_lib) and not os.path.exists(target_lib):
        try:
            shutil.copy2(source_lib, target_lib)
            print(f"[FIX] Created {target_lib} from {source_lib}")
            return True
        except Exception as e:
            print(f"[WARNING] Could not create liblzma.lib: {e}")
            return False
    elif os.path.exists(target_lib):
        print(f"[OK] {target_lib} already exists")
        return True
    else:
        print(f"[WARNING] Source file {source_lib} not found")
        return False

def verify_and_fix_dylib_install_name(install_dir):
    """Verify and fix macOS dylib install_name to use @rpath"""
    if platform.system() != "Darwin":
        return True

    dylib_path = os.path.join(install_dir, 'lib', 'liblzma.dylib')
    if not os.path.exists(dylib_path):
        print(f"[WARNING] Dylib not found at {dylib_path}")
        return False

    try:
        # Check current install_name using otool
        result = subprocess.run(['otool', '-D', dylib_path],
                              capture_output=True, text=True, check=True)
        current_install_name = result.stdout.strip().split('\n')[-1]

        print(f"[VERIFY] Current install_name: {current_install_name}")

        # If install_name doesn't start with @rpath, fix it
        if not current_install_name.startswith('@rpath'):
            print(f"[FIX] Fixing install_name to use @rpath")
            subprocess.run(['install_name_tool', '-id', '@rpath/liblzma.dylib', dylib_path],
                         check=True)

            # Verify the fix
            result = subprocess.run(['otool', '-D', dylib_path],
                                  capture_output=True, text=True, check=True)
            new_install_name = result.stdout.strip().split('\n')[-1]
            print(f"[SUCCESS] Updated install_name: {new_install_name}")

            if not new_install_name.startswith('@rpath'):
                print(f"[ERROR] Failed to update install_name")
                return False
        else:
            print(f"[OK] install_name already uses @rpath")

        return True

    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Failed to verify/fix install_name: {e}")
        return False
    except Exception as e:
        print(f"[ERROR] Unexpected error in install_name verification: {e}")
        return False

def verify_build(install_dir, runtime_link="static"):
    """Verify that the build produced the expected files"""
    expected_files = ['include/lzma.h']  # Common file for all builds

    system = platform.system()
    if system == "Windows":
        if runtime_link == "static":
            expected_files.append('lib/liblzma.lib')
        else:
            # For shared builds on Windows, expect both import lib and DLL
            expected_files.extend(['lib/liblzma.lib', 'bin/liblzma.dll'])
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
Required environment variables (strict validation):
  RUNTIME_LINK: 'static' or 'shared' (REQUIRED)
  ENABLE_THREAD_SUPPORT: 'yes' or 'no' (REQUIRED)
  USE_GLOBAL: 'true' or 'false' (REQUIRED)

Examples:
  RUNTIME_LINK=static ENABLE_THREAD_SUPPORT=yes USE_GLOBAL=false \\
    python3 build_xz_with_cmake.py deps/xz build/liblzma
  
  RUNTIME_LINK=shared ENABLE_THREAD_SUPPORT=no USE_GLOBAL=true \\
    python3 build_xz_with_cmake.py deps/xz build/liblzma
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('source_dir', help='XZ source directory')
    parser.add_argument('install_dir', help='Installation directory')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Verbose output')
    
    args = parser.parse_args()
    
    # Get configuration from environment variables with strict validation
    runtime_link = os.environ.get('RUNTIME_LINK')
    enable_threads = os.environ.get('ENABLE_THREAD_SUPPORT')
    use_global = os.environ.get('USE_GLOBAL')
    
    # Strict validation - fail if critical variables are not explicitly set
    if runtime_link is None:
        print("[ERROR] RUNTIME_LINK environment variable must be explicitly set ('static' or 'shared')")
        return 1
    
    if enable_threads is None:
        print("[ERROR] ENABLE_THREAD_SUPPORT environment variable must be explicitly set ('yes' or 'no')")
        return 1
        
    if use_global is None:
        print("[ERROR] USE_GLOBAL environment variable must be explicitly set ('true' or 'false')")
        return 1
    
    # Validate values
    if runtime_link not in ['static', 'shared']:
        print(f"[ERROR] Invalid RUNTIME_LINK: {runtime_link}. Must be 'static' or 'shared'")
        return 1
    
    if enable_threads.lower() not in ['yes', 'no', 'true', 'false', '1', '0']:
        print(f"[ERROR] Invalid ENABLE_THREAD_SUPPORT: {enable_threads}. Must be yes/no/true/false/1/0")
        return 1
        
    if use_global.lower() not in ['true', 'false']:
        print(f"[ERROR] Invalid USE_GLOBAL: {use_global}. Must be 'true' or 'false'")
        return 1
    
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
                       runtime_link, enable_threads) and
        build_cmake(build_dir) and
        install_cmake(build_dir, install_dir) and
        fix_windows_lib_names(install_dir) and
        verify_and_fix_dylib_install_name(install_dir) and
        verify_build(install_dir, runtime_link)
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