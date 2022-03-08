import os
import shutil
import sys

source = os.path.abspath(sys.argv[1])
target = os.path.abspath(sys.argv[2])

# Create target directory
target_dirname = os.path.dirname(target)
os.makedirs(target_dirname, exist_ok=True)

# We probably do not need the extra metadata info but that does not hurt
shutil.copy2(source, target)