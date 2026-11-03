"""Refresh the existing three-list policy on a computer; router consumes built files.

Downloads are cached with SHA-256 provenance. --apply is explicit; by default
only a preview is generated. Sources follow upstream's merged-list policy.
"""
import argparse
import base64
import datetime
import gzip
import hashlib
import io
import ipaddress
import json
import pathlib
import re
import tempfile
import urllib.request
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
RULES = ROOT / 'src/shadowsocks/ss/rules'
SOURCES = {
    'gfw_abp': 'https://raw.githubusercontent.com/Loukky/gfwlist-by-loukky/master/gfwlist.txt',
    'gfw_extra': 'https://raw.githubusercontent.com/pexcn/daily/gh-pages/gfwlist/gfwlist.txt',
    'china': 'https://raw.githubusercontent.com/felixonmars/dnsmasq-china-list/master/accelerated-domains.china.conf',
    'apple': 'https://raw.githubusercontent.com/felixonmars/dnsmasq-china-list/master/apple.china.conf',
    'google': 'https://raw.githubusercontent.com/felixonmars/dnsmasq-china-list/master/google.china.conf',
    'misaka': 'https://raw.githubusercontent.com/misakaio/chnroutes2/master/chnroutes.txt',
    'apnic': 'https://ftp.apnic.net/stats/apnic/delegated-apnic-latest',
    '17mon': 'https://raw.githubusercontent.com/17mon/china_ip_list/master/china_ip_list.txt',
    'ipip': 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/ipip_country/ipip_country_cn.netset',
    'maxmind': 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/geolite2_country/country_cn.netset',
}


def domain(value):
    value = value.strip().strip('.').lower()
    try:
        value = value.encode('idna').decode('ascii')
    except UnicodeError:
        return None
    if len(value) > 253 or '.' not in value:
        return None
    if not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?', p) for p in value.split('.')):
        return None
    try:
        ipaddress.ip_address(value)
        return None
    except ValueError:
        return value


def parse_abp(raw):
    text = raw.decode('utf-8-sig')
    if not text.lstrip().startswith(('[AutoProxy', '!')):
        text = base64.b64decode(b''.join(raw.split()), validate=True).decode('utf-8-sig')
    if '[AutoProxy' not in text:
        raise ValueError('Missing AutoProxy header (possibly an error page)')
    values = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(('!', '[', '@@', '/')) or '$' in line:
            continue
        line = line.lstrip('|').removeprefix('*.')
        if '://' in line:
            candidate = urlsplit(line).hostname or ''
        else:
            candidate = re.split(r'[/^*?#]', line, 1)[0]
        candidate = domain(candidate)
        if candidate:
            values.add(candidate)
    return values


def parse_domains(raw, dnsmasq=False):
    values = set()
    text = raw.decode('utf-8-sig')
    if '<html' in text[:1000].lower() or '<!doctype' in text[:1000].lower():
        raise ValueError('HTML returned instead of rules')
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(('#', '!')):
            continue
        if dnsmasq:
            match = re.fullmatch(r'server=/\.?([^/]+)/[^\s]+', line)
            if not match:
                raise ValueError('Invalid dnsmasq rule: ' + line[:80])
            line = match.group(1)
        parsed = line.lower() if dnsmasq and '.' not in line and domain(line + '.invalid') else domain(line)
        if not parsed:
            raise ValueError('Invalid domain rule: ' + line[:80])
        values.add(parsed)
    return values


def parse_routes(raw):
    values = []
    for line in raw.decode('ascii').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        network = ipaddress.IPv4Network(line, strict=False)
        if not network.is_global:
            raise ValueError('Non-global route refused: ' + line)
        values.append(network)
    return values


def parse_apnic(raw):
    values = []
    for line in raw.decode('ascii').splitlines():
        parts = line.split('|')
        if len(parts) >= 7 and parts[1:3] == ['CN', 'ipv4'] and parts[6] in ('allocated', 'assigned'):
            start = ipaddress.IPv4Address(parts[3])
            count = int(parts[4])
            if count <= 0:
                raise ValueError('Invalid APNIC allocation count')
            end = ipaddress.IPv4Address(int(start) + count - 1)
            values.extend(ipaddress.summarize_address_range(start, end))
    return values


