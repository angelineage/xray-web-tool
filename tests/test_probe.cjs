const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac3100-probe-'));
const root=path.resolve(__dirname,'../src/shadowsocks');
const unix=p=>p.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const bash=process.env.BASH || (process.platform==='win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
let tests=0;
try{
  const fake=path.join(temp,'curl.sh'),runner=path.join(temp,'probe.sh');
  fs.writeFileSync(fake,'#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_ARGS"\nprintf "%s|0.0125" "$TEST_CODE"\nexit "$TEST_RC"\n');
  fs.writeFileSync(runner,`source '${unix(root)}/scripts/ss_probe_lib.sh'\nfss_probe_curl(){ printf '%s' '${unix(fake)}'; }\nfss_http_probe https://example.test "$TEST_PROXY" "$TEST_FAMILY"\n`);
  fs.chmodSync(fake,0o755);
  function check(rc,code,state,proxy='127.0.0.1:23456',family='any'){
    const args=path.join(temp,'args.txt');
    const result=spawnSync(bash,[unix(runner)],{encoding:'utf8',env:{...process.env,TEST_RC:String(rc),TEST_CODE:String(code),TEST_PROXY:proxy,TEST_FAMILY:family,TEST_ARGS:unix(args)}});
    assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),`${state}|13|${code}`);tests++;
    return fs.readFileSync(args,'utf8');
  }
  for(const [rc,code,state] of [[0,204,'ok'],[0,200,'ok'],[0,404,'http'],[5,'000','dns'],[6,'000','dns'],[7,'000','connect'],[28,'000','timeout'],[35,'000','tls'],[60,'000','tls'],[97,'000','proxy'],[2,'000','unavailable'],[4,'000','unavailable'],[126,'000','unavailable'],[127,'000','unavailable'],[52,'000','failed']])check(rc,code,state);
  assert.match(check(0,204,'ok'),/--socks5-hostname\n127\.0\.0\.1:23456/);
  assert.match(check(0,204,'ok','127.0.0.1:23456','6'),/-6\n--noproxy\n\n--socks5\n/);
  assert.match(check(0,204,'ok',''),/--noproxy\n\*/);
  const webtest=fs.readFileSync(path.join(root,'scripts/ss_webtest.sh'),'utf8');
  const generator=fs.readFileSync(path.join(root,'scripts/ss_webtest_gen.sh'),'utf8');
  const functionSource=(source,name)=>source.match(new RegExp('^'+name+'\\(\\) \\{[\\s\\S]*?^\\}','m'))[0];
  const dnsTest=spawnSync(bash,['-s'],{encoding:'utf8',input:`set -e
${functionSource(generator,'wt_get_server_addr')}
${functionSource(webtest,'wt_ensure_node_direct_dns_ready')}
_get_server_ip() { echo unexpected-early-resolution >&2; return 1; }
test "$(wt_get_server_addr node.example.test)" = node.example.test
test "$(wt_get_server_addr 192.0.2.1)" = 192.0.2.1
if wt_get_server_addr ""; then exit 1; fi
fss_refresh_node_direct_cache() { steps=cache; return "$cache_rc"; }
fss_node_direct_cache_differs_from_runtime() { return "$diff_rc"; }
fss_sync_node_direct_runtime() { steps="$steps sync"; }
dbus() {
  case "$2" in
    ss_basic_enable) echo "$enabled" ;;
    ss_basic_dns_plan) echo "$plan" ;;
  esac
}
sh() { test "$*" = "/koolshare/ss/ssconfig.sh refresh_node_direct_dns" && steps="$steps refresh"; }
cache_rc=1
if wt_ensure_node_direct_dns_ready; then exit 1; fi
test "$steps" = cache
cache_rc=0 diff_rc=1
wt_ensure_node_direct_dns_ready
test "$steps" = cache
diff_rc=0 enabled=0
wt_ensure_node_direct_dns_ready
test "$steps" = "cache sync"
enabled=1 plan=2
wt_ensure_node_direct_dns_ready
test "$steps" = "cache refresh"
plan=0
wt_ensure_node_direct_dns_ready
test "$steps" = "cache sync"
`});
  assert.equal(dnsTest.status,0,dnsTest.stderr);assert.equal(dnsTest.stderr,'');tests++;
  assert.equal([...webtest.matchAll(/^node_direct_refresh\)/gm)].length,1);tests++;
  function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)]);}
  for(const file of files(root).filter(p=>p.endsWith('.sh'))){const result=spawnSync(bash,['-n',unix(file)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);tests++;}
  console.log(`${tests} probe and shell checks passed.`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
