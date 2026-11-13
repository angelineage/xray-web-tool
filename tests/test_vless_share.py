import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'src/shadowsocks/scripts/ss_node_subscribe.sh'
BASH = shutil.which('bash') or r'C:\Program Files\Git\bin\bash.exe'

class ShareLinkTests(unittest.TestCase):
    def parse(self, link, action='2', policy='1'):
        text = SCRIPT.read_text(encoding='utf-8')
        helpers = text[text.index('sub_uri_query_value(){'):text.index('sub_log_unsupported_scheme_once(){')]
        parser = text[text.index('add_vless_node(){'):text.index('add_trojan_node(){')]
        parser = parser.replace('/koolshare/bin/jq -ce', 'mock_jq -ce')
        harness = r'''#!/bin/bash
urldecode(){ sed 's@+@ @g;s@%@\\x@g' | xargs -0 printf '%b'; }
mock_jq(){ "$TEST_PYTHON" -c 'import json,sys; x=json.load(sys.stdin); assert isinstance(x,dict); print(json.dumps(x,separators=(",",":")))'; }
json_init(){ : > "$OUTPUT"; }
json_add_string(){ printf '%s\t%s\n' "$1" "$2" >> "$OUTPUT"; }
json_write_object(){ :; }
sub_log_node_success(){ :; }
echo_date(){ :; }
filter_nodes(){ return 0; }
''' + helpers + '\n' + parser + r'''
SUB_AI="$POLICY"; SUB_MODE=1; SUB_SOURCE_TAG=test; DOMAIN_NAME=test; DIR=.; sub_count=0
add_vless_node "$LINK" "$ACTION" vless
'''
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'harness.sh'
            out = Path(tmp) / 'fields'
            path.write_text(harness, encoding='utf-8', newline='\n')
            env = dict(os.environ, LINK=link, ACTION=action, POLICY=policy, OUTPUT=str(out), TEST_PYTHON=sys.executable)
            proc = subprocess.run([BASH, str(path)], env=env, capture_output=True, text=True)
            if proc.returncode:
                return None
            return dict(line.split('\t', 1) for line in out.read_text(encoding='utf-8').splitlines())

    def test_xhttp_authority_and_certificate(self):
        extra = {'xPaddingObfsMode': True, 'xPaddingMethod': 'tokenish', 'xPaddingPlacement': 'queryInHeader', 'xPaddingHeader': 'fbe6f7', 'xPaddingKey': '_a3e0ed', 'xmux': {'maxConnections': 3, 'maxConcurrency': 0, 'cMaxReuseTimes': 0, 'hMaxRequestTimes': 600, 'hMaxReusableSecs': 3000, 'hKeepAlivePeriod': 0}}
        link = '7fbe6f78-cebc-4d63-8480-ca3e0ed216e2@172.64.229.188:443?encryption=none&security=tls&sni=t5820.lineage.dpdns.org&fp=chrome&type=xhttp&host=t5820.lineage.dpdns.org&path=%2F%3Fed%3D2560&mode=stream-one&extra=' + quote(json.dumps(extra,separators=(',',':')), safe='') + '#NRT-JP'
        fields = self.parse(link)
        self.assertIsNotNone(fields)
        self.assertEqual((fields['server'],fields['port']), ('172.64.229.188','443'))
        self.assertEqual(fields['xray_network_security_ai'], '')
        self.assertEqual(fields['xray_network_path'], '/?ed=2560')
        self.assertEqual(fields['xray_xhttp_mode'], 'stream-one')
        self.assertEqual(json.loads(fields['xray_xhttp_extra']),extra)
        self.assertEqual(self.parse(link.replace('&security=tls','&security=tls&allowInsecure=1'))['xray_network_security_ai'], '1')
        self.assertEqual(self.parse(link.replace('&security=tls','&security=tls&allowInsecure=false&insecure=1'))['xray_network_security_ai'], '')
        self.assertEqual(self.parse(link, action='1')['xray_network_security_ai'], '1')

    def test_ipv6_and_invalid_port(self):
        prefix='id@[2001:db8::1]:'
        suffix='?security=tls&type=tcp#test'
        fields=self.parse(prefix+'443'+suffix,policy='0')
        self.assertEqual((fields['server'],fields['port']),('2001:db8::1','443'))
        for port in ('0','65536','abc'):
            self.assertIsNone(self.parse(prefix+port+suffix,policy='0'))

if __name__ == '__main__':
    unittest.main()