def guard(name, count, previous):
    minimum = {'gfwlist': 1000, 'chnlist': 10000, 'chnroute': 1000}[name]
    if not minimum <= count <= 1000000:
        raise ValueError(f'{name}: abnormal count {count}')
    if previous and not previous * 0.5 <= count <= previous * 2:
        raise ValueError(f'{name}: change exceeds 50% decrease / 100% increase; review required')


def refresh(apply=False, offline=False):
    cache = ROOT / '.cache/rule-sources'
    cache.mkdir(parents=True, exist_ok=True)
    inputs, provenance = {}, {}
    now = datetime.datetime.now(datetime.timezone.utc)
    for name, url in SOURCES.items():
        file = cache / (name + '.txt')
        if not offline:
            request = urllib.request.Request(url, headers={'User-Agent': 'fancyss-ac3100-rule-builder/0.1'})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read(16 * 1024 * 1024 + 1)
            if not 100 <= len(data) <= 16 * 1024 * 1024:
                raise ValueError('Invalid source size: ' + name)
            temporary = file.with_suffix('.tmp')
            temporary.write_bytes(data)
            temporary.replace(file)
        inputs[name] = file.read_bytes()
        provenance[name] = {'url': url, 'sha256': hashlib.sha256(inputs[name]).hexdigest(), 'bytes': len(inputs[name])}
    gfw = parse_abp(inputs['gfw_abp']) | parse_domains(inputs['gfw_extra'])
    # Preserve the inherited upstream exclusions; changes require explicit review.
    gfw = {d for d in gfw if not any(s in d for s in ('hasi.', 'v2ex', 'apple.com', 'm-team', 'windowsupdate'))}
    china = set().union(*(parse_domains(inputs[n], True) for n in ('china', 'apple', 'google')))
    routes = list(ipaddress.collapse_addresses(parse_apnic(inputs['apnic']) + sum((parse_routes(inputs[n]) for n in ('misaka', '17mon', 'ipip', 'maxmind')), [])))
    values = {'gfwlist': sorted(gfw), 'chnlist': sorted(china), 'chnroute': [str(n) for n in routes]}
    metadata = json.loads((RULES / 'rules.json.js').read_text('utf-8'))
    generated = {}
    for key, rows in values.items():
        guard(key, len(rows), int(metadata[key]['count']))
        plain = ('\n'.join(rows) + '\n').encode('ascii')
        if key != 'chnroute':
            buffer = io.BytesIO()
            with gzip.GzipFile(fileobj=buffer, filename='', mode='wb', compresslevel=9, mtime=0) as output:
                output.write(plain)
            data = buffer.getvalue()
        else:
            data = plain
        generated[metadata[key]['name']] = data
        old = (RULES / metadata[key]['name']).read_bytes()
        metadata[key].update(md5=hashlib.md5(data).hexdigest(), sha256=hashlib.sha256(data).hexdigest(), count=str(len(rows)))
        if old != data:
            metadata[key]['date'] = now.astimezone(datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
        if key == 'chnroute':
            metadata[key]['count_ip'] = str(sum(n.num_addresses for n in routes))
    report = {'fetched_at_utc': now.isoformat(), 'policy': 'upstream-merged-v1', 'sources': provenance,
              'counts': {k: len(v) for k, v in values.items()}, 'applied': apply}
    (ROOT / '.cache/rule-update-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    if apply:
        # All downloads and validation finish first. Router updates use their own
        # transaction/rollback; this host update is reviewed as a Git commit.
        for filename, data in generated.items():
            (RULES / filename).write_bytes(data)
        (RULES / 'rules.json.js').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
        (ROOT / 'rules-provenance.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(report['counts']))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--offline', action='store_true', help='Reuse exact cached inputs for verification')
    options = parser.parse_args()
    refresh(options.apply, options.offline)
