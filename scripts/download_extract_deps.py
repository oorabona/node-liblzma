import urllib.request
import sys
import tarfile
import os

url = 'https://tukaani.org/xz/xz-5.2.5.tar.xz'
tarball = os.path.abspath(sys.argv[1])
dirname = os.path.abspath(sys.argv[2])

def members(tf):
    for member in tf.getmembers():
        member.path = member.path.replace('xz-5.2.5', 'xz')
        yield member

# avoid redownload if tarball already exist
if os.path.exists(tarball):
    print('Not downloading file, tarball', tarball, 'already exists.')
else:
    print('Downloading archive from ', url)
    with urllib.request.urlopen(url) as response:
        with open(tarball, 'wb') as f:
            f.write(response.read())

tfile = tarfile.open(tarball,'r:xz')
tfile.extractall(dirname, members=members(tfile))

print('Finished extracting tarball to ', dirname)

sys.exit(0)
