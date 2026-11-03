"""Bump the independent maintenance version; source compatibility version stays 3.5.30."""
import argparse
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('version')
args = parser.parse_args()
if not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
    parser.error('Use a numeric MAJOR.MINOR.PATCH version')
config_file = ROOT / 'maintenance.json'
config = json.loads(config_file.read_text('utf-8'))
if tuple(map(int, args.version.split('.'))) <= tuple(map(int, config['version'].split('.'))):
    parser.error('New version must be greater than the current version')
config['version'] = args.version
config_file.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print('Set maintenance version to ' + args.version + '; update CHANGELOG.md and commit before tagging.')
