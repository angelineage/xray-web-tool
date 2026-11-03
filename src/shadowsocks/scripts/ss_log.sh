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
	payload="$(log_snapshot "$3")" || exit 2
	http_response "${payload}" >/dev/null 2>&1
	;;
esac
