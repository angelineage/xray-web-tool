#!/bin/sh
# Uses synthetic logs and an injected file transport. No production paths written.
set -e
ROOT=/tmp/fancyss_ac3100_review_v010
JQ=/koolshare/bin/jq
mkdir -p "$ROOT/runtime/rules" "$ROOT/upload"
for script in "$ROOT"/*.sh; do /bin/sh -n "$script"; done
reset_rules() {
	cp "$ROOT/feed/"* "$ROOT/runtime/rules/"
	# Force a real update without changing the accepted feed hashes.
	printf 'old.example\n' | gzip > "$ROOT/runtime/rules/gfwlist.gz"
	printf 'old.cn\n' | gzip > "$ROOT/runtime/rules/chnlist.gz"
	printf '1.0.1.0/24\n' > "$ROOT/runtime/rules/chnroute.txt"
}
digest() { sha256sum "$ROOT/runtime/rules/"* | sha256sum | awk '{print $1}'; }
reset_rules
sh "$ROOT/ss_rule_update.sh" update > "$ROOT/cli-result.txt"
for name in gfwlist.gz chnlist.gz chnroute.txt; do cmp "$ROOT/runtime/rules/$name" "$ROOT/feed/$name"; done
[ "$("$JQ" -Sc . "$ROOT/runtime/rules/rules.json.js")" = "$("$JQ" -Sc . "$ROOT/feed/rules.json.js")" ]
[ "$(grep -c '开始规则操作' "$ROOT/upload/ss_log.txt")" = 1 ]
echo 'RULE_UPDATE_SUCCESS'
sh "$ROOT/ss_rule_update.sh" 123 1
[ "$(cat "$ROOT/ack.txt")" = 123 ]
[ "$(grep -c '开始规则操作' "$ROOT/upload/ss_log.txt")" = 1 ]
! grep -q '下载并校验' "$ROOT/upload/ss_log.txt"
echo 'SCHEDULE_DISPATCH_ONCE'
sh "$ROOT/ss_rule_update.sh" 124 2
[ "$(cat "$ROOT/ack.txt")" = 124 ]
grep -q '无需替换规则' "$ROOT/upload/ss_log.txt"
echo 'HTTP_UPDATE_ACK_AND_NO_CHANGE'
reset_rules
before=$(digest)
cp "$ROOT/feed/chnroute.txt" "$ROOT/routes.saved"
printf 'corrupt' > "$ROOT/feed/chnroute.txt"
if sh "$ROOT/ss_rule_update.sh" update > "$ROOT/bad-hash-result.txt"; then exit 1; fi
[ "$(digest)" = "$before" ]
cp "$ROOT/routes.saved" "$ROOT/feed/chnroute.txt"
echo 'BAD_HASH_PRESERVES_ALL_RULES'
if FAIL_COMMIT=1 sh "$ROOT/ss_rule_update.sh" update > "$ROOT/rollback-result.txt"; then exit 1; fi
[ "$(digest)" = "$before" ]
echo 'MID_COMMIT_FAILURE_ROLLS_BACK'
mkdir "$ROOT/rule_update.lock"
echo "$$" > "$ROOT/rule_update.lock/pid"
oldlog=$(sha256sum "$ROOT/upload/ss_log.txt")
if sh "$ROOT/ss_rule_update.sh" update > "$ROOT/busy-result.txt"; then exit 1; fi
[ "$(sha256sum "$ROOT/upload/ss_log.txt")" = "$oldlog" ]
rm "$ROOT/rule_update.lock/pid"; rmdir "$ROOT/rule_update.lock"
echo 'BUSY_REQUEST_PRESERVES_LOG'
printf 'new operation\nXU6J03M6\n' > "$ROOT/upload/ss_log.txt"
sh "$ROOT/ss_log.sh" read plugin > "$ROOT/log-result.json"
"$JQ" -e '.view=="plugin" and .exists==true and (.text|contains("new operation"))' "$ROOT/log-result.json" >/dev/null
sh "$ROOT/ss_log.sh" read subscribe > "$ROOT/missing-result.json"
"$JQ" -e '.exists==false and .text==""' "$ROOT/missing-result.json" >/dev/null
if sh "$ROOT/ss_log.sh" read ../../etc/passwd; then exit 1; fi
awk 'BEGIN {for(i=1;i<=2500;i++)print "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ"}' > "$ROOT/upload/ss_log.txt"
sh "$ROOT/ss_log.sh" read plugin > "$ROOT/large-result.json"
"$JQ" -e '.truncated==true and (.text|utf8bytelength)<=131072' "$ROOT/large-result.json" >/dev/null
echo 'LOG_SNAPSHOT_EMPTY_BOUNDS_AND_WHITELIST'
echo 'ALL_ROUTER_REVIEW_TESTS_PASSED'
