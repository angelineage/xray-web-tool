import base64
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


rules = load('update_rules')
builder = load('build')


class RuleTests(unittest.TestCase):
    def test_abp_base64_and_exclusions(self):
        data = b'[AutoProxy 0.2.9]\n!comment\n||example.com^\n@@||direct.test\n|https://proxy.test/path\n/regexp.*/\n||1.2.3.4\n'
        self.assertEqual(rules.parse_abp(base64.b64encode(data)), {'example.com', 'proxy.test'})

    def test_error_page_rejected(self):
        for fn in (rules.parse_abp, rules.parse_domains, rules.parse_routes):
            with self.assertRaises((ValueError, UnicodeError)):
                fn(b'<html>not a list</html>')

    def test_domain_validation(self):
        for value in ('localhost', '1.2.3.4', 'evil.test/route', '-bad.test', 'bad..test'):
            self.assertIsNone(rules.domain(value))
        self.assertEqual(rules.domain('EXAMPLE.COM.'), 'example.com')

    def test_dnsmasq_tld_idn_and_duplicate(self):
        self.assertEqual(rules.parse_domains(b'server=/cn/114.114.114.114\nserver=/.example.cn/1.1.1.1\nserver=/xn--55qx5d/1.1.1.1\n', True), {'cn', 'example.cn', 'xn--55qx5d'})

    def test_apnic_non_power_of_two(self):
        result = rules.parse_apnic(b'apnic|CN|ipv4|1.0.1.0|768|20260101|allocated\n')
        self.assertEqual(sum(n.num_addresses for n in result), 768)
        self.assertEqual(str(result[0].network_address), '1.0.1.0')

    def test_private_routes_rejected(self):
        with self.assertRaises(ValueError):
            rules.parse_routes(b'192.168.1.0/24\n')

    def test_count_guard(self):
        for count in (0, 999, 1000001, 2000, 20000):
            with self.assertRaises(ValueError):
                rules.guard('gfwlist', count, 6451)
        rules.guard('gfwlist', 6696, 6451)

    def test_bundled_checksums_and_counts(self):
        directory = ROOT / 'src/shadowsocks/ss/rules'
        metadata = json.loads((directory / 'rules.json.js').read_text('utf-8'))
        for key in ('gfwlist', 'chnlist', 'chnroute'):
            item = metadata[key]
            content = (directory / item['name']).read_bytes()
            self.assertEqual(hashlib.md5(content).hexdigest(), item['md5'])
            self.assertEqual(hashlib.sha256(content).hexdigest(), item['sha256'])
            plain = gzip.decompress(content) if item['name'].endswith('.gz') else content
            self.assertEqual(len(plain.splitlines()), int(item['count']))


class BuildTests(unittest.TestCase):
    def test_reproducible_archive_modes_and_metadata(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second, contextlib.redirect_stdout(io.StringIO()):
            a, b = builder.build(first), builder.build(second)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            with tarfile.open(a) as archive:
                config = json.load(archive.extractfile('shadowsocks/ss/maintenance.json'))
                self.assertEqual(config['target']['model'], 'RT-AC3100')
                self.assertIn(config['version'].encode(), archive.extractfile('shadowsocks/res/ac3100-version.js').read())
                self.assertEqual(archive.getmember('shadowsocks/scripts/ss_log.sh').mode, 0o755)
                self.assertEqual(archive.extractfile('shadowsocks/ss/version').read().strip(), b'3.5.30')
                self.assertIn('shadowsocks/LICENSE', archive.getnames())
                self.assertNotIn('shadowsocks/bin/rss-local', archive.getnames())
                self.assertNotIn('shadowsocks/bin/rss-redir', archive.getnames())
                self.assertIn('shadowsocks/bin/xray', archive.getnames())
                self.assertTrue(all(not n.startswith(('/', '../')) for n in archive.getnames()))

    def test_immutable_native_binaries(self):
        lock = json.loads((ROOT / 'packaging/vendor-lock.json').read_text('utf-8'))
        for name, sha in lock.items():
            self.assertEqual(hashlib.sha256((ROOT / 'src' / name).read_bytes()).hexdigest(), sha)


if __name__ == '__main__':
    unittest.main()
