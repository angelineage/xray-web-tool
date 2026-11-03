const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'../src/shadowsocks');
const viewer=require(root+'/res/ac3100-log-viewer.js');
let tests=0;
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
for(const block of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/src=/.test(block[1])){new vm.Script(block[2].replace(/<%[\s\S]*?%>/g,'0'));tests++;}}
for(const file of ['ss-menu.js','ac3100-log-viewer.js']){new vm.Script(fs.readFileSync(root+'/res/'+file,'utf8'));tests++;}
assert.doesNotMatch(html,/fancyss_msg\.json|ads_url_1|123s\.co|packages\/version\.json\.js/);tests++;
assert.match(html,/tablet_10.*style\.display/);tests++;
// Exercise the shared poller's actual callbacks: reset/abort must ignore old
// operation results, even if the old server response arrives after a new request.
const functions=html.slice(html.indexOf('function get_text_file_poll_state('),html.indexOf('function push_data(script,'));
const calls=[];const ctx={textFilePollStates:{},setTimeout:()=>1,clearTimeout:()=>{},$: {extend:Object.assign,ajax:opts=>{calls.push(opts);return {abort:()=>opts.error({})};}}};vm.createContext(ctx);vm.runInContext(functions,ctx);
let oldCount=0,newCount=0;ctx.poll_text_file({key:'test',reset:true,url:'/old',onSuccess:()=>{oldCount++;}});ctx.poll_text_file({key:'test',reset:true,url:'/new',onSuccess:()=>{newCount++;}});calls[0].success('old');calls[1].success('new');assert.equal(oldCount,0);assert.equal(newCount,1);tests++;
console.log(`${tests} UI checks passed: cancellation, stale results, retries, continued refresh, poller and syntax.`);
