const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'../src/shadowsocks');
const viewer=require(root+'/res/ac3100-log-viewer.js');
let tests=0;
const logPayload={view:'plugin',exists:true,truncated:false,text:'中文日志\n"quoted" \\path\nXU6J03M6\n'};
const wire='FSSLOG1:'+Buffer.from(JSON.stringify(logPayload),'utf8').toString('base64');
// The legacy server inserts result bytes into quotes without JSON escaping.
const legacyEnvelope=JSON.parse('{"result":"'+wire+'"}');
assert.deepEqual(viewer.decode(legacyEnvelope.result),logPayload);tests++;
assert.deepEqual(viewer.decode(JSON.stringify(logPayload)),logPayload);tests++;
assert.throws(()=>viewer.decode('FSSLOG1:@@bad'));tests++;
function fixture(){
    const requests=[],renders=[],errors=[],timers=new Map();let active=true,serial=0;
    const instance=viewer.create({isActive:()=>active,request:(view,success,failure)=>{const request={view,success,failure,aborted:false};requests.push(request);return {abort(){request.aborted=true;failure();}};},render:(...args)=>renders.push(args),error:e=>errors.push(e),setTimer:(fn,delay)=>{timers.set(++serial,{fn,delay});return serial;},clearTimer:id=>timers.delete(id)});
    return {instance,requests,renders,errors,timers,setActive:a=>active=a,tick(){const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();}};
}
let f=fixture();f.instance.start('plugin');let stale=f.requests[0];f.instance.start('subscribe');
stale.success({view:'plugin',text:'old'});assert.equal(f.renders.length,0);assert.equal(stale.aborted,true);tests++;
f.requests[1].success({view:'subscribe',text:'new\nXU6J03M6\n'});assert.equal(f.renders[0][0],'new\n');assert.equal(f.timers.size,1);tests++;
for(let i=0;i<10;i++){f.tick();f.requests.at(-1).success({view:'subscribe',text:'unchanged'});}assert.equal(f.timers.size,1);tests++;
f.instance.stop();assert.equal(f.timers.size,0);f.requests.at(-1).success({view:'subscribe',text:'late'});assert.notEqual(f.renders.at(-1)[0],'late');tests++;
f=fixture();f.instance.start('plugin');f.requests[0].failure();assert.equal(f.errors.length,1);f.tick();f.requests[1].success({view:'plugin',text:'recovered'});assert.equal(f.renders[0][0],'recovered');tests++;
f=fixture();f.instance.start('plugin');f.requests[0].success({view:'subscribe',text:'wrong view'});assert.equal(f.renders.length,0);assert.equal(f.errors.length,1);tests++;
f=fixture();f.instance.start('plugin');f.setActive(false);f.requests[0].success({view:'plugin',text:'hidden'});assert.equal(f.renders.length,0);assert.equal(f.timers.size,0);tests++;
assert.equal(viewer.clean('text XU6J03M6 here\nXU6J03M6\nend'),'text XU6J03M6 here\nend');tests++;
const html=fs.readFileSync(root+'/webs/Module_shadowsocks.asp','utf8');
// Merlin httpd treats CSS query strings as part of the filename and returns 404.
for(const link of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)){assert.doesNotMatch(link[0],/href=["'][^"']*\?/);tests++;}
for(const block of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/src=/.test(block[1])){new vm.Script(block[2].replace(/<%[\s\S]*?%>/g,'0'));tests++;}}
for(const file of ['ss-menu.js','ac3100-log-viewer.js']){new vm.Script(fs.readFileSync(root+'/res/'+file,'utf8'));tests++;}
assert.doesNotMatch(html,/fancyss_msg\.json|ads_url_1|123s\.co|packages\/version\.json\.js/);tests++;
assert.match(html,/tablet_10.*style\.display/);tests++;
// Exercise the shared poller's actual callbacks: reset/abort must ignore old
// operation results, even if the old server response arrives after a new request.
const functions=html.slice(html.indexOf('function get_text_file_poll_state('),html.indexOf('function push_data(script,'));
const calls=[];const ctx={textFilePollStates:{},setTimeout:()=>1,clearTimeout:()=>{},$: {extend:Object.assign,ajax:opts=>{calls.push(opts);return {abort:()=>opts.error({})};}}};vm.createContext(ctx);vm.runInContext(functions,ctx);
let oldCount=0,newCount=0;ctx.poll_text_file({key:'test',reset:true,url:'/old',onSuccess:()=>{oldCount++;}});ctx.poll_text_file({key:'test',reset:true,url:'/new',onSuccess:()=>{newCount++;}});calls[0].success('old');calls[1].success('new');assert.equal(oldCount,0);assert.equal(newCount,1);tests++;
// Exercise form validation with nested settings and malformed user input.
const validateSource=html.slice(html.indexOf('function validate_xhttp_extra('),html.indexOf('function version_show()'));
const fields={xray_use_json:{checked:false},xray_network:{value:'xhttp'},xray_xhttp_extra:{value:''}};
const extraContext={E:id=>fields[id.replace('test_','')],alert:()=>{}};
vm.createContext(extraContext);vm.runInContext(validateSource,extraContext);
for(const [value,ok] of [['',true],['{"xPaddingObfsMode":true,"downloadSettings":{"address":"example.com"}}',true],['[]',false],['null',false],['{broken}',false]]) {
 fields.xray_xhttp_extra.value=value;assert.equal(extraContext.validate_xhttp_extra('test_'),ok);tests++;
}
const countdownSource=html.slice(html.indexOf('function count_down_close()'),html.indexOf('function reload_Soft_Center()'));
let now=10000,hidden=0,clockId=0;const clockTasks=new Map();const closeFields={};
const closeCtx={Date:{now:()=>now},Math,E:id=>closeFields[id]||(closeFields[id]={style:{}}),realtimeCloseTimer:null,realtimeOperationId:'old',realtimeLogStartTimer:null,clear_text_file_poll_state:()=>{},hideSSLoadingBar:()=>hidden++,setTimeout:(fn,ms)=>{clockTasks.set(++clockId,{fn,at:now+ms});return clockId;},clearTimeout:id=>clockTasks.delete(id)};
vm.createContext(closeCtx);vm.runInContext(countdownSource,closeCtx);
closeCtx.count_down_close();now+=1000;closeCtx.reset_operation_log();
for(const t of [...clockTasks.values()])t.fn();assert.equal(hidden,0);tests++;
closeCtx.count_down_close();const end=now+5000;while(clockTasks.size){const [id,t]=[...clockTasks.entries()].sort((a,b)=>a[1].at-b[1].at)[0];clockTasks.delete(id);now=t.at;if(now<end)assert.equal(hidden,0);t.fn();}assert.equal(now,end);assert.equal(hidden,1);tests++;
const realtimeSource=html.slice(html.indexOf('function get_realtime_log()'),html.indexOf('function count_down_close()'));
let realtimeOptions,completed=0;const operationFields={};
const operationCtx={realtimeOperationId:'new-operation',poll_text_file:o=>realtimeOptions=o,FssLogViewer:{decode:v=>v},E:id=>operationFields[id]||(operationFields[id]={style:{}}),count_down_close:()=>completed++,note_text_file_poll_progress:()=>{},console};
vm.createContext(operationCtx);vm.runInContext('String.prototype.myReplace=function(a,b){return this.split(a).join(b);};'+realtimeSource,operationCtx);operationCtx.get_realtime_log();
assert.equal(realtimeOptions.onSuccess({result:{operation:'old-operation',text:'old log\nXU6J03M6'}},{}).done,false);assert.equal(completed,0);tests++;
assert.equal(realtimeOptions.onSuccess({result:{operation:'new-operation',text:'current log\nXU6J03M6'}},{}).done,true);assert.equal(completed,1);assert.match(operationFields.log_content3.value,/current log/);tests++;
console.log(`${tests} UI checks passed: cancellation, stale results, retries, continued refresh, poller and syntax.`);

// Exercise the actual router escaping command through stdin (Windows -c quoting differs).
const statusShell=fs.readFileSync(root+'/scripts/ss_status.sh','utf8');
const statusSed=statusShell.match(/http_response "\$\(printf '%s' "\$\{payload\}" \| (sed [^\n]+?)\)"/)[1];
const statusText='foreign <font color="#FF0000">timeout</font>@@local 65 ms';
const statusEscaped=require('child_process').execFileSync(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash',['-s'],{input:"printf '%s' '"+statusText+"' | "+statusSed+"\n",encoding:'utf8'});
assert.equal(JSON.parse('{"result":"'+statusEscaped+'"}').result,statusText);
console.log('Legacy status JSON escape check passed.');

assert.doesNotMatch(html,/RT-AC3100 兼容检测|性能优化/);


assert.match(html,/#tablet_11 \.xwt-counter \{ color:#eee !important; \}/);
assert.match(html,/#tablet_11 strong, #tablet_11 \.xwt-counter-value \{ color:#ffcc00 !important; \}/);

// Runtime-tab entry checks online once; rendering and other tabs never poll GitHub.
const releaseFields={},releaseRequests=[],updateCalls=[];
function releaseQuery(id){return {text(value){releaseFields[id]=value;return this;},attr(key,value){releaseFields[id+':'+key]=value;return this;}};}
releaseQuery.ajax=o=>releaseRequests.push(o);
const releaseCtx={window:{FANCYSS_AC3100:{version:'0.1.3'}},$:releaseQuery,Math,db_ss:{},push_data:(...a)=>updateCalls.push(a)};
vm.createContext(releaseCtx);
vm.runInContext(html.slice(html.indexOf('function is_newer_release('),html.indexOf('function message_show()')),releaseCtx);
vm.runInContext(html.slice(html.indexOf('function update_ss()'),html.indexOf('function tabSelect(')),releaseCtx);
releaseCtx.version_show();assert.equal(releaseRequests.length,0);assert.equal(releaseFields['#updateVersion'],'v0.1.3');
releaseCtx.check_release_once();releaseCtx.check_release_once();assert.equal(releaseRequests.length,1);
assert.equal(JSON.parse(releaseRequests[0].data).params[0],'check');
releaseRequests[0].success({result:'v0.1.4'});assert.equal(releaseFields['#updateVersion'],'v0.1.4');
assert.equal(releaseFields['#updateBtn'],'\u7acb\u5373\u66f4\u65b0');
releaseCtx.version_show();assert.equal(releaseFields['#updateVersion'],'v0.1.4');
releaseCtx.update_ss();assert.equal(updateCalls[0][0],'ss_update.sh');assert.equal(updateCalls[0][1],'update');
for(const tag of ['v0.1.3','v0.1.2','unavailable']){releaseRequests[0].success({result:tag});assert.equal(releaseFields['#updateVersion'],'v0.1.3');}
releaseRequests[0].error();releaseCtx.check_release_once();assert.equal(releaseRequests.length,1);
assert.match(html,/11: function\(\).*check_release_once\(\)/);
console.log('Release checks passed: one check per page, separate version, upgrade comparison and update action.');

assert.doesNotMatch(html,/ssrTitle|rss_protocol|rss_obfs|shadowsocksR|proto-ssr/);
const protocolContext={save_flag:'',applyNodeVisibility(){},E:id=>{assert.notEqual(id,'ssrTitle');return {};}};
vm.createContext(protocolContext);vm.runInContext(html.slice(html.indexOf('function tabclickhandler('),html.indexOf('function add_ss_node_conf(')),protocolContext);
for(const [type,flag] of [[0,'shadowsocks'],[3,'v2ray'],[4,'xray'],[5,'trojan'],[8,'hysteria2']])assert.equal(protocolContext.tabclickhandler(type),flag);
const subscriptionScript=fs.readFileSync(root+'/scripts/ss_node_subscribe.sh','utf8');
assert.doesNotMatch(subscriptionScript,/add_ssr_node|type_name="SSR"|supported\["ssr"\]/);
assert.doesNotMatch(fs.readFileSync(root+'/ss/ssconfig.sh','utf8'),/start_ssr|creat_ssr_json|run_bg rss-/);
console.log('Protocol checks passed: five editor tabs, no SSR fields or launchers.');

vm.runInContext(html.slice(html.indexOf('function get_node_display_type_label('),html.indexOf('function get_node_display_source_label(')),protocolContext);
for(const [node,label] of [[{type:'0'},'SS'],[{type:'3'},'VMess'],[{type:'4'},'VLESS'],[{type:'4',xray_prot:'vmess'},'VMess'],[{type:'5'},'Trojan'],[{type:'8'},'Hysteria2']])assert.equal(protocolContext.get_node_display_type_label(node),label);

assert.doesNotMatch(fs.readFileSync(root+'/scripts/ss_webtest.sh','utf8'),/test_07_sr|WT_SSR_THREADS|wt-rss-local/);

const formCtx={save_flag:'',getFieldChecked:()=>false,getFieldValue:()=>'',should_show_xray_flow:()=>false,get_node_table_xray_protocol:()=> 'vless'};
vm.createContext(formCtx);vm.runInContext(html.slice(html.indexOf('function getNodeCtx('),html.indexOf('function applyNodeVisibility(')),formCtx);
for(const [flag,server,pass] of [['shadowsocks',true,true],['v2ray',true,false],['xray',true,false],['trojan',true,false],['hysteria2',false,false]]) {
 formCtx.save_flag=flag;const state=formCtx.getNodeCtx();assert.equal(state.basic_server_on,server,flag);assert.equal(state.basic_pass_on,pass,flag);
}

const installSource=fs.readFileSync(root+'/install.sh','utf8');
const detailSource=fs.readFileSync(root+'/scripts/ss_proc_status.sh','utf8');
assert.doesNotMatch(installSource,/fancyss_arm_lite|hq450\/fancyss_history_package|echo_date.*\$\{PLVER\}/);
assert.match(installSource,/MAINT_VERSION=.*\/ss\/maintenance\.json/);
assert.match(detailSource,/CURR_VERS=.*\/ss\/maintenance\.json/);
assert.doesNotMatch(detailSource,/cat \/koolshare\/ss\/version/);

let statusPoll,shownStatus='';const detailCtx={poll_text_file:o=>{statusPoll=o;},set_proc_status_text:s=>{shownStatus=s;}};
vm.createContext(detailCtx);vm.runInContext(html.slice(html.indexOf('function write_proc_status('),html.indexOf('function get_online_nodes(action)')),detailCtx);
detailCtx.write_proc_status(123);
assert.equal(statusPoll.onSuccess('old report',{attempt:1}).done,false);
assert.equal(statusPoll.onSuccess('XWTSTATUS:122\nother report',{attempt:2}).done,false);
assert.equal(shownStatus,'');
assert.equal(statusPoll.onSuccess('XWTSTATUS:123\ncurrent report',{attempt:3}).done,true);
assert.equal(shownStatus,'current report');

// Account edits, staged node selection, and runtime changes have separate requests.
const proxyInputs={
    ss_basic_enable:{checked:false},ssconf_basic_node:{value:'3'},save_account_node_button:{},
    ss_basic_mode:{value:'2'},ss_basic_server:{value:'edited.example'},ss_basic_port:{value:'443'},
    ss_basic_password:{value:'test'},ss_basic_method:{value:'aes-128-gcm'},
    ss_basic_ss_obfs:{value:'0'},ss_basic_ss_obfs_host:{value:''}
};
const proxyCalls=[],accountRequests=[],proxyAlerts=[];
let previousNode='2',proxyNodes=['1','2','3'];
const proxyCtx={
    db_ss:{ss_basic_enable:'0',ss_basic_mode:'2'},pendingProxyNodeId:null,submit_flag:'0',accountNodeSaving:false,
    E:id=>proxyInputs[id],resolve_node_id:(id,blank)=>proxyNodes.includes(id)?id:blank?'':proxyNodes[0]||'',
    get_saved_current_node_id:()=>proxyNodes.includes(previousNode)?previousNode:proxyNodes[0]||'',
    get_node_identity:id=>'identity-'+id,get_node_persistent_mode:()=> '2',get_node_storage_schema:()=>2,
    is_shunt_supported_node:id=>id!=='3',show_shunt_node_block_layer:id=>proxyAlerts.push(id),
    get_shunt_supported_target_nodes:()=>proxyNodes.filter(id=>id!=='3').map(id=>({id})),
    get_saved_shunt_default_node_id:()=> 'DIRECT',is_shunt_direct_target:id=>id==='DIRECT',
    get_compare_store:()=>({}),compfilter:(_,fields)=>fields,set_ss_status_waiting:()=>{},
    push_data:(method,action,fields)=>proxyCalls.push(JSON.parse(JSON.stringify({method,action,fields}))),
    should_save_main_panel_node:id=>id==='3',get_node_type:()=> '0',Base64:{encode:x=>x},
    build_schema2_upsert_fields:(fields,id)=>({['fss_node_'+id]:JSON.stringify(fields)}),
    build_schema2_postsave_request:(id,fields)=>({id,method:'ss_node_postsave.sh',params:['rebuild','3'],fields}),
    schedule_schema2_node_direct_refresh:()=>{},invalidate_schema2_webtest_results:()=>{},
    refresh_table:cb=>cb(true),alert:message=>proxyAlerts.push(message),
    $:{ajax:request=>accountRequests.push(request)}
};
vm.createContext(proxyCtx);
vm.runInContext(html.slice(html.indexOf('function get_checked_proxy_node_id('),html.indexOf('function render_allow_insecure_notice(')),proxyCtx);
vm.runInContext(html.slice(html.indexOf('function collect_main_panel_node_fields('),html.indexOf('function save()')),proxyCtx);
const resetProxy=()=>{proxyCtx.submit_flag='0';proxyInputs.ss_basic_enable.checked=false;};
proxyCtx.pendingProxyNodeId='3';
proxyCtx.set_proxy_enabled(true);
assert.deepEqual(proxyCalls.at(-1),{method:'ss_config.sh',action:'start',fields:{
    ss_basic_enable:'1',fss_node_current:'3',fss_node_current_identity:'identity-3',ss_basic_mode:'2'
}});
proxyCtx.set_proxy_enabled(false);
assert.equal(proxyCalls.length,1);
resetProxy();
proxyCtx.pendingProxyNodeId='';
proxyCtx.set_proxy_enabled(true);
assert.equal(proxyCalls.at(-1).fields.fss_node_current,'2');
resetProxy();
previousNode='99';proxyCtx.pendingProxyNodeId='99';
proxyCtx.set_proxy_enabled(true);
assert.equal(proxyCalls.at(-1).fields.fss_node_current,'1');
resetProxy();
proxyCtx.db_ss.ss_basic_enable='1';
proxyCtx.set_proxy_enabled(false);
assert.deepEqual(proxyCalls.at(-1),{method:'ss_config.sh',action:'stop',fields:{ss_basic_enable:'0'}});
resetProxy();
proxyCtx.db_ss.ss_basic_mode='7';proxyCtx.db_ss.ss_basic_enable='0';proxyCtx.pendingProxyNodeId='3';
proxyCtx.set_proxy_enabled(true);
assert.equal(proxyAlerts.at(-1),'3');
proxyCtx.pendingProxyNodeId='';
proxyCtx.set_proxy_enabled(true);
assert.equal(proxyCalls.at(-1).fields.ss_basic_mode,'7');
assert.equal(Object.hasOwn(proxyCalls.at(-1).fields,'ss_basic_shunt_default_node'),false);
resetProxy();
proxyNodes=[];
const callsBeforeEmpty=proxyCalls.length;
proxyCtx.set_proxy_enabled(true);
assert.equal(proxyCalls.length,callsBeforeEmpty);
assert.equal(proxyInputs.ss_basic_enable.checked,false);
proxyNodes=['1','2','3'];
proxyCtx.db_ss.ss_basic_mode='2';
proxyCtx.pendingProxyNodeId='1';
proxyCtx.save_and_apply_account_node();
assert.equal(proxyInputs.ss_basic_enable.disabled,true);
const accountRequest=JSON.parse(accountRequests[0].data);
assert.deepEqual(Object.keys(accountRequest.fields),['fss_node_3']);
const savedNode=JSON.parse(accountRequest.fields.fss_node_3);
assert.equal(savedNode.ssconf_basic_server_3,'edited.example');
assert.equal(savedNode.ssconf_basic_ss_obfs_3,'');
assert.equal(proxyCalls.length,callsBeforeEmpty);
accountRequests[0].success({result:accountRequest.id});
assert.equal(proxyInputs.ss_basic_enable.disabled,false);
assert.equal(proxyCalls.length,callsBeforeEmpty+1);
assert.equal(proxyCalls.at(-1).fields.fss_node_current,'3');
resetProxy();
proxyCtx.save_and_apply_account_node();
accountRequests[1].error();
assert.equal(proxyInputs.ss_basic_enable.disabled,false);
assert.equal(proxyCalls.length,callsBeforeEmpty+1);
proxyCtx.compfilter=(_,fields)=>fields.fss_node_3?{}:fields;
proxyCtx.save_and_apply_account_node();
assert.equal(accountRequests.length,2);
assert.equal(proxyCalls.at(-1).fields.fss_node_current,'3');
assert.match(html,/onclick="set_proxy_enabled\(true\)" value="应用"/);
assert.match(html,/onclick="save_and_apply_account_node\(\)" value="保存&应用"/);
console.log('Proxy controls passed: selection fallback, runtime-only requests, account save and apply, and shunt guards.');
