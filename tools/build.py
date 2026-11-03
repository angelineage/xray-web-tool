"""Build one deterministic AC3100 arm_lite package with Python's standard library."""
import argparse
import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def build(output=None):
    config = json.loads((ROOT / 'maintenance.json').read_text('utf-8'))
    version = config['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-z0-9.]+)?', version):
        raise ValueError('Invalid maintenance version')
    if os.environ.get('GITHUB_REF_TYPE') == 'tag' and os.environ.get('GITHUB_REF_NAME') != 'v' + version:
        raise ValueError('Release tag must match maintenance.json version')
    if config['target'] != {'model': 'RT-AC3100', 'arch': 'arm', 'edition': 'lite', 'kernel': '2.6.36'}:
        raise ValueError('This project builds RT-AC3100 arm_lite only')
    source = ROOT / 'src'
    lock = json.loads((ROOT / 'packaging/vendor-lock.json').read_text('utf-8'))
    for relative, expected in lock.items():
        if hashlib.sha256((source / relative).read_bytes()).hexdigest() != expected:
            raise ValueError('Native binary differs from reviewed vendor lock: ' + relative)
    modes = json.loads((ROOT / 'packaging/file-modes.json').read_text('utf-8'))
    files = {p.relative_to(source).as_posix(): p.read_bytes() for p in source.rglob('*') if p.is_file()}
    files['shadowsocks/ss/maintenance.json'] = (json.dumps(config, ensure_ascii=False, indent=2) + '\n').encode()
    files['shadowsocks/ss/compat_revision'] = ('ac3100-' + version + '\n').encode()
    files['shadowsocks/res/ac3100-version.js'] = ('window.FANCYSS_AC3100=' + json.dumps(config, ensure_ascii=False) + ';\n').encode()
    files['shadowsocks/LICENSE'] = (ROOT / 'LICENSE').read_bytes()
    files['shadowsocks/SOURCE.txt'] = ('Upstream: https://github.com/hq450/fancyss\nUpstream commit: ' + config['upstream_commit'] + '\nMaintenance: fancyss-ac3100 ' + version + '\nSource code is distributed alongside this package.\n').encode()
    destination = pathlib.Path(output) if output else ROOT / 'dist'
    destination.mkdir(parents=True, exist_ok=True)
    package = destination / ('fancyss_arm_lite_ac3100_' + version + '.tar.gz')
    with package.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w', format=tarfile.GNU_FORMAT) as archive:
            directories = sorted({str(pathlib.PurePosixPath(n).parent) for n in files} | {'shadowsocks'})
            for name in directories:
                if name == '.':
                    continue
                info = tarfile.TarInfo(name)
                info.type = tarfile.DIRTYPE
                info.mode = 0o755
                archive.addfile(info)
            for name, data in sorted(files.items()):
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = modes.get(name, 0o755 if name.endswith('.sh') else 0o644)
                archive.addfile(info, io.BytesIO(data))
    # Package contents and permissions are checked after writing, not just before.
    with tarfile.open(package) as archive:
        for name, data in files.items():
            if archive.extractfile(name).read() != data:
                raise ValueError('Archive verification failed: ' + name)
        for name in lock:
            if archive.getmember(name).mode & 0o111 == 0:
                raise ValueError('Executable bit missing: ' + name)
    checksum = hashlib.sha256(package.read_bytes()).hexdigest()
    (destination / 'SHA256SUMS.txt').write_text(checksum + '  ' + package.name + '\n', encoding='ascii')
    manifest = {'version': version, 'target': config['target'], 'sha256': checksum,
                'files': {n: hashlib.sha256(d).hexdigest() for n, d in sorted(files.items())}}
    (destination / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(str(package))
    return package


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output')
    args = parser.parse_args()
    build(args.output)
