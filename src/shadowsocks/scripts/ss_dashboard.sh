#!/bin/sh
REQUEST_ID="$1"
source /koolshare/scripts/base.sh
JQ=/koolshare/bin/jq
work="/tmp/xwt_dashboard.$$"
umask 077
mkdir "$work" || exit 1
trap 'rm -rf "$work"' EXIT
pid=""
for candidate in $(pidof xray); do
    command_line=$(tr '\000' ' ' < "/proc/$candidate/cmdline" 2>/dev/null)
    case "$command_line" in *' -test'*) continue ;; *'/koolshare/ss/xray.json'*) pid="$candidate"; break ;; esac
done
node=$(dbus get fss_node_current)
case "$node" in ''|*[!0-9]*) node="" ;; esac
dbus get "fss_node_$node" | base64 -d > "$work/node" 2>/dev/null
rss=0; ticks=0; start=0
if [ -n "$pid" ] && [ -r "/proc/$pid/stat" ]; then
    read ticks start <<EOF
$(sed 's/^.*) //' "/proc/$pid/stat" | awk '{printf "%.0f %.0f",$12+$13,$20}')
EOF
    rss=$(awk '$1=="VmRSS:"{print $2}' "/proc/$pid/status")
fi
total=$(awk '/^cpu /{for(i=2;i<=NF;i++)s+=$i;printf "%.0f",s;exit}' /proc/stat)
cpus=$(grep -c '^processor' /proc/cpuinfo)
config=/dev/null
: > "$work/stats"
if [ -n "$pid" ]; then
    config=/koolshare/ss/xray.json
    curl -fsS --noproxy '*' --connect-timeout 1 --max-time 2 http://127.0.0.1:11111/debug/vars > "$work/stats" 2>/dev/null || : > "$work/stats"
fi
uptime=$(awk '{print $1}' /proc/uptime)
ping_value=""
ping_cache=/tmp/xwt_dashboard_ping
if [ -r "$ping_cache" ]; then read -r ping_node ping_time ping_result < "$ping_cache"; fi
now="${uptime%%.*}"
case "$ping_time" in ''|*[!0-9]*) ping_time=0 ;; esac
if [ "$ping_node" = "$node" ] && [ "$now" -ge "$ping_time" ] && [ $((now - ping_time)) -le 30 ]; then
    ping_value="$ping_result"
fi
if [ -n "$pid" ] && [ -n "$node" ] && { [ "$ping_node" != "$node" ] || [ "$now" -lt "$ping_time" ] || [ $((now - ping_time)) -ge 1 ]; }; then
    sh /koolshare/scripts/ss_dashboard_ping.sh "$node" >/dev/null 2>&1 &
fi
[ -r "$config" ] || config=/dev/null
"$JQ" -cn --rawfile node_json "$work/node" --rawfile config_json "$config" \
    --rawfile stats_json "$work/stats" --arg pid "$pid" --arg node "$node" --arg ping "$ping_value" \
    --argjson rss "${rss:-0}" --argjson ticks "${ticks:-0}" \
    --argjson start "${start:-0}" --argjson total "${total:-0}" \
    --argjson cpus "${cpus:-1}" --argjson uptime "${uptime:-0}" '
    def object: (try fromjson catch null) | if type == "object" then . else {} end;
    ($node_json | object) as $n |
    [($config_json | object).outbounds[]? |
        select(.protocol != "freedom" and .protocol != "blackhole"
            and .protocol != "dns" and .protocol != "loopback")] as $outbounds |
    (($stats_json | object).stats.outbound) as $stats |
    [$outbounds[] | select(.tag != "api") | .tag | select(type == "string")] as $tags |
    [if ($stats | type) == "object" then
        $stats | to_entries[] | select(.key as $key | $tags | index($key)) | .value
     else empty end] as $traffic |
    {pid:$pid,node:$node,name:($n.name // ""),ping:$ping,
     kind:(if ($n.xray_prot // "") != "" then $n.xray_prot
           elif $pid != "" then $outbounds[0].protocol // "JSON" else "" end),
     network:(if ($n.xray_prot // "") != "" or $pid == "" then $n.xray_network // ""
              else $outbounds[0].streamSettings.network // "" end),
     rss_kb:$rss,cpu_ticks:$ticks,start_ticks:$start,total_ticks:$total,cpus:$cpus,uptime:$uptime,tags:$tags,
     traffic_available:(($stats | type) == "object" and ($tags | length) > 0 and
         ([$tags[] as $tag | select(($stats[$tag].uplink | type) != "number" or
             ($stats[$tag].downlink | type) != "number")] | length) == 0),
     upload:($traffic | map(.uplink | numbers) | add // 0),
     download:($traffic | map(.downlink | numbers) | add // 0)}
' > "$work/json" &
jq_pid=$!
(
    sleep 4 &
    sleeper=$!
    trap 'kill "$sleeper" 2>/dev/null; exit' HUP INT TERM
    wait "$sleeper"
    # Match this job's private input path before signalling the process.
    if [ -r "/proc/$jq_pid/cmdline" ] &&
       tr '\000' '\n' < "/proc/$jq_pid/cmdline" | grep -Fxq "$work/node"; then
        kill -KILL "$jq_pid" 2>/dev/null
    fi
) &
watchdog=$!
wait "$jq_pid"
result=$?
kill "$watchdog" 2>/dev/null
wait "$watchdog" 2>/dev/null
[ "$result" -eq 0 ] || exit 1
if [ "$REQUEST_ID" = read ]; then cat "$work/json"; exit; fi
case "$REQUEST_ID" in ""|*[!0-9]*) exit 2 ;; esac
{ printf FSSLOG1:; base64 < "$work/json" | tr -d '\r\n'; } > "$work/body"
curl -sS --noproxy '*' --max-time 5 -X POST --data-binary "@$work/body" "http://127.0.0.1/_resp/$REQUEST_ID" >/dev/null 2>&1
