#!/bin/sh

source /koolshare/scripts/ss_base.sh
source /koolshare/scripts/ss_probe_lib.sh

STATUS_TOOL_BIN="/koolshare/bin/status-tool"
STATUS_DAEMON_PIDFILE="/var/run/status-tool.pid"
STATUS_SERVE_PIDFILE="/var/run/status-tool-serve.pid"
STATUS_DAEMON_STATE="/tmp/upload/ss_status_daemon.json"
STATUS_DAEMON_LEGACY="/tmp/upload/ss_status_front.txt"
STATUS_SERVE_SOCKET="/tmp/status-tool.sock"
STATUS_SERVE_ARGS_FILE="/tmp/status-tool-serve.args"
STATUS_WS_LOCK_DIR="/tmp/fancyss_status_ws.lock"
STATUS_HTTP_LOCK_DIR="/tmp/fancyss_status_http.lock"

kill_status_stream_followers() {
	ps w | grep -F "/tmp/upload/ssf_status.stream" | grep -v grep | awk '{print $1}' | while read -r pid; do
		[ -n "${pid}" ] && kill "${pid}" >/dev/null 2>&1
	done
	ps w | grep -F "/tmp/upload/ssc_status.stream" | grep -v grep | awk '{print $1}' | while read -r pid; do
		[ -n "${pid}" ] && kill "${pid}" >/dev/null 2>&1
	done
	ps w | grep -F "sh /koolshare/scripts/ss_status_ws.sh" | grep -v grep | awk '{print $1}' | while read -r pid; do
		[ -n "${pid}" ] && kill "${pid}" >/dev/null 2>&1
	done
}

status_tool_tz() {
	local tz=""
	tz="$(nvram get time_zone 2>/dev/null)"
	[ -n "${tz}" ] || tz="$(nvram get time_zone_x 2>/dev/null)"
	[ -n "${tz}" ] || tz="CST-8"
	printf '%s' "${tz}"
}





start_status_daemon() {
    env TZ="$(status_tool_tz)" start-stop-daemon -S -q -b -m -p "${STATUS_DAEMON_PIDFILE}" -x /bin/sh -- /koolshare/scripts/ss_status_curl.sh daemon
}



stop_status_daemon() {
	kill_status_stream_followers
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

restart_status_daemon() {
	stop_status_daemon
	if [ "$(dbus get ss_failover_enable)" = "1" ];then
		start_status_daemon
	fi
}

case "$1" in
start)
	if [ "$(dbus get ss_failover_enable)" = "1" ];then
		start_status_daemon
	fi
	;;
stop)
	stop_status_daemon
	;;
restart)
	restart_status_daemon
	;;
esac
