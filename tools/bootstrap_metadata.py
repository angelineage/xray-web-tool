"""One-time import of archive modes and binary provenance; not part of build."""
import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
destination = root / 'packaging'
destination.mkdir(exist_ok=True)
with tarfile.open(root.parent / 'fancyss_arm_lite.tar.gz') as archive:
    modes = {m.name: m.mode for m in archive if m.isfile()}
with tarfile.open(root.parent / 'fancyss_arm_lite.tar.gz') as archive:
    binaries = {m.name: hashlib.sha256(archive.extractfile(m).read()).hexdigest()
                for m in archive if m.isfile() and m.name.startswith('shadowsocks/bin/')}
(destination / 'file-modes.json').write_text(json.dumps(modes, indent=2) + '\n', encoding='utf-8')
(destination / 'vendor-lock.json').write_text(json.dumps(binaries, indent=2) + '\n', encoding='utf-8')
