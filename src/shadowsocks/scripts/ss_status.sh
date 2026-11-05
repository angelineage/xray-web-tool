#!/bin/sh

STATUS_HTTP_ID="$1"

source /koolshare/scripts/ss_base.sh
source /koolshare/scripts/ss_probe_lib.sh

if [ -n "${STATUS_HTTP_ID}" ];then
	ACTION="${STATUS_HTTP_ID}"
	ID="${STATUS_HTTP_ID}"
fi

STATUS_FRONT_CACHE=/tmp/upload/ss_status_front.txt
STATUS_BACK_CACHE=/tmp/upload/ss_status.txt
STATUS_WS_CACHE_FILE=/tmp/upload/ss_status_ws.txt
STATUS_WS_LOCK_DIR=/tmp/fancyss_status_ws.lock
STATUS_WS_LOCK_PID_FILE=${STATUS_WS_LOCK_DIR}/pid
STATUS_HTTP_LOCK_DIR=/tmp/fancyss_status_http.lock
STATUS_HTTP_LOCK_PID_FILE=${STATUS_HTTP_LOCK_DIR}/pid
STATUS_WS_LOCK_MAX_AGE=60
STATUS_HTTP_LOCK_MAX_AGE=20
STATUS_CACHE_MAX_AGE=120

LOGTIME=$(TZ=UTC-8 date -R "+%Y-%m-%d %H:%M:%S")
HEART_STATUS=$(dbus get ss_heart_beat)
CHN_TEST_SITE="${ss_basic_curl}"
FRN_TEST_SITE="${ss_basic_furl}"
PROXY_IPV6=$(dbus get ss_basic_proxy_ipv6)
[ -n "${CHN_TEST_SITE}" ] || CHN_TEST_SITE="$(get_fancyss_default_curl)"
[ -n "${FRN_TEST_SITE}" ] || FRN_TEST_SITE="$(get_fancyss_default_furl)"


status_socks5_ready() {
	netstat -nlp 2>/dev/null \
		| grep -w "23456" \
		| grep -Eq "xray|v2ray|naive|tuic|anytls-zig|rss-local"
}

set_waiting_status(){
	if [ "${PROXY_IPV6}" = "1" ];then
		log1="国外IPv4 【${LOGTIME}】：等待..."
		log3="国外IPv6 【${LOGTIME}】：等待..."
	else
		log1="国外链接 【${LOGTIME}】：等待..."
		log3=""
	fi
	log2="国内连接 【${LOGTIME}】：等待..."
}

get_status_payload(){
	if [ "${PROXY_IPV6}" = "1" ];then
		printf '%s' "${log1}@@${log3}@@${log2}"
	else
		printf '%s' "${log1}@@${log2}"
	fi
}


status_payload_epoch(){
	local payload="$1"
	local stamp=""
	stamp="$(printf '%s' "${payload}" | sed -n 's/.*【\([0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]\)】.*/\1/p' | sed -n '1p')"
	[ -n "${stamp}" ] || return 1
	date -d "${stamp}" +%s 2>/dev/null
}

status_payload_is_fresh(){
	local payload="$1"
	local now epoch age
	now="$(date +%s 2>/dev/null)" || return 0
	epoch="$(status_payload_epoch "${payload}")" || return 0
	[ -n "${epoch}" ] || return 0
	age=$((now - epoch))
	[ "${age}" -lt 0 ] && age=$((0 - age))
	[ "${age}" -le "${STATUS_CACHE_MAX_AGE}" ]
}

status_payload_matches_mode(){
	local payload="$1"
	[ -n "${payload}" ] || return 1
	case "${payload}" in
	*等待*|*Waiting*)
		return 1
		;;
	esac
	status_payload_is_fresh "${payload}" || return 1
	if [ "${PROXY_IPV6}" = "1" ];then
		case "${payload}" in
		*国外IPv4*@@*国外IPv6*@@*国内*)
			return 0
			;;
		esac
		return 1
	fi
	case "${payload}" in
	*国外IPv4*|*国外IPv6*)
		return 1
		;;
	*@@*)
		return 0
		;;
	esac
	return 1
}

