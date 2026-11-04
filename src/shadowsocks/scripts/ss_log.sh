#!/bin/sh
# Read-only, bounded log snapshots. The view never becomes a filesystem path.
REQUEST_ID="$1"
source /koolshare/scripts/base.sh
JQ=/koolshare/bin/jq

log_snapshot() {
	local view="$1" file exists=false bytes=0 truncated=false
	case "${view}" in
	plugin) file=/tmp/upload/ss_log.txt ;;
	subscribe) file=/tmp/upload/ss_subscribe_log.txt ;;
	*) return 2 ;;
	esac
	if [ -f "${file}" ]; then
		exists=true
		bytes=$(wc -c < "${file}" | tr -d ' ')
		[ "${bytes}" -le 131072 ] || truncated=true
		[ "$(wc -l < "${file}")" -le 2000 ] || truncated=true
	fi
	{
		[ "${exists}" = false ] || tail -n 2000 "${file}" 2>/dev/null | tail -c 131072
	} | "${JQ}" -Rs --arg view "${view}" --argjson exists "${exists}" --argjson truncated "${truncated}" \
		'{view:$view,exists:$exists,truncated:$truncated,text:.}'
}

case "$1" in
read) log_snapshot "$2" ;;
*)
	[ "$2" = read ] || exit 2
	case "${REQUEST_ID}" in ''|*[!0-9]*) exit 2 ;; esac
	payload="$(log_snapshot "$3")" || exit 2
	# Older httpdb wraps the response verbatim in a JSON string. JSON text is
	# unsafe there; transport one base64 token, then decode in the browser.
	umask 077
	WIRE_DIR="/tmp/fss_log_response.${REQUEST_ID}.$$"
	mkdir "${WIRE_DIR}" || exit 1
	trap 'rm -f "${WIRE_DIR}/body"; rmdir "${WIRE_DIR}" 2>/dev/null' EXIT
	trap 'exit 1' INT TERM
	{
		printf 'FSSLOG1:'
		printf '%s' "${payload}" | base64 | tr -d '\r\n'
	} > "${WIRE_DIR}/body"
	# A file avoids Linux's per-argument size limit for large log snapshots.
	curl -sS --noproxy '*' --connect-timeout 2 --max-time 5 -X POST \
		--data-binary "@${WIRE_DIR}/body" "http://127.0.0.1/_resp/${REQUEST_ID}" >/dev/null 2>&1
	;;
esac
