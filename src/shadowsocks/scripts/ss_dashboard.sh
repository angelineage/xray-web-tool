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
"$JQ" -e 'type=="object"' "$work/node" >/dev/null 2>&1 || printf '{}' > "$work/node"
name=$("$JQ" -r '.name // ""' "$work/node")
kind=$("$JQ" -r '.xray_prot // ""' "$work/node")
network=$("$JQ" -r '.xray_network // ""' "$work/node")
if [ -n "$pid" ] && [ -z "$kind" ]; then
    kind=$("$JQ" -r '[.outbounds[]?|select(.protocol!="freedom" and .protocol!="blackhole" and .protocol!="dns" and .protocol!="loopback")][0].protocol // "JSON"' /koolshare/ss/xray.json)
    network=$("$JQ" -r '[.outbounds[]?|select(.protocol!="freedom" and .protocol!="blackhole" and .protocol!="dns" and .protocol!="loopback")][0].streamSettings.network // ""' /koolshare/ss/xray.json)
fi
rss=0; ticks=0; start=0
if [ -n "$pid" ] && [ -r "/proc/$pid/stat" ]; then
    read ticks start <<EOF
$(sed 's/^.*) //' "/proc/$pid/stat" | awk '{printf "%.0f %.0f",$12+$13,$20}')
EOF
    rss=$(awk '$1=="VmRSS:"{print $2}' "/proc/$pid/status")
fi
total=$(awk '/^cpu /{for(i=2;i<=NF;i++)s+=$i;printf "%.0f",s;exit}' /proc/stat)
cpus=$(grep -c '^processor' /proc/cpuinfo)
uptime=$(awk '{print $1}' /proc/uptime)
available=false; up=0; down=0
if [ -n "$pid" ]; then
    curl -fsS --noproxy '*' --connect-timeout 1 --max-time 2 http://127.0.0.1:11111/debug/vars > "$work/stats" 2>/dev/null
    if "$JQ" -e '.stats.outbound | type=="object"' "$work/stats" >/dev/null 2>&1; then
        tags=$("$JQ" -c '[.outbounds[]?|select(.protocol!="freedom" and .protocol!="blackhole" and .protocol!="dns" and .protocol!="loopback" and .tag!="api")|.tag]' /koolshare/ss/xray.json)
        "$JQ" -r --argjson tags "$tags" '[.stats.outbound|to_entries[]|select(.key as $k|$tags|index($k))|.value] | [(map(.uplink)|add//0),(map(.downlink)|add//0)]|@tsv' "$work/stats" > "$work/bytes"
        read up down < "$work/bytes"
        available=true
    fi
fi
"$JQ" -cn --arg pid "$pid" --arg node "$node" --arg name "$name" --arg kind "$kind" --arg network "$network" --argjson rss "${rss:-0}" --argjson ticks "${ticks:-0}" --argjson start "${start:-0}" --argjson total "${total:-0}" --argjson cpus "${cpus:-1}" --argjson uptime "${uptime:-0}" --argjson available "$available" --argjson up "${up:-0}" --argjson down "${down:-0}" '{pid:$pid,node:$node,name:$name,kind:$kind,network:$network,rss_kb:$rss,cpu_ticks:$ticks,start_ticks:$start,total_ticks:$total,cpus:$cpus,uptime:$uptime,traffic_available:$available,upload:$up,download:$down}' > "$work/json"
if [ "$REQUEST_ID" = read ]; then cat "$work/json"; exit; fi
case "$REQUEST_ID" in ""|*[!0-9]*) exit 2 ;; esac
{ printf FSSLOG1:; base64 < "$work/json" | tr -d '\r\n'; } > "$work/body"
curl -sS --noproxy '*' --max-time 5 -X POST --data-binary "@$work/body" "http://127.0.0.1/_resp/$REQUEST_ID" >/dev/null 2>&1
