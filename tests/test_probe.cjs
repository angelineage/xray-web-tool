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
  function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)]);}
  for(const file of files(root).filter(p=>p.endsWith('.sh'))){const result=spawnSync(bash,['-n',unix(file)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);tests++;}
  console.log(`${tests} probe and shell checks passed.`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
