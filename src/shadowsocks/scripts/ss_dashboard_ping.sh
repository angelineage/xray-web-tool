#!/bin/sh
# Keep ICMP probes separate from the dashboard response and prevent overlap.
node="$1"
case "$node" in ''|*[!0-9]*) exit 1 ;; esac
exec 234>/tmp/xwt_dashboard_ping.lock
flock -n 234 || exit 0
cache=/tmp/xwt_dashboard_ping
now=$(awk '{printf "%d", $1}' /proc/uptime)
if [ -r "$cache" ]; then
    read -r cached_node cached_time cached_result < "$cache"
    case "$cached_time" in ''|*[!0-9]*) cached_time=0 ;; esac
    if [ "$cached_node" = "$node" ] && [ "$now" -ge "$cached_time" ] && [ $((now - cached_time)) -lt 1 ]; then exit 0; fi
fi
work="/tmp/xwt_dashboard_ping.$$"
umask 077
mkdir "$work" || exit 1
trap 'rm -rf "$work"' EXIT
# Cache the resolved node host while the node and Xray process stay unchanged.
# This avoids launching jq for every one-second probe.
set -- $(pidof xray)
xray_pid="${1:-0}"
host_cache=/tmp/xwt_dashboard_ping_host
host_cached=""
if [ -r "$host_cache" ]; then
    read -r host_node host_pid host_time host_cached < "$host_cache"
    case "$host_time" in ''|*[!0-9]*) host_time=0 ;; esac
    if [ "$host_node" != "$node" ] || [ "$host_pid" != "$xray_pid" ] || [ "$now" -lt "$host_time" ] || [ $((now - host_time)) -ge 30 ]; then host_cached=""; fi
fi
if [ -n "$host_cached" ]; then
    printf '%s' "$host_cached" > "$work/host"
else
dbus get "fss_node_$node" | base64 -d > "$work/node" 2>/dev/null
if [ -r /koolshare/ss/xray.json ]; then
    config=/koolshare/ss/xray.json
else
    config="$work/empty"
    printf '{}' > "$config"
fi
/koolshare/bin/jq -r --slurpfile config "$config" '
    ([.server, .hy2_server, .naive_server, .anytls_server] |
        map(select(type == "string" and length > 0)) | first) //
    ([$config[0].outbounds[]? |
        select(.protocol != "freedom" and .protocol != "blackhole" and .protocol != "dns") |
        (.settings.vnext[0].address // .settings.servers[0].address // .settings.address // empty)] | first) // empty
' "$work/node" > "$work/host" 2>/dev/null &
job=$!
(sleep 4 & sleeper=$!; trap 'kill "$sleeper" 2>/dev/null; exit' HUP INT TERM; wait "$sleeper"; kill -9 "$job" 2>/dev/null) &
watcher=$!
wait "$job" 2>/dev/null
kill "$watcher" 2>/dev/null
wait "$watcher" 2>/dev/null
    host_new=$(cat "$work/host")
    case "$host_new" in
        ''|*[!A-Za-z0-9.:-]*|-*) ;;
        *) printf '%s %s %s %s\n' "$node" "$xray_pid" "$now" "$host_new" > "$work/host-cache"; mv -f "$work/host-cache" "$host_cache" ;;
    esac
fi
host=$(cat "$work/host")
case "$host" in
    ''|*[!A-Za-z0-9.:-]*|-*) result=unavailable ;;
    *)
        ping -c 1 -W 1 "$host" > "$work/ping" 2>/dev/null &
        job=$!
        (sleep 5 & sleeper=$!; trap 'kill "$sleeper" 2>/dev/null; exit' HUP INT TERM; wait "$sleeper"; kill -9 "$job" 2>/dev/null) &
        watcher=$!
        wait "$job" 2>/dev/null
        kill "$watcher" 2>/dev/null
        wait "$watcher" 2>/dev/null
        result=$(awk 'match($0, /time[=<][0-9.]+/) {v=substr($0,RSTART,RLENGTH); sub(/^time[=<]/,"",v); print v; exit}' "$work/ping")
        [ -n "$result" ] || result=timeout
        ;;
esac
[ "$(dbus get fss_node_current)" = "$node" ] || exit 0
now=$(awk '{printf "%d", $1}' /proc/uptime)
printf '%s %s %s\n' "$node" "$now" "$result" > "$work/result"
mv -f "$work/result" "$cache"

