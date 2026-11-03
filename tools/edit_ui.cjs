// One-time migration retained as documentation; build does not run this script.
const fs=require('fs'), path=require('path');
const p=path.join(__dirname,'../src/shadowsocks/webs/Module_shadowsocks.asp');
let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
function replace(a,b){if(!s.includes(a))throw Error('Missing: '+a.slice(0,80));s=s.replace(a,b);}
replace('<script language="JavaScript" type="text/javascript" src="/res/ss-menu.js?v=compat1"></script>', '<script type="text/javascript" src="/res/ac3100-version.js"></script>\n<script type="text/javascript" src="/res/ac3100-log-viewer.js?v=0.1.0"></script>\n<script language="JavaScript" type="text/javascript" src="/res/ss-menu.js?v=ac3100-0.1.0"></script>');
s=s.replace(/function version_show\(\) \{[\s\S]*?\nfunction message_show\(\)/, `function version_show() {
    var version = window.FANCYSS_AC3100.version;
    $("#ss_version_show").text("RT-AC3100 维护版 " + version + "（上游 3.5.30）");
    $("#updateBtn").text("维护版升级说明");
}
function message_show()`);
s=s.replace(/function update_ss\(\) \{[\s\S]*?\nfunction tabSelect\(/, `function update_ss() {
    layer.msg("请使用维护项目生成的 arm_lite 安装包，通过软件中心离线升级。", {time:6000});
}
function tabSelect(`);
replace('function tabSelect(w) {','function tabSelect(w) {\n\tif (w !== 10 && mainLogViewer) mainLogViewer.stop();');
replace('function push_data_ws(script, arg, obj, flag, ws_cmd){','function push_data_ws(script, arg, obj, flag, ws_cmd){\n\tif (script == "ss_rule_update.sh") return push_data(script, arg, obj, flag);');
replace('function clear_text_file_poll_state(key){\n\tvar state = textFilePollStates[key];','function clear_text_file_poll_state(key){\n\tvar state = textFilePollStates[key];\n\tdelete textFilePollStates[key];\n\tif (state && state.xhr) state.xhr.abort();');
replace('function poll_text_file(opts){\n\tvar key = opts.key;','function poll_text_file(opts){\n\tvar key = opts.key;\n\tif (opts.reset) clear_text_file_poll_state(key);');
// Restrict edits to the generic poller, not unrelated API callbacks.
let start=s.indexOf('function poll_text_file(opts){'), end=s.indexOf('\nfunction push_data(',start);
let poll=s.slice(start,end).replace('$.ajax({','state.xhr = $.ajax({').replace('timeout: opts.timeout,','timeout: opts.timeout || 8000,');
poll=poll.replace('success: function(response) {','success: function(response) {\n\t\t\tif (textFilePollStates[key] !== state) return;\n\t\t\tstate.xhr = null;');
poll=poll.replace('error: function(xhr) {','error: function(xhr) {\n\t\t\tif (textFilePollStates[key] !== state) return;\n\t\t\tstate.xhr = null;');
s=s.slice(0,start)+poll+s.slice(end);
// Rules acknowledge only after truncating the operation log. Start reading then.
start=s.indexOf('function push_data(script, arg, obj, flag){');end=s.indexOf('\nfunction get_subscription_log_layero',start);
let push=s.slice(start,end).replace('if (actionProfile.logMode == "realtime") {','if (actionProfile.logMode == "realtime" && script != "ss_rule_update.sh") {');
push=push.replace('if(response.result == id){','if(response.result == id){\n\t\t\t\tif (script == "ss_rule_update.sh") schedule_realtime_log_start(100);');
s=s.slice(0,start)+push+s.slice(end);
start=s.indexOf('function get_log() {');end=s.indexOf('\nfunction get_realtime_log()',start);
s=s.slice(0,start)+`var mainLogViewer = null;
function get_log() {
    if (!mainLogViewer) mainLogViewer = FssLogViewer.create({
        isActive: function() { return E("tablet_10").style.display !== "none" && !document.hidden; },
        setTimer: function(fn, delay) { return setTimeout(fn, delay); },
        clearTimer: function(timer) { clearTimeout(timer); },
        request: function(view, success, failure) {
            return $.ajax({type:"POST", url:"/_api/", dataType:"json", cache:false, timeout:8000,
                data:JSON.stringify({id:Math.floor(Math.random()*100000000),method:"ss_log.sh",params:["read",view],fields:{}}),
                success:function(response) {
                    try { success(typeof response.result === "string" ? JSON.parse(response.result) : response.result); }
                    catch (error) { failure(); }
                }, error:failure});
        },
        render: function(text, snapshot) {
            var area=E("log_content1"), follow=area.scrollHeight-area.scrollTop-area.clientHeight < 50;
            if (area.value !== text) area.value=text || "暂无日志。";
            if (follow) area.scrollTop=area.scrollHeight;
            $("#ac3100_log_status").text(snapshot.truncated ? "显示最近 2000 行 / 128 KiB；每 1.5 秒刷新" : "每 1.5 秒自动刷新");
        },
        error: function(message) { $("#ac3100_log_status").text(message); }
    });
    mainLogViewer.start(current_log_view);
}
function get_log_httpd() { return get_log(); }
document.addEventListener("visibilitychange", function() {
    if (document.hidden) { if (mainLogViewer) mainLogViewer.stop(); }
    else if (E("tablet_10") && E("tablet_10").style.display !== "none") get_log();
});
window.addEventListener("beforeunload", function() { if (mainLogViewer) mainLogViewer.stop(); });
`+s.slice(end);
replace('<div id="log_content" style="overflow:hidden;">','<div id="ac3100_log_status" style="padding:8px;color:#ccc;">正在读取日志…</div>\n\t\t\t\t\t\t\t\t\t\t\t\t<div id="log_content" style="overflow:hidden;">');
// Keep operation-log polling alive through same-length content changes and
// multiple actions, with less load on the old router.
start=s.indexOf('function get_realtime_log()');end=s.indexOf('\nfunction count_down_close()',start);
let realtime=s.slice(start,end).replace('delay: 100','delay: 1000');
s=s.slice(0,start)+realtime+s.slice(end);
fs.writeFileSync(p,s);
