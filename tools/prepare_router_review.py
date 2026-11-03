"""Prepare isolated router tests; no SSH credentials or production writes."""
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
REMOTE = '/tmp/fancyss_ac3100_review_v010'
stage = ROOT / '.cache/router-review'
stage.mkdir(parents=True, exist_ok=True)
for name in ('ss_rule_update.sh', 'ss_log.sh', 'ss_probe_lib.sh'):
    text = (ROOT / 'src/shadowsocks/scripts' / name).read_text('utf-8')
    text = text.replace('/koolshare/scripts/base.sh', REMOTE + '/base.sh')
    text = text.replace('/koolshare/scripts/ss_probe_lib.sh', REMOTE + '/ss_probe_lib.sh')
    text = text.replace('/koolshare/ss/rules', REMOTE + '/runtime/rules')
    text = text.replace('/koolshare/ss/maintenance.json', REMOTE + '/maintenance.json')
    text = text.replace('/tmp/upload', REMOTE + '/upload')
    text = text.replace('/tmp/fancyss_rule_update.', REMOTE + '/rule_update.')
    text = text.replace('sh /koolshare/ss/ssconfig.sh restart', 'echo FIXTURE_RESTART')
    if name == 'ss_rule_update.sh':
        text = text.replace('ACTION_NAME="$1"', '''
# Test transport and rename failure injection. All paths are confined to /tmp.
fetch() { cp "''' + REMOTE + '''/feed/${1##*/}" "$2"; }
mv() {
    for target in "$@"; do :; done
    if [ "${FAIL_COMMIT}" = 1 ] && [ "${target}" = "''' + REMOTE + '''/runtime/rules/chnlist.gz" ]; then return 1; fi
    /bin/mv "$@"
}
ACTION_NAME="$1"''')
    (stage / name).write_text(text, encoding='utf-8', newline='\n')
config = {'rules_base_url': 'https://fixture.invalid'}
(stage / 'maintenance.json').write_text(json.dumps(config), encoding='utf-8')
(stage / 'base.sh').write_text('''#!/bin/sh
dbus() {
  case "$1" in
    export) echo 'export ss_basic_gfwlist_update=1 ss_basic_chnlist_update=1 ss_basic_chnroute_update=1 ss_basic_rule_update=0 ss_basic_rule_update_time=3' ;;
    get) echo 0 ;;
  esac
}
http_response() { printf '%s' "$1" > ''' + REMOTE + '''/ack.txt; }
nvram() { :; }
cru() { :; }
''', encoding='utf-8', newline='\n')
(stage / 'feed').mkdir(exist_ok=True)
for name in ('gfwlist.gz', 'chnlist.gz', 'chnroute.txt', 'rules.json.js'):
    shutil.copy2(ROOT / 'src/shadowsocks/ss/rules' / name, stage / 'feed' / name)
shutil.copy2(ROOT / 'tests/router_integration.sh', stage / 'run.sh')
print('Copy this directory to ' + REMOTE + ': ' + str(stage))
