#!/bin/sh
# Compatibility backend for kernels without the timers required by status-tool.
source /koolshare/scripts/ss_base.sh
source /koolshare/scripts/ss_probe_lib.sh

status_curl_line() {
	local file="$1" label="$2" now="$3" state ms code reason
	IFS='|' read -r state ms code < "${file}"
	if [ "${state}" = "ok" ]; then
		printf '%s 【%s】 ✓&nbsp;&nbsp;%s ms' "${label}" "${now}" "${ms}"
	else
		reason="$(fss_probe_reason "${state}" "${code}")"
		printf '%s 【%s】 <font color="#FF0000">X %s</font>' "${label}" "${now}" "${reason}"
	fi
}

status_curl_snapshot() (
	local work="/tmp/fancyss_status_curl.$$" now chn frn ipv6 family
	local child_c child_f child_v payload state ms code first=1 probe
	mkdir -p "${work}" /tmp/upload || exit 1
	# This firmware unwinds function-local variables before running EXIT traps.
	FSS_STATUS_CURL_WORK="${work}"
	trap 'rm -rf "${FSS_STATUS_CURL_WORK}"' EXIT
	trap 'kill ${child_c} ${child_f} ${child_v} 2>/dev/null; exit 1' INT TERM
	chn="$(dbus get ss_basic_curl)"; frn="$(dbus get ss_basic_furl)"
	[ -n "${chn}" ] || chn="$(get_fancyss_default_curl)"
	[ -n "${frn}" ] || frn="$(get_fancyss_default_furl)"
	ipv6="$(dbus get ss_basic_proxy_ipv6)"
	family=any; [ "${ipv6}" = "1" ] && family=4
	fss_http_probe "${chn}" '' 4 12 6 > "${work}/china" & child_c=$!
	fss_http_probe "${frn}" 127.0.0.1:23456 "${family}" 12 6 > "${work}/foreign4" & child_f=$!
	if [ "${ipv6}" = "1" ]; then
		fss_http_probe "${frn}" 127.0.0.1:23456 6 12 6 > "${work}/foreign6" & child_v=$!
	fi
	wait "${child_c}"; wait "${child_f}"
	[ -z "${child_v}" ] || wait "${child_v}"
	now="$(TZ=UTC-8 date '+%Y-%m-%d %H:%M:%S')"
	if [ "${ipv6}" = "1" ]; then
		payload="$(status_curl_line "${work}/foreign4" 国外IPv4 "${now}")@@$(status_curl_line "${work}/foreign6" 国外IPv6 "${now}")"
	else
		payload="$(status_curl_line "${work}/foreign4" 国外连接 "${now}")"
	fi
	payload="${payload}@@$(status_curl_line "${work}/china" 国内连接 "${now}")"
	# Keep the JSON contract used by fault monitoring, including actual HTTP codes.
	{
		printf '{"updated_at_ms":%s000,"backend":"curl-compat","results":[' "$(date +%s)"
		for probe in china foreign4 foreign6; do
			[ -s "${work}/${probe}" ] || continue
			IFS='|' read -r state ms code < "${work}/${probe}"
			[ "${first}" = 1 ] || printf ','; first=0
			printf '{"name":"%s","ok":%s,"status_code":%s,"elapsed_ms":%s,"error":"%s"}' \
				"${probe}" "$([ "${state}" = ok ] && echo true || echo false)" \
				"$(expr "${code}" + 0)" "${ms}" "$([ "${state}" = ok ] || printf '%s' "${state}")"
		done
		printf ']}\n'
	} > "${work}/state.json"
	printf '%s\n' "${payload}" > "${work}/front.txt"
	mv -f "${work}/state.json" /tmp/upload/ss_status_daemon.json
	mv -f "${work}/front.txt" /tmp/upload/ss_status_front.txt
	printf '%s\n' "${payload}"
)

if [ "$1" = daemon ]; then
	while [ "$(dbus get ss_basic_enable)" = 1 ] && [ "$(dbus get ss_failover_enable)" = 1 ]; do
		if [ "$(dbus get ss_basic_wait)" != 1 ] && ! pidof ssconfig.sh >/dev/null 2>&1; then
			status_curl_snapshot >/dev/null
		fi
		case "$(dbus get ss_basic_interval)" in
		1) sleep 1 ;; 3) sleep 9 ;; 4) sleep 21 ;; 5) sleep 45 ;; *) sleep 3 ;;
		esac
	done
else
	status_curl_snapshot
fi
