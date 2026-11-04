#!/bin/sh
# Single-dispatch, transactional updater for this maintenance project's feed.
REQUEST_ID="$1"
source /koolshare/scripts/base.sh
# Legacy firmware defines echo_date as an alias; remove it before our function.
unalias echo_date 2>/dev/null || true
source /koolshare/scripts/ss_probe_lib.sh
eval $(dbus export ss_basic_)
RULE_DIR=/koolshare/ss/rules
RULE_FILE=${RULE_DIR}/rules.json.js
CONFIG=/koolshare/ss/maintenance.json
JQ=/koolshare/bin/jq
LOG=/tmp/upload/ss_log.txt
LOCK=/tmp/fancyss_rule_update.lock
WORK=/tmp/fancyss_rule_update.$$
OWN_LOCK=0
TRANSACTION=0
RESTART=0
FORCE=0
echo_date() { echo "【$(TZ=UTC-8 date '+%Y%m%d %H:%M:%S')】: $*"; }
cleanup() {
	if [ "${TRANSACTION}" = 1 ]; then
		for name in gfwlist.gz chnlist.gz chnroute.txt rules.json.js; do
			[ ! -f "${WORK}/backup/${name}" ] || cp -f "${WORK}/backup/${name}" "${RULE_DIR}/${name}"
		done
	fi
	for name in gfwlist.gz chnlist.gz chnroute.txt rules.json.js; do rm -f "${RULE_DIR}/${name}.new.$$"; done
	[ ! -d "${WORK}" ] || rm -r "${WORK}"
	if [ "${OWN_LOCK}" = 1 ]; then rm -f "${LOCK}/pid"; rmdir "${LOCK}" 2>/dev/null; fi
}
fetch() {
	local curl_bin="$(fss_probe_curl)"
	[ -n "${curl_bin}" ] || return 1
	"${curl_bin}" -fSLsS --connect-timeout 5 --max-time 35 --retry 1 --proto '=https' --proto-redir '=https' -o "$2" -- "$1" && return 0
	"${curl_bin}" -fSLsS --connect-timeout 5 --max-time 35 --retry 1 --socks5-hostname 127.0.0.1:23456 --noproxy '' --proto '=https' --proto-redir '=https' -o "$2" -- "$1"
}
validate_rule() {
	case "$1" in
	gfwlist|chnlist)
		gzip -t "$2" 2>/dev/null || return 1
		gzip -dc "$2" | awk '/^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/ {n++;next} {bad=1} END {exit (bad || n<1000 || n>1000000)}'
		;;
	chnroute)
		awk -F '[./]' 'NF!=5 {bad=1;next} {for(i=1;i<=5;i++) if($i!~/^[0-9]+$/)bad=1; for(i=1;i<=4;i++)if($i>255)bad=1; if($5<1||$5>32)bad=1;n++} END {exit(bad||n<1000||n>1000000)}' "$2"
		;;
	*) return 1 ;;
	esac
}
change_cru() {
	cru d ssupdate >/dev/null 2>&1
	if [ "${ss_basic_rule_update}" = 1 ]; then
		case "${ss_basic_rule_update_time}" in ''|*[!0-9]*) echo_date '定时更新小时无效'; return 1 ;; esac
		[ "${ss_basic_rule_update_time}" -le 23 ] || return 1
		cru a ssupdate "0 ${ss_basic_rule_update_time} * * * /bin/sh /koolshare/scripts/ss_rule_update.sh update"
		echo_date "已设置每天 ${ss_basic_rule_update_time}:00 检查维护规则源"
	else echo_date '规则定时更新已关闭'; fi
}
start_update() {
	local base key enabled name expected actual found=0
	base="$("${JQ}" -r '.rules_base_url // empty' "${CONFIG}" 2>/dev/null)"
	case "${base}" in https://?*) ;; *) echo_date '尚未配置自己的 HTTPS 规则发布地址。请在维护项目审核规则后，通过离线包更新。'; return 1 ;; esac
	mkdir -p "${WORK}/backup" || return 1
	fetch "${base%/}/rules.json.js" "${WORK}/online.json" || { echo_date '规则清单下载失败，保留现有规则'; return 1; }
	"${JQ}" -e 'type=="object"' "${WORK}/online.json" >/dev/null 2>&1 || return 1
	cp "${RULE_FILE}" "${WORK}/next.json" || return 1
	for key in gfwlist chnlist chnroute; do
		case "${key}" in
		gfwlist) enabled="${ss_basic_gfwlist_update}"; name=gfwlist.gz ;;
		chnlist) enabled="${ss_basic_chnlist_update}"; name=chnlist.gz ;;
		chnroute) enabled="${ss_basic_chnroute_update}"; name=chnroute.txt ;;
		esac
		[ "${enabled}" = 1 ] || continue
		expected="$("${JQ}" -er --arg key "${key}" --arg name "${name}" '.[$key]|select(.name==$name)|.sha256|select(test("^[a-f0-9]{64}$"))' "${WORK}/online.json")" || return 1
		actual="$(sha256sum "${RULE_DIR}/${name}" | awk '{print $1}')"
		if [ "${actual}" = "${expected}" ] && [ "${FORCE}" != 1 ]; then echo_date "${key} 内容已是最新"; continue; fi
		echo_date "下载并校验 ${key}…"
		fetch "${base%/}/${name}" "${WORK}/${name}" || return 1
		actual="$(sha256sum "${WORK}/${name}" | awk '{print $1}')"
		[ "${actual}" = "${expected}" ] || { echo_date "${key} SHA-256 校验失败"; return 1; }
		validate_rule "${key}" "${WORK}/${name}" || { echo_date "${key} 格式或数量异常"; return 1; }
		"${JQ}" --arg key "${key}" --slurpfile online "${WORK}/online.json" '.[$key]=$online[0][$key]' "${WORK}/next.json" > "${WORK}/next.tmp" || return 1
		mv "${WORK}/next.tmp" "${WORK}/next.json" || return 1
		found=1
	done
	[ "${found}" = 1 ] || { echo_date '无需替换规则'; return 0; }
	for name in gfwlist.gz chnlist.gz chnroute.txt rules.json.js; do cp "${RULE_DIR}/${name}" "${WORK}/backup/${name}" || return 1; done
	TRANSACTION=1
	for name in gfwlist.gz chnlist.gz chnroute.txt; do
		[ -f "${WORK}/${name}" ] || continue
		cp "${WORK}/${name}" "${RULE_DIR}/${name}.new.$$" && mv -f "${RULE_DIR}/${name}.new.$$" "${RULE_DIR}/${name}" || return 1
	done
	cp "${WORK}/next.json" "${RULE_DIR}/rules.json.js.new.$$" && mv -f "${RULE_DIR}/rules.json.js.new.$$" "${RULE_FILE}" || return 1
	TRANSACTION=0
	RESTART=1
	echo_date '规则校验和替换完成'
	for key in gfwlist chnlist chnroute; do
		nvram set "update_${key}=$(${JQ} -r --arg key "${key}" '.[$key].date' "${RULE_FILE}")"
		nvram set "${key}_numbers=$(${JQ} -r --arg key "${key}" '.[$key].count' "${RULE_FILE}")"
	done
	nvram set "chnroute_ips=$(${JQ} -r '.chnroute.count_ip' "${RULE_FILE}")"
}
ACTION_NAME="$1"
HTTP=0
case "$1" in
''|update|force) ACTION_NAME=update; [ "$1" != force ] || FORCE=1 ;;
*) case "$2" in 1) ACTION_NAME=schedule ;; 2) ACTION_NAME=update ;; *) exit 2 ;; esac; HTTP=1 ;;
esac
if ! mkdir "${LOCK}" 2>/dev/null; then
	[ "${HTTP}" = 0 ] || http_response busy >/dev/null 2>&1
	echo '规则更新正在运行，请等待完成'
	exit 1
fi
OWN_LOCK=1
echo "$$" > "${LOCK}/pid"
trap cleanup EXIT
trap 'exit 1' INT TERM
mkdir -p /tmp/upload
: > "${LOG}"
echo_date "开始规则操作：${ACTION_NAME}" >> "${LOG}"
[ "${HTTP}" = 0 ] || http_response "${REQUEST_ID}" >/dev/null 2>&1
{
	if [ "${ACTION_NAME}" = schedule ]; then change_cru; result=$?
	else
		[ "${HTTP}" = 0 ] || change_cru
		start_update; result=$?
		if [ "${result}" = 0 ] && [ "${RESTART}" = 1 ] && [ "$(dbus get ss_basic_enable)" = 1 ]; then
			echo_date '重启插件以应用规则…'
			sh /koolshare/ss/ssconfig.sh restart; result=$?
		fi
	fi
	if [ "${result}" = 0 ]; then echo_date '规则操作完成'; else echo_date '规则操作失败，未完成的替换将回滚'; fi
	echo XU6J03M6
} >> "${LOG}" 2>&1
[ "${HTTP}" = 1 ] || cat "${LOG}"
exit "${result}"
