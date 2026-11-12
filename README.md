# Xray Web Tool

只维护 **斐讯Phicomm K3 / 梅林386 / arm_lite / Linux 2.6.36** 的个人维护分支。

维护版本从 **0.1.0** 开始；上游兼容版本保留 **3.5.30**，避免破坏原安装和配置迁移判断。界面、安装包名、Git 标签及 `maintenance.json` 使用独立维护版本。

上游：[hq450/fancyss，3.0 分支](https://github.com/hq450/fancyss/tree/3.0)。导入基准提交：`b19e82cb6a05e08990a96905353921819d44d134`。导入包 SHA-256：`f57f52f38a6973b1387d2bda1aa5b4e635bd562e6de074ed420c13c25162d878`。

## 已包含的修改

- 去掉顶部广告、购买弹窗和订阅空状态推广。
- 为旧内核提供国内外状态及 Web 落地延迟检测兼容路径。
- 修复规则请求执行两次、日志清空/响应顺序错误。
- “查看日志”改为有界 HTTP 快照，持续刷新；切换日志、隐藏页面和离开页面时取消旧请求。
- 防止旧请求把上一次操作的日志覆盖到新操作；日志按文本显示。
- gfwlist、chnlist、chnroute 新快照及来源记录。
- 独立版本管理、可重复打包、基础测试和 GitHub Actions。

## 本地测试与打包

需要 Python 3.10+、Node.js 22+、Git；Shell 语法测试还需要 Bash（Windows 可使用 Git for Windows）。不需要 pip/npm 依赖。

```sh
python -m unittest discover -s tests -v
node tests/test_ui.cjs
node tests/test_probe.cjs
python tools/build.py
```

输出在 `dist/`：离线安装包、`SHA256SUMS.txt`、逐文件构建清单。同一份源码和规则重复构建得到相同安装包；构建时间不写入包内。原生二进制按 `packaging/vendor-lock.json` 锁定，发生变化会拒绝打包。

安装包带 RT-AC3100 机型校验。软件中心离线安装会运行原有升级迁移和重启流程，安装前备份配置，完成后 Ctrl+F5 刷新。

## 更新规则

这里将用户提到的三项按 **gfwlist、chnlist、chnroute** 处理。沿用上游的多来源合并及排除策略，不把 APNIC 分配表单独当作完整中国路由表。

```sh
python tools/update_rules.py            # 下载、转换、预览；不替换源码快照
python tools/update_rules.py --apply    # 所有来源及校验通过后写入源码
python tools/update_rules.py --offline  # 使用本地缓存复查
git diff --stat
```

缓存和预览在 `.cache/`；来源 URL、输入 SHA-256、数量及抓取时间记录在 `rules-provenance.json`。异常格式、错误网页、数量骤变会导致失败；不会继续构建空规则。规则格式是域名后缀表，不能完整表达 AutoProxy 的全部路径/正则/例外语义，转换器会跳过不支持项；策略变更需要审核。

目前不更新 `rules_ng2` 的 geosite/geoip 及分流预设，本版三项更新仅作用于经典 gfwlist/chnlist/chnroute 规则文件。

## 自己的在线规则源

维护仓库为 [angelineage/xray-web-tool](https://github.com/angelineage/xray-web-tool)。从 0.1.1 开始，`maintenance.json` 已配置该公开仓库的 HTTPS 规则目录；路由器不需要 GitHub 账号或密钥即可下载。

发布自己的规则文件后，将 `rules_base_url` 设置为同一 HTTPS 目录（通常是个人仓库的 raw URL），目录中放 `rules.json.js`、`gfwlist.gz`、`chnlist.gz`、`chnroute.txt`。可以直接发布 `src/shadowsocks/ss/rules/` 的对应文件。三项清单必须带 SHA-256。

路由器只更新勾选项，先全部下载和校验，再替换；中途失败会还原规则与清单。规则变动应用成功后会重启插件。HTTPS 不跳过证书验证，下载失败保留当前规则。规则更新始终只针对这三个文件，不跟随远程清单写入任意路径。

## Git 与发版

- `main`：维护主线。
- `upstream-3.5.30`：原始导入基准。
- `v0.1.0`：首个维护版本。
- `v0.1.1`：接入个人公开仓库与在线规则源。

后续流程：

```sh
python tools/version.py 0.1.2
# 修改代码、更新 CHANGELOG.md，运行测试并提交
git add .
git commit -m "Describe the change"
python tools/release.py --tag
```

`release.py` 要求工作区干净，执行测试、打包、创建本地注解标签并导出源码。推送个人 GitHub 仓库后，push/PR/标签会触发自动测试和打包；标签必须与版本一致。Actions 产物保存在对应运行的 Artifacts，当前工作流不自动创建公开 Release。

规则工作流每天北京时间 04:30 从上游生成规则，也支持在 GitHub Actions 手动运行。下载、格式和数量检查及基础测试通过后，内容有变化才提交规则和来源记录。路由器按自身的规则更新设置下载，定时任务需要在插件页面单独开启。远程仓库为 `https://github.com/angelineage/xray-web-tool.git`。

## 实机测试

```sh
python tools/prepare_router_review.py
# 将 .cache/router-review 整个目录上传为：
# /tmp/fancyss_ac3100_review_v010
# 然后在路由器执行：
sh /tmp/fancyss_ac3100_review_v010/run.sh
```

该测试使用合成日志、测试目录、文件下载替身和失败注入；不会写入生产规则、配置或触发真实重启。网络下载/证书、真实 API/UI、升级安装仍需另做设备验收，不能用通过基础测试代替。

## 来源与边界

保留上游 GPL-3.0 许可证及原有版权。`src/shadowsocks/bin` 原生程序来自原安装包，本次不升级；来源和版本线索见上游对应 `binaries/`、`tool/` 子项目。后续升级原生程序时应同时保存对应源码版本、工具链和兼容性验证记录。

本分支不承诺其他机型、架构、固件及未实测协议的兼容性。

运行状态页默认打开，读取当前节点、Xray CPU/RSS 和代理出站流量。每次成功采样后间隔 3 秒再发起下一次请求。直连流量不计入代理统计，计数自核心重启开始。使用仅监听本机的 Metrics 接口，切离或隐藏页面后停止采样。

支持协议：Shadowsocks、VMess、VLESS、Trojan、Hysteria2，均使用 Xray 核心；Shadowsocks 的部分混淆方式使用 obfs-local 辅助。SSR 已移除，含 SSR 节点的配置备份会在写入前拒绝恢复，混合订阅中的 SSR 链接会跳过。
