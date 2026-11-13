#!/bin/sh
# Bounded HTTP probes shared by status and Web latency fallback.
# Output is state|milliseconds|http_code; never emit raw curl errors or URLs.

fss_probe_legacy_kernel() {
	case "$(uname -r)" in 2.*) return 0 ;; *) return 1 ;; esac
}

fss_probe_curl() {
	local candidate
	for candidate in /koolshare/bin/curl-fancyss /usr/bin/curl /usr/sbin/curl curl; do
		# Some 386 firmware builds omit the ash `command` builtin.
		case "${candidate}" in
		/*) [ -x "${candidate}" ] || continue ;;
		*) candidate="$(which "${candidate}" 2>/dev/null)"; [ -x "${candidate}" ] || continue ;;
		esac
		"${candidate}" --version >/dev/null 2>&1 || continue
		printf '%s' "${candidate}"
		return 0
	done
	return 1
}

fss_probe_wait_port() {
	local port="$1" attempt=0
	while [ "${attempt}" -lt 50 ]; do
		netstat -nlt 2>/dev/null | awk -v port="${port}" \
			'$4 ~ (":" port "$") {found=1} END {exit !found}' && return 0
		usleep 100000 2>/dev/null || sleep 1
		attempt=$((attempt + 1))
	done
	return 1
}

fss_http_probe() {
	local url="$1" proxy="$2" family="${3:-4}" limit="${4:-6}" connect_limit="${5:-3}"
	local curl_bin result rc code seconds state ms
	case "${url}" in
	http://?*|https://?*) ;;
	*) printf 'invalid_url|0|000\n'; return 0 ;;
	esac
	curl_bin="$(fss_probe_curl)" || { printf 'unavailable|0|000\n'; return 0; }
	case "${family}" in 6) set -- -6 ;; any) set -- ;; *) set -- -4 ;; esac
	if [ -n "${proxy}" ]; then
		# Remote DNS for ordinary Web tests. Explicit IPv4/IPv6 tests resolve
		# locally so the selected address family can actually be enforced.
		if [ "${family}" = "any" ]; then
			set -- "$@" --noproxy "" --socks5-hostname "${proxy}"
		else
			set -- "$@" --noproxy "" --socks5 "${proxy}"
		fi
	else
		set -- "$@" --noproxy '*' --proxy ''
	fi
	result="$("${curl_bin}" "$@" -sS -L --max-redirs 3 \
		--connect-timeout "${connect_limit}" --max-time "${limit}" \
		--proto '=http,https' --proto-redir '=http,https' \
		-o /dev/null -w '%{http_code}|%{time_total}' -- "${url}" 2>/dev/null)"
	rc=$?
	code="${result%%|*}"
	seconds="${result##*|}"
	case "${code}" in [0-9][0-9][0-9]) ;; *) code=000 ;; esac
	ms="$(printf '%s' "${seconds}" | awk '/^[0-9]+([.][0-9]+)?$/ {printf "%.0f", int($1 * 1000 + 0.5)}')"
	[ -n "${ms}" ] || ms=0
	case "${rc}" in
	0) case "${code}" in 2??) state=ok ;; *) state=http ;; esac ;;
	5|6) state=dns ;;
	7) state=connect ;;
	28) state=timeout ;;
	35|51|58|59|60|77|80|83|90|91) state=tls ;;
	97) state=proxy ;;
	2|4|126|127) state=unavailable ;;
	*) state=failed ;;
	esac
	printf '%s|%s|%s\n' "${state}" "${ms}" "${code}"
}

fss_probe_reason() {
	case "$1" in
	dns) printf 'DNS解析失败' ;;
	connect) printf '连接失败（检查代理端口/网络）' ;;
	timeout) printf '检测超时' ;;
	tls) printf 'TLS校验失败（检查时间/证书）' ;;
	proxy) printf 'SOCKS代理握手失败' ;;
	http) printf 'HTTP %s' "$2" ;;
	unavailable) printf 'curl不可用' ;;
	invalid_url) printf '检测地址无效' ;;
	*) printf '请求失败' ;;
	esac
}
