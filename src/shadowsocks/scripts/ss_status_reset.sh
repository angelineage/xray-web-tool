#!/bin/sh

# fancyss script for asuswrt/merlin based router with software center

source /koolshare/scripts/base.sh
source /koolshare/scripts/ss_probe_lib.sh
eval $(dbus export ss_failover)
alias echo_date='echo 【$(TZ=UTC-8 date -R +%Y%m%d\ %X)】:'

LOGFILE_F=/tmp/upload/ssf_status.txt
LOGFILE_C=/tmp/upload/ssc_status.txt
LOGSTREAM_F=/tmp/upload/ssf_status.stream
LOGSTREAM_C=/tmp/upload/ssc_status.stream
LOGFILE=/tmp/upload/ss_log.txt
STATUS_TOOL_BIN="/koolshare/bin/status-tool"
STATUS_DAEMON_PIDFILE="/var/run/status-tool.pid"
STATUS_SERVE_PIDFILE="/var/run/status-tool-serve.pid"
STATUS_DAEMON_STATE="/tmp/upload/ss_status_daemon.json"
STATUS_DAEMON_LEGACY="/tmp/upload/ss_status_front.txt"
STATUS_SERVE_SOCKET="/tmp/status-tool.sock"
STATUS_SERVE_ARGS_FILE="/tmp/status-tool-serve.args"
STATUS_WS_LOCK_DIR="/tmp/fancyss_status_ws.lock"
STATUS_HTTP_LOCK_DIR="/tmp/fancyss_status_http.lock"

status_tool_tz() {
	local tz=""
	tz="$(nvram get time_zone 2>/dev/null)"
	[ -n "${tz}" ] || tz="$(nvram get time_zone_x 2>/dev/null)"
	[ -n "${tz}" ] || tz="CST-8"
	printf '%s' "${tz}"
}

pick_status_interval_ms() {
	case "$(dbus get ss_basic_interval)" in
	1) echo 1000 ;;
	2) echo 3500 ;;
	3) echo 9500 ;;
	4) echo 21500 ;;
	5) echo 45500 ;;
	*) echo 3500 ;;
	esac
}

pick_status_urls() {
	local chn="$(dbus get ss_basic_curl)"
	local frn="$(dbus get ss_basic_furl)"
	[ -n "${chn}" ] || chn="http://connectivitycheck.platform.hicloud.com/generate_204"
	[ -n "${frn}" ] || frn="http://www.google.com/generate_204"
	printf '%s\n%s\n' "${chn}" "${frn}"
}

write_waiting_cache() {
	local now="$(TZ=UTC-8 date -R "+%Y-%m-%d %H:%M:%S")"
	local ipv6="$(dbus get ss_basic_proxy_ipv6)"
	mkdir -p /tmp/upload >/dev/null 2>&1
	if [ "${ipv6}" = "1" ];then
		printf '%s' "国外IPv4 【${now}】：等待...@@国外IPv6 【${now}】：等待...@@国内连接 【${now}】：等待..." > "${STATUS_DAEMON_LEGACY}"
	else
		printf '%s' "国外链接 【${now}】：等待...@@国内连接 【${now}】：等待..." > "${STATUS_DAEMON_LEGACY}"
	fi
}

ensure_waiting_cache() {
	[ -s "${STATUS_DAEMON_LEGACY}" ] && return 0
	write_waiting_cache
}


