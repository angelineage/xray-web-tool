#!/bin/sh
REQUEST_ID="$1"
source /koolshare/scripts/base.sh
source /koolshare/scripts/ss_probe_lib.sh
ACTION="$2"
JQ=/koolshare/bin/jq
CURL=$(fss_probe_curl) || exit 1
REPO=https://api.github.com/repos/angelineage/xray-web-tool
WORK="/tmp/fss_update.$$"
umask 077
mkdir "${WORK}" || exit 1
trap 'rm -rf "${WORK}"' EXIT
fetch() {
    "$CURL" -fsSL --connect-timeout 5 --max-time 60 --retry 1 --noproxy '*' --proto '=https' --proto-redir '=https' "$1" -o "$2" && return 0
    "$CURL" -fsSL --connect-timeout 5 --max-time 120 --retry 1 --socks5-hostname 127.0.0.1:23456 --noproxy '' --proto '=https' --proto-redir '=https' "$1" -o "$2"
}
check_release() {
    "$CURL" -fsSL --connect-timeout 3 --max-time 8 --noproxy '*' "${REPO}/releases/latest" -o "${WORK}/release.json" ||
        "$CURL" -fsSL --connect-timeout 3 --max-time 8 --socks5-hostname 127.0.0.1:23456 --noproxy '' "${REPO}/releases/latest" -o "${WORK}/release.json" || return 1
    TAG=$($JQ -r '.tag_name' "${WORK}/release.json")
    printf '%s' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || return 1
}
if [ "${ACTION}" = check ]; then
    if check_release; then http_response "$TAG" >/dev/null 2>&1
    else http_response unavailable >/dev/null 2>&1; fi
    exit
fi
[ "${ACTION}" = update ] || exit 2
mkdir /tmp/fss_update.lock 2>/dev/null || { http_response busy >/dev/null 2>&1; exit 1; }
trap 'rm -rf "${WORK}"; rmdir /tmp/fss_update.lock 2>/dev/null' EXIT
mkdir -p /tmp/upload
: > /tmp/upload/ss_log.txt
http_response "$REQUEST_ID" >/dev/null 2>&1
{
    echo '正在检查 Xray Web Tool 最新正式版本...'
    if ! check_release; then echo '检查更新失败，请稍后重试。'; echo XU6J03M6; exit 1; fi
    CURRENT=$($JQ -r '.version' /koolshare/ss/maintenance.json)
    if [ "$TAG" = "v${CURRENT}" ]; then echo "当前已是最新版本 ${CURRENT}"; echo XU6J03M6; exit 0; fi
    # Never downgrade: numeric comparison supports multi-digit version segments.
    NEW=${TAG#v}
    latest=$(printf '%s\n%s\n' "$CURRENT" "$NEW" | sort -t . -k1,1n -k2,2n -k3,3n | tail -1)
    [ "$latest" = "$NEW" ] || { echo '当前版本高于仓库版本，无需更新。'; echo XU6J03M6; exit 0; }
    NAME="xray_web_tool_arm_lite_ac3100_${NEW}.tar.gz"
    URL=$($JQ -r --arg n "$NAME" '.assets[]|select(.name==$n)|.browser_download_url' "${WORK}/release.json")
    SUMURL=$($JQ -r '.assets[]|select(.name=="SHA256SUMS.txt")|.browser_download_url' "${WORK}/release.json")
    case "$URL" in https://github.com/angelineage/xray-web-tool/releases/download/*) ;; *) echo '发布包地址无效'; echo XU6J03M6; exit 1 ;; esac
    case "$SUMURL" in https://github.com/angelineage/xray-web-tool/releases/download/*) ;; *) echo '校验地址无效'; echo XU6J03M6; exit 1 ;; esac
    echo "下载 ${TAG} 并验证 SHA-256..."
    if ! fetch "$URL" "${WORK}/package.tar.gz" || ! fetch "$SUMURL" "${WORK}/SHA256SUMS.txt"; then echo '下载失败'; echo XU6J03M6; exit 1; fi
    EXPECTED=$(awk -v n="$NAME" '$2==n {print $1}' "${WORK}/SHA256SUMS.txt")
    ACTUAL=$(sha256sum "${WORK}/package.tar.gz" | awk '{print $1}')
    [ -n "$EXPECTED" ] && [ "$ACTUAL" = "$EXPECTED" ] || { echo 'SHA-256 校验失败'; echo XU6J03M6; exit 1; }
    mkdir "${WORK}/extract"
    # Require the known archive root and reject parent/absolute paths before extraction.
    tar -tzf "${WORK}/package.tar.gz" > "${WORK}/entries" || exit 1
    if grep -Eq '(^/|(^|/)\.\.(/|$))' "${WORK}/entries"; then echo '安装包路径异常'; echo XU6J03M6; exit 1; fi
    tar -xzf "${WORK}/package.tar.gz" -C "${WORK}/extract" || exit 1
    META="${WORK}/extract/shadowsocks/ss/maintenance.json"
    $JQ -e --arg v "$NEW" '.version==$v and .target.model=="RT-AC3100" and .target.arch=="arm" and .target.edition=="lite"' "$META" >/dev/null || { echo '安装包版本或机型不匹配'; echo XU6J03M6; exit 1; }
    echo "安装包下载及校验完成，开始安装 Xray Web Tool ${TAG}..."
    if [ -e /tmp/shadowsocks ]; then echo '另一个安装任务尚未完成，请稍后重试。'; echo XU6J03M6; exit 1; fi
    mv "${WORK}/extract/shadowsocks" /tmp/shadowsocks || exit 1
    sh /tmp/shadowsocks/install.sh
    rc=$?
    [ "$rc" = 0 ] && echo '更新完成，请刷新页面。' || echo '更新失败，请查看上述日志。'
    echo XU6J03M6
    exit "$rc"
} >> /tmp/upload/ss_log.txt 2>&1
