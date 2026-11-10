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
function tick(){const [id,t]=timers.entries().next().value;timers.delete(id);assert(t.delay<=1000);now+=t.delay;t.fn();}
const sample={pid:'42',start_ticks:100,name:'NRT-x',ping:'58.493',kind:'vless',network:'xhttp',rss_kb:40960,cpu_ticks:100,total_ticks:1000,cpus:2,uptime:100,traffic_available:true,upload:1000,download:2000};
window.XwtDashboard.start();now+=200;reply(sample);assert.equal(timers.values().next().value.delay,800);
assert.equal(text['#xwt-type'],'VLESS / XHTTP');assert.equal(text['#xwt-error'],'');assert.equal(text['#xwt-total-up'],'1000 B');assert.equal(text['#xwt-total-down'],'2.0 KiB');
assert.equal(text['#xwt-node'],'NRT-x · 58 ms');
assert.equal(text['#xwt-memory'],'40.0 MiB');assert.equal(text['#xwt-up'],'采样中…');
tick();now+=200;reply({...sample,cpu_ticks:200,total_ticks:2000,uptime:101,upload:1200,download:2400});
assert.equal(text['#xwt-cpu'],'20.0%');assert.equal(text['#xwt-up'],'1.6 Kbps');assert.equal(text['#xwt-down'],'3.2 Kbps');
tick();now+=200;reply({...sample,uptime:102,traffic_available:false,upload:0,download:0});
assert.equal(text['#xwt-down'],'统计不可用');
tick();now+=200;reply({...sample,uptime:103,upload:100000000,download:1500000000});
assert.equal(text['#xwt-up'],'采样中…');assert.equal(text['#xwt-down'],'采样中…');
tick();now+=200;reply({...sample,uptime:101.01,upload:1000000000,download:2000000000});
assert.equal(text['#xwt-up'],'采样中…');assert.equal(text['#xwt-down'],'采样中…');
tick();now+=200;reply({...sample,pid:'43',start_ticks:200,upload:10,download:20});
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

assert.equal((dashboardSource.match(/bitsPerSecond\(\(s\.(upload|download)-previous\.\1\)\/elapsed\)/g)||[]).length,2);

// The graph keeps a rolling three-minute window and excludes gaps from peaks.
const chartNodes={'xwt-peak-up':{},'xwt-peak-down':{},'xwt-chart-detail':{}};
const drawnPaths=[];
let currentPath=[];
const drawing={setTransform(){},clearRect(){},beginPath(){currentPath=[];},moveTo(){currentPath.push('move');},lineTo(){currentPath.push('line');},quadraticCurveTo(){currentPath.push('curve');},stroke(){if(this.strokeStyle==='#55d9c5')drawnPaths.push(currentPath.slice());},fillText(){}};
const chartEvents={};
chartNodes['xwt-chart']={clientWidth:600,getContext:()=>drawing,addEventListener:(name,fn)=>chartEvents[name]=fn,getBoundingClientRect:()=>({left:0,width:600})};
const chartWindow={devicePixelRatio:1,addEventListener(){}};
const chartCtx={window:chartWindow,document:{getElementById:id=>chartNodes[id]},Date:Clock,Math,Infinity};
vm.createContext(chartCtx);
vm.runInContext(fs.readFileSync(__dirname+'/../src/shadowsocks/res/xwt-chart.js','utf8'),chartCtx);
chartWindow.XwtChart.add(125,250);
assert.equal(chartNodes['xwt-peak-up'].textContent,'1.0 Kbps');
assert.equal(chartNodes['xwt-peak-down'].textContent,'2.0 Kbps');
now+=3000;chartWindow.XwtChart.add(null,null);
assert.equal(chartNodes['xwt-peak-down'].textContent,'2.0 Kbps');
now+=3000;chartWindow.XwtChart.add(250,500);
now+=3000;chartWindow.XwtChart.add(375,750);
assert.deepEqual(drawnPaths.at(-1),['move','curve','line']);
now+=180001;chartWindow.XwtChart.add(10,20);
assert.equal(chartNodes['xwt-peak-up'].textContent,'80 bps');
assert.equal(chartNodes['xwt-peak-down'].textContent,'160 bps');
