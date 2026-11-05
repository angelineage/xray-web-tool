const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const text={},requests=[],timers=new Map(),listeners={};
let visible=true,serial=0,now=1000;
class Clock extends Date { static now(){return now;} }
function $(selector){return {is:()=>visible,text:value=>{text[selector]=value;}};}
$.ajax=options=>{const request={options,aborted:false};requests.push(request);return {abort(){request.aborted=true;}};};
const window={addEventListener(){}};
const document={hidden:false,addEventListener:(name,fn)=>listeners[name]=fn};
const ctx={window,document,$,FssLogViewer:{decode:v=>v},Date:Clock,Math,clearTimeout:id=>timers.delete(id),setTimeout:(fn,delay)=>{timers.set(++serial,{fn,delay});return serial;}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../src/shadowsocks/res/xwt-dashboard.js','utf8'),ctx);
function reply(sample){const r=requests.at(-1);r.options.success({result:sample});r.options.complete();}
function tick(){const [id,t]=timers.entries().next().value;timers.delete(id);assert.ok(t.delay>=0&&t.delay<=1000);now+=t.delay;t.fn();}
const sample={pid:'42',start_ticks:100,name:'NRT-x',kind:'vless',network:'xhttp',rss_kb:40960,cpu_ticks:100,total_ticks:1000,cpus:2,uptime:100,traffic_available:true,upload:1000,download:2000};
window.XwtDashboard.start();now+=200;reply(sample);assert.equal(timers.values().next().value.delay,800);
assert.equal(text['#xwt-type'],'VLESS / XHTTP');assert.equal(text['#xwt-error'],'');assert.equal(text['#xwt-total-up'],'上传 1000 B');assert.equal(text['#xwt-total-down'],'下载 2.0 KiB');
assert.equal(text['#xwt-memory'],'40.0 MiB');assert.equal(text['#xwt-up'],'采样中…');
tick();reply({...sample,cpu_ticks:200,total_ticks:2000,uptime:105,upload:2000,download:4000});
assert.equal(text['#xwt-cpu'],'20.0%');assert.equal(text['#xwt-up'],'200 B/s');assert.equal(text['#xwt-down'],'3.2 Kbps');
tick();reply({...sample,pid:'43',start_ticks:200,upload:10,download:20});
assert.equal(text['#xwt-up'],'采样中…');assert.equal(text['#xwt-cpu'],'采样中…');
tick();const stale=requests.at(-1);window.XwtDashboard.stop();assert.equal(stale.aborted,true);assert.equal(timers.size,0);
const prior=text['#xwt-node'];stale.options.success({result:{...sample,name:'stale'}});assert.equal(text['#xwt-node'],prior);
window.XwtDashboard.start();reply({...sample,traffic_available:false});assert.equal(text['#xwt-up'],'统计不可用');
document.hidden=true;listeners.visibilitychange();assert.equal(timers.size,0);
document.hidden=false;visible=false;listeners.visibilitychange();assert.equal(timers.size,0);
console.log('Dashboard checks passed: rates, CPU, RSS, restarts, stale responses and hidden-page cancellation.');

const dashboardSource=fs.readFileSync(__dirname+'/../src/shadowsocks/res/xwt-dashboard.js','utf8');
const formatContext={};vm.createContext(formatContext);
vm.runInContext(dashboardSource.slice(dashboardSource.indexOf('    function bitsPerSecond'),dashboardSource.indexOf('    function active')),formatContext);
for(const [bytes,expected] of [[0,'0 bps'],[1,'8 bps'],[125,'1.0 Kbps'],[125000,'1.0 Mbps'],[125000000,'1.0 Gbps']])assert.equal(formatContext.bitsPerSecond(bytes),expected);