stop_status_runtime() {
	killall statusctl >/dev/null 2>&1
	ps w | grep -F "/tmp/upload/ssf_status.stream" | grep -v grep | awk '{print $1}' | while read -r pid; do
		[ -n "${pid}" ] && kill "${pid}" >/dev/null 2>&1
	done
	ps w | grep -F "/tmp/upload/ssc_status.stream" | grep -v grep | awk '{print $1}' | while read -r pid; do
		[ -n "${pid}" ] && kill "${pid}" >/dev/null 2>&1
	done
	ps w | grep -F "sh /koolshare/scripts/ss_status_ws.sh" | grep -v grep | awk '{print $1}' | while read -r pid; do
		[ -n "${pid}" ] && kill "${pid}" >/dev/null 2>&1
	done
	if [ -f "${STATUS_DAEMON_PIDFILE}" ];then
		start-stop-daemon -K -q -p "${STATUS_DAEMON_PIDFILE}" >/dev/null 2>&1
	fi
	if [ -f "${STATUS_SERVE_PIDFILE}" ];then
		start-stop-daemon -K -q -p "${STATUS_SERVE_PIDFILE}" >/dev/null 2>&1
	fi
	ps w | grep -E '(^| )(/koolshare/bin/status-tool|/tmp/status-tool-serve) (daemon|serve|fancyss)( |$)' | grep -v grep | awk '{print $1}' | while read -r pid; do
		kill "${pid}" >/dev/null 2>&1
	done
	rm -f "${STATUS_DAEMON_PIDFILE}" "${STATUS_SERVE_PIDFILE}" "${STATUS_DAEMON_STATE}" "${STATUS_DAEMON_LEGACY}" "${STATUS_SERVE_SOCKET}" "${STATUS_SERVE_ARGS_FILE}" >/dev/null 2>&1
	rm -rf "${STATUS_WS_LOCK_DIR}" >/dev/null 2>&1
	rm -rf "${STATUS_HTTP_LOCK_DIR}" >/dev/null 2>&1
}

start_status_runtime() {
    sh /koolshare/scripts/ss_status_daemon.sh start
}

stop_status(){
	kill -9 $(pidof ss_status_main.sh) >/dev/null 2>&1
	kill -9 $(pidof ss_status.sh) >/dev/null 2>&1
	ps w | grep -F "sh /koolshare/scripts/ss_status_main.sh" | grep -v grep | awk '{print $1}' | while read -r pid; do
		kill -9 "${pid}" >/dev/null 2>&1
	done
	ps w | grep -F "sh /koolshare/scripts/ss_status.sh" | grep -v grep | awk '{print $1}' | while read -r pid; do
		kill -9 "${pid}" >/dev/null 2>&1
	done
	killall curl-status >/dev/null 2>&1
	stop_status_runtime
	rm -rf /tmp/upload/ss_status.txt
	rm -rf "${LOGSTREAM_F}" "${LOGSTREAM_C}"
	rm -rf /tmp/curl-status
}

check_status(){
	start_status_runtime >/dev/null 2>&1
	if [ "$ss_failover_enable" == "1" ];then
		echo "=========================================== 故障检测脚本重启 ==========================================" >> $LOGFILE_F
		echo "=========================================== 故障检测脚本重启 ==========================================" >> $LOGFILE_C
		echo "=========================================== 故障检测脚本重启 ==========================================" >> "${LOGSTREAM_F}"
		echo "=========================================== 故障检测脚本重启 ==========================================" >> "${LOGSTREAM_C}"
		sh /koolshare/scripts/ss_status_main.sh >/dev/null 2>&1 &
	fi
}


true > $LOGFILE
[ -n "${REQUEST_METHOD}" ] && http_response "$1" >/dev/null 2>&1
usleep 200000
if [ "$ss_failover_enable" == "1" ];then
	echo_date "重启故障转移功能" >> $LOGFILE
	echo_date "重启故障转移功能"
	stop_status
	check_status
	echo_date "完成！" >> $LOGFILE
	echo_date "完成！"
else
	echo_date "关闭故障转移功能，切换为前台按需检测" >> $LOGFILE
	echo_date "关闭故障转移功能，切换为前台按需检测"
	stop_status
	check_status
	echo_date "完成！" >> $LOGFILE
	echo_date "完成！"
fi
echo XU6J03M6 >> $LOGFILE
echo XU6J03M6
