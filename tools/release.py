"""Check a clean committed tree, test, build, optionally tag, and archive source."""
import argparse
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def run(*command):
    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', action='store_true', help='Create a local annotated release tag after checks')
    args = parser.parse_args()
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT):
        raise SystemExit('Commit or stash changes before releasing; dist/.cache are ignored.')
    version = json.loads((ROOT / 'maintenance.json').read_text('utf-8'))['version']
    run(sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v')
    run('node', 'tests/test_ui.cjs')
    run('node', 'tests/test_probe.cjs')
    run(sys.executable, 'tools/build.py')
    if args.tag:
        run('git', 'tag', '-a', 'v' + version, '-m', 'RT-AC3100 arm_lite maintenance ' + version)
    run('git', 'archive', '--format=tar.gz', '--prefix=fancyss-ac3100/', '-o', str(ROOT / 'dist' / ('fancyss-ac3100-source-' + version + '.tar.gz')), 'HEAD')