read_front_cache(){
	local payload=""
	[ -s "${STATUS_FRONT_CACHE}" ] || return 1
	payload="$(cat "${STATUS_FRONT_CACHE}" 2>/dev/null)" || return 1
	status_payload_matches_mode "${payload}" || return 1
	printf '%s' "${payload}"
}

read_ws_cache(){
	local payload=""
	[ -s "${STATUS_WS_CACHE_FILE}" ] || return 1
	payload="$(cat "${STATUS_WS_CACHE_FILE}" 2>/dev/null)" || return 1
	status_payload_matches_mode "${payload}" || return 1
	printf '%s' "${payload}"
}

wait_ws_cache(){
	local waited=0
	local payload=""
	while [ "${waited}" -lt 30 ]
	do
		if payload="$(read_ws_cache)"; then
			printf '%s' "${payload}"
			return 0
		fi
		usleep 200000 2>/dev/null || sleep 1
		waited=$((waited + 1))
	done
	return 1
}

write_ws_cache(){
	[ -n "$1" ] || return 1
	printf '%s\n' "$1" > "${STATUS_WS_CACHE_FILE}" 2>/dev/null
}

emit_status_payload(){
	printf '%s\n' "$1"
}

acquire_status_ws_lock(){
	local pid=""
	local lock_mtime=""
	local now=""
	if mkdir "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1;then
		echo "$$" > "${STATUS_WS_LOCK_PID_FILE}" 2>/dev/null
		return 0
	fi
	if [ -f "${STATUS_WS_LOCK_PID_FILE}" ];then
		pid="$(cat "${STATUS_WS_LOCK_PID_FILE}" 2>/dev/null)"
		if [ -z "${pid}" ] || ! kill -0 "${pid}" >/dev/null 2>&1;then
			rm -rf "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1
			if mkdir "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1;then
				echo "$$" > "${STATUS_WS_LOCK_PID_FILE}" 2>/dev/null
				return 0
			fi
		else
			lock_mtime="$(date -r "${STATUS_WS_LOCK_PID_FILE}" +%s 2>/dev/null)"
			now="$(date +%s 2>/dev/null)"
			if [ -n "${lock_mtime}" ] && [ -n "${now}" ] && [ $((now - lock_mtime)) -gt "${STATUS_WS_LOCK_MAX_AGE}" ];then
				rm -rf "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1
				if mkdir "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1;then
					echo "$$" > "${STATUS_WS_LOCK_PID_FILE}" 2>/dev/null
					return 0
				fi
			fi
		fi
	else
		rm -rf "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1
		if mkdir "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1;then
			echo "$$" > "${STATUS_WS_LOCK_PID_FILE}" 2>/dev/null
			return 0
		fi
	fi
	return 1
}

release_status_ws_lock(){
	rm -f "${STATUS_WS_LOCK_PID_FILE}" >/dev/null 2>&1
	rmdir "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1
}

acquire_status_http_lock(){
	local pid=""
	local lock_mtime=""
	local now=""
	if mkdir "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1;then
		echo "$$" > "${STATUS_HTTP_LOCK_PID_FILE}" 2>/dev/null
		return 0
	fi
	if [ -f "${STATUS_HTTP_LOCK_PID_FILE}" ];then
		pid="$(cat "${STATUS_HTTP_LOCK_PID_FILE}" 2>/dev/null)"
		if [ -z "${pid}" ] || ! kill -0 "${pid}" >/dev/null 2>&1;then
			rm -rf "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1
			if mkdir "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1;then
				echo "$$" > "${STATUS_HTTP_LOCK_PID_FILE}" 2>/dev/null
				return 0
			fi
		else
			lock_mtime="$(date -r "${STATUS_HTTP_LOCK_PID_FILE}" +%s 2>/dev/null)"
			now="$(date +%s 2>/dev/null)"
			if [ -n "${lock_mtime}" ] && [ -n "${now}" ] && [ $((now - lock_mtime)) -gt "${STATUS_HTTP_LOCK_MAX_AGE}" ];then
				rm -rf "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1
				if mkdir "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1;then
					echo "$$" > "${STATUS_HTTP_LOCK_PID_FILE}" 2>/dev/null
					return 0
				fi
			fi
		fi
	else
		rm -rf "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1
		if mkdir "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1;then
			echo "$$" > "${STATUS_HTTP_LOCK_PID_FILE}" 2>/dev/null
			return 0
		fi
	fi
	return 1
}

