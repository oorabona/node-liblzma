#!/usr/bin/env python3
"""
Copy DLL file for Windows shared builds.

This script copies the liblzma.dll from the install directory to the build
directory so it can be found at runtime.

Usage:
  python3 copy_dll.py <source_dll> <target_directory>
"""

import os
import sys
import shutil
from pathlib import Path

def main():
    if len(sys.argv) != 3:
        print("[ERROR] Usage: python3 copy_dll.py <source_dll> <target_directory>")
        return 1
    
    source_dll = sys.argv[1]
    target_dir = sys.argv[2]
    
    # Convert to absolute paths
    source_dll = os.path.abspath(source_dll)
    target_dir = os.path.abspath(target_dir)
    
    # Validate source file exists
    if not os.path.exists(source_dll):
        print(f"[ERROR] Source DLL not found: {source_dll}")
        return 1
    
    # Ensure target directory exists
    os.makedirs(target_dir, exist_ok=True)
    
    # Get filename and create target path
    dll_name = os.path.basename(source_dll)
    target_path = os.path.join(target_dir, dll_name)
    
    try:
        print(f"[COPY] Copying DLL from {source_dll} to {target_path}")
        shutil.copy2(source_dll, target_path)
        print(f"[SUCCESS] DLL copied successfully")
        return 0
    except Exception as e:
        print(f"[ERROR] Failed to copy DLL: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())