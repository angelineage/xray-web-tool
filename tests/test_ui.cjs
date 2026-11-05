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