release_status_http_lock(){
	rm -f "${STATUS_HTTP_LOCK_PID_FILE}" >/dev/null 2>&1
	rmdir "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1
}








prepare(){
	local fancyss_enable="$(dbus get ss_basic_enable)"
	if [ "${fancyss_enable}" != "1" ];then
		set_waiting_status
		return 1
	fi
	if [ "$(dbus get ss_basic_wait)" = "1" ];then
		set_waiting_status
		return 1
	fi
	if ps | grep "ssconfig.sh" | grep -v grep >/dev/null 2>&1;then
		set_waiting_status
		return 1
	fi
	return 0
}

resolve_payload(){
    sh /koolshare/scripts/ss_status_curl.sh
}

resolve_payload_once_only(){
    sh /koolshare/scripts/ss_status_curl.sh
}

if [ -z "$1" ] && [ -z "$2" ];then
	if ! prepare >/dev/null 2>&1; then
		get_status_payload
		exit
	fi
	if ! acquire_status_ws_lock; then
		if payload="$(read_ws_cache)"; then
			emit_status_payload "${payload}"
		elif payload="$(wait_ws_cache)"; then
			emit_status_payload "${payload}"
		else
			set_waiting_status
			emit_status_payload "$(get_status_payload)"
		fi
		exit 0
	fi
	trap 'release_status_ws_lock' EXIT INT TERM
	if [ "${ss_failover_enable}" = "1" ];then
		payload="$(resolve_payload)"
	else
		payload="$(resolve_payload_once_only)"
	fi
	write_ws_cache "${payload}" >/dev/null 2>&1
	emit_status_payload "${payload}"
	exit
fi

case "$1" in
ws)
		if ! prepare >/dev/null 2>&1; then
			set_waiting_status
			emit_status_payload "$(get_status_payload)"
			exit 0
		fi
		if ! acquire_status_ws_lock; then
			if payload="$(read_ws_cache)"; then
				emit_status_payload "${payload}"
			elif payload="$(wait_ws_cache)"; then
				emit_status_payload "${payload}"
			else
				set_waiting_status
				emit_status_payload "$(get_status_payload)"
			fi
			exit 0
		fi
		trap 'release_status_ws_lock' EXIT INT TERM
		if [ "${ss_failover_enable}" = "1" ];then
			payload="$(resolve_payload)"
		else
			payload="$(resolve_payload_once_only)"
		fi
		write_ws_cache "${payload}" >/dev/null 2>&1
		emit_status_payload "${payload}"
		;;
	*)
		if ! prepare >/dev/null 2>&1; then
			set_waiting_status
			payload="$(get_status_payload)"
		else
			if [ "${ss_failover_enable}" = "1" ];then
				payload="$(resolve_payload)"
			else
				if ! acquire_status_http_lock; then
					payload="$(read_front_cache)" || payload="$(read_ws_cache)" || {
						set_waiting_status
						payload="$(get_status_payload)"
					}
				else
					trap 'release_status_http_lock' EXIT INT TERM
					payload="$(resolve_payload_once_only)"
				fi
			fi
		fi
		if [ "${ss_failover_enable}" = "1" ];then
			printf '%s@@%s\n' "${payload}" "${HEART_STATUS}" > "${STATUS_BACK_CACHE}"
		else
			# Legacy http_response wraps raw bytes in JSON quotes. Escape HTML attributes.
			http_response "$(printf '%s' "${payload}" | sed 's/\\/\\\\/g; s/"/\\"/g')" >/dev/null 2>&1
		fi
		;;
esac
