import os;
import sys;

for (dirpath, dirnames, filenames) in os.walk(sys.argv[1]):
    for filename in filenames:
        if filename.endswith(('.cc', '.cpp', '.h', '.hpp', '.c')): 
            print('/'.join([dirpath.replace(os.sep, '/'), filename]))