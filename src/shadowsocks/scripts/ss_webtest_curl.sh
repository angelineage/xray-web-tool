#!/bin/sh
# Source after ss_base.sh and ss_probe_lib.sh. Same job/result contract as
# webtest-tool, without a packed ELF loader or modern kernel timer dependency.

wt_curl_probe_target() (
	local id="$1" port="$2" start="$3" stop="$4" url="$5" ready_port="$6"
	local state=failed ms=0 code=000 result value=failed attempt sum=0 count=0
	FSS_WT_CLEANUP_HOOK="${stop}"
	trap '[ -z "${FSS_WT_CLEANUP_HOOK}" ] || sh "${FSS_WT_CLEANUP_HOOK}" >/dev/null 2>&1' EXIT
	trap 'exit 1' INT TERM
	if [ -n "${start}" ] && ! sh "${start}" >/dev/null 2>&1; then
		state=start_failed
	elif ! fss_probe_wait_port "${ready_port:-${port}}"; then
		state=connect
	else
		for attempt in 0 1 2; do
			if [ -f "${WT_WEBTEST_STOP_FLAG}" ]; then state=stopped; break; fi
			result="$(fss_http_probe "${url}" "127.0.0.1:${port}" any)"
			IFS='|' read -r state ms code <<-EOF
			${result}
			EOF
			[ "${state}" = ok ] || break
			# First request warms up the outbound; mean of two measured requests.
			if [ "${attempt}" -gt 0 ]; then sum=$((sum + ms)); count=$((count + 1)); fi
		done
	fi
	if [ "${state}" = ok ] && [ "${count}" -gt 0 ]; then
		ms=$(((sum + count / 2) / count)); value="${ms}"
	else
		case "${state}" in
		timeout|dns|connect|tls|http|proxy|unavailable|invalid_url|stopped) value="${state}" ;;
		*) value=failed ;;
		esac
	fi
	"${WT_CURL_JQ}" -cn --arg id "${id}" --arg state "${state}" \
		--arg value "${value}" --arg code "${code}" --argjson ms "${ms}" \
		'{id:$id, state:(if $state == "ok" then "ok" else $value end),
		 latency_ms:(if $state == "ok" then $ms else null end),
		 status_code:($code|tonumber), error:(if $state == "ok" then "" else $state end)}'
)

wt_run_curl_job() (
	local job="$1" rows items output stream url result id state ms value start stop port ready_port
	WT_CURL_JQ="$(wt_pick_jq)" || exit 1
	rows="${job}.curl.rows.$$"; items="${job}.curl.results.$$"
	FSS_WT_CURL_ROWS="${rows}"; FSS_WT_CURL_ITEMS="${items}"
	trap 'rm -f "${FSS_WT_CURL_ROWS}" "${FSS_WT_CURL_ITEMS}"' EXIT
	trap 'exit 1' INT TERM
	output="$("${WT_CURL_JQ}" -r '.output_json' "${job}")"
	stream="$("${WT_CURL_JQ}" -r '.legacy_stream_file // empty' "${job}")"
	url="$("${WT_CURL_JQ}" -r '.url' "${job}")"
	# A non-whitespace separator preserves optional empty hook columns in ash.
	"${WT_CURL_JQ}" -r '.groups[].targets[] |
		[.id, (.test_port|tostring), (.start_script // ""), (.stop_script // ""),
		 ((.wait_port // .test_port)|tostring)] | join("|")' "${job}" > "${rows}" || exit 1
	: > "${items}"
	while IFS='|' read -r id port start stop ready_port; do
		printf '%s' "${id}" | grep -Eq '^[0-9]+$' || continue
		if [ -f "${WT_WEBTEST_STOP_FLAG}" ]; then
			result="$("${WT_CURL_JQ}" -cn --arg id "${id}" '{id:$id,state:"stopped",latency_ms:null,error:"stopped"}')"
		else
			result="$(wt_curl_probe_target "${id}" "${port}" "${start}" "${stop}" "${url}" "${ready_port}")" || exit 1
		fi
		printf '%s\n' "${result}" >> "${items}"
		value="$(printf '%s' "${result}" | "${WT_CURL_JQ}" -r 'if .state == "ok" then .latency_ms else .state end')"
		[ -z "${stream}" ] || printf '%s>%s\n' "${id}" "${value}" >> "${stream}"
	done < "${rows}"
	"${WT_CURL_JQ}" -s '{backend:"curl-compat",results:.}' "${items}" > "${output}.tmp.$$" || exit 1
	mv -f "${output}.tmp.$$" "${output}"
)

wt_run_webtest_job() {
	local tool="$1" job="$2"
	if ! fss_probe_legacy_kernel && [ -n "${tool}" ]; then
		"${tool}" run --config "${job}" && return 0
	fi
	wt_run_curl_job "${job}"
}
