#!/bin/sh
# Never replace the maintenance branch with an upstream package.
REQUEST_ID="$1"
source /koolshare/scripts/base.sh
mkdir -p /tmp/upload
printf '%s\n' '此版本由 fancyss-ac3100 项目维护。请通过软件中心离线安装对应维护包。' > /tmp/upload/ss_log.txt
[ -z "${REQUEST_ID}" ] || http_response "${REQUEST_ID}" >/dev/null 2>&1
echo XU6J03M6 >> /tmp/upload/ss_log.txt
