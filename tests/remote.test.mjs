import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey, verify, createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Account, Remote, execute, verifiedWrite, validateWritePath, makeSigner, secureOrigin, withRpc } from '../skills/remote-environment/scripts/remote.mjs';
const identity = { id:'test-user',email:'test@example.invalid',name:null,image:null };
const fake = (body, status=200) => new Response(JSON.stringify(body), {status});
const temporary = () => mkdtemp(join(tmpdir(),'lstack-test-'));
async function seed(directory, expiresAt = 0) {
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'grant.json'),JSON.stringify({version:1,issuer:'https://accounts.test/v1/auth',resource:'https://relay.test',accessToken:'old-access',refreshToken:'old-refresh',expiresAt}),{mode:0o600});
}

test('refresh coalesces across adapters and persists rotation before access; identity verified remotely', async t => {
  const directory=await temporary(); t.after(()=>rm(directory,{recursive:true})); await seed(directory);
  let refreshes=0;
  t.mock.method(globalThis,'fetch',async (url,init) => {
    if (url.endsWith('/oauth2/token')) {
      refreshes++; assert.equal(init.body.get('refresh_token'),'old-refresh');
      return fake({access_token:'new-access',refresh_token:'latest-refresh',expires_in:3600,token_type:'Bearer'});
    }
    assert.equal(init.headers.authorization,'Bearer new-access'); return fake(identity);
  });
  const a=new Account(directory,'https://accounts.test/v1/auth','https://relay.test');
  const b=new Account(directory,'https://accounts.test/v1/auth','https://relay.test');
  const tokens=await Promise.all([a.getAccessToken(),b.getAccessToken(),a.getAccessToken()]);
  assert.equal(refreshes,1); assert.ok(tokens.every(x=>x.accessToken==='new-access'));
  assert.equal(JSON.parse(await readFile(join(directory,'grant.json'),'utf8')).refreshToken,'latest-refresh');
  assert.equal((await stat(join(directory,'grant.json'))).mode&0o777,0o600);
  assert.deepEqual(await a.getIdentity(),identity);
});

test('logout revokes only latest lstack refresh token; failure retains store',async t=>{
  const directory=await temporary(); t.after(()=>rm(directory,{recursive:true})); await seed(directory,Date.now()+3600000);
  let status=503;
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    assert.equal(url,'https://accounts.test/v1/auth/oauth2/revoke');
    assert.equal(init.body.get('token'),'old-refresh'); assert.equal(init.body.get('client_id'),'otter-code-cli');
    return new Response('',{status});
  });
  const a=new Account(directory,'https://accounts.test/v1/auth','https://relay.test');
  await assert.rejects(a.revoke(),/retained/); await stat(join(directory,'grant.json'));
  status=200; await a.revoke(); await assert.rejects(stat(join(directory,'grant.json')),{code:'ENOENT'});
});

test('missing sign-in never starts device grant',async t=>{
  const directory=await temporary(); t.after(()=>rm(directory,{recursive:true}));
  t.mock.method(globalThis,'fetch',()=>{throw Error('must not request');});
  await assert.rejects(new Account(directory).getAccessToken(),/Sign in explicitly/);
});

test('device login uses its own grant and honors pending + slow_down interval',async t=>{
  const directory=await temporary(); t.after(()=>rm(directory,{recursive:true}));
  let poll=0;
  t.mock.timers.enable({apis:['setTimeout','Date'],now:100000});
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    assert.equal(init.body.get('client_id'),'otter-code-cli');
    if (url.endsWith('/device/code')) return fake({device_code:'private-device',user_code:'ABC',verification_uri:'https://accounts.test/device',expires_in:60,interval:1});
    poll++; if(poll===1) return fake({error:'authorization_pending'},400);
    if(poll===2) return fake({error:'slow_down'},400);
    return fake({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'Bearer'});
  });
  const account=new Account(directory,'https://accounts.test/v1/auth','https://relay.test');
  let prompt;
  const login=account.login(code=>{prompt=code;});
  // Flush filesystem I/O before advancing the issuer's polling clock.
  while (!prompt) await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(prompt,{verificationUri:'https://accounts.test/device',userCode:'ABC'});
  t.mock.timers.tick(1000); while(poll<1) await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(1000); while(poll<2) await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(5999); await new Promise(resolve=>setImmediate(resolve)); assert.equal(poll,2);
  t.mock.timers.tick(1); await login; assert.equal(poll,3);
  assert.equal((await account.getAccessToken()).accessToken,'test-access');
});

test('DPoP proofs bind method, normalized URL, token hash and public key',()=>{
  const signer=makeSigner(), proof=signer.proof('POST','https://target.test/oauth/token?q=x#fragment','access');
  const [head,payload,signature]=proof.split('.'), header=JSON.parse(Buffer.from(head,'base64url')), claims=JSON.parse(Buffer.from(payload,'base64url'));
  assert.equal(claims.htm,'POST'); assert.equal(claims.htu,'https://target.test/oauth/token');
  assert.equal(claims.ath,createHash('sha256').update('access').digest('base64url'));
  assert.equal(header.jwk.d,undefined);
  assert.ok(verify('sha256',Buffer.from(`${head}.${payload}`),{key:createPublicKey({key:header.jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
  assert.notEqual(proof,signer.proof('POST','https://target.test/oauth/token','access'));
});

test('unselected/missing destinations and insecure endpoints stop before bootstrap',async t=>{
  let calls=0;
  const remote=new Remote({getAccessToken:async()=>({accessToken:'account-A'})},'https://relay.test');
  t.mock.method(globalThis,'fetch',async()=>{calls++;return fake({environments:[]});});
  await assert.rejects(remote.target('missing'),/not in this account/); assert.equal(calls,1);
  for(const url of ['http://host','https://user:pass@host','https://host/?token=secret']) assert.throws(()=>secureOrigin(url));
});

test('write verification rejects truncated/different readback and never repeats mutation',async()=>{
  let writes=0;
  const api={write:async()=>{writes++;},read:async()=>({contents:'wrong',truncated:false})};
  await assert.rejects(verifiedWrite(api,{cwd:'/repo',relativePath:'file',contents:'desired'}),/readback/); assert.equal(writes,1);
  api.read=async()=>({contents:'desired',truncated:true});
  await assert.rejects(verifiedWrite(api,{cwd:'/repo',relativePath:'file',contents:'desired'}),/readback/);
  api.read=async()=>({contents:'desired',truncated:false});
  assert.equal((await verifiedWrite(api,{cwd:'/repo',relativePath:'file',contents:'desired'})).verified,true);
  for(const path of ['/etc/file','../file','a/../file','C:\\file','a//b']) assert.throws(()=>validateWritePath(path));
});

function terminalMock(mode='success') {
  let listener, calls=[];
  const api={
    open:async input=>{calls.push(['open',input]);},
    observe(input,callback){listener=callback;queueMicrotask(()=>callback({type:'snapshot',snapshot:{}}));return{done:new Promise(()=>{}),cancel:()=>calls.push(['cancel'])};},
    send:async input=>{
      calls.push(['send',input]);
      if(mode==='disconnect') throw Error('socket lost');
      if(mode==='timeout') return;
      const uuid=/\\036([^']+)\\037/.exec(input.data)[1];
      listener({type:'output',data:`shell echo\r\n\x1e${uuid.slice(0,12)}`});
      listener({type:'output',data:`${uuid.slice(12)}\x1fhello\r\n`});
      listener({type:'exited',exitCode:7,exitSignal:null});
    },close:async input=>{calls.push(['close',input]);},
  };return{api,calls};
}
test('command owns terminal, strips startup echo across chunks and preserves nonzero exit',async()=>{
  const {api,calls}=terminalMock();
  const result=await execute(api,'darwin',{cwd:'/repo',command:"printf '%s' 'hello'",timeoutMs:1000,maxOutputBytes:1024});
  assert.deepEqual(result,{exitCode:7,exitSignal:null,output:'hello\r\n'});
  assert.equal(calls.filter(x=>x[0]==='send').length,1);
  assert.match(calls[0][1].terminalId,/^lstack-/); assert.equal(calls.at(-1)[1].deleteHistory,true);
});
test('disconnect and timeout report unknown, clean up and never replay',async()=>{
  for(const mode of ['disconnect','timeout']) {
    const {api,calls}=terminalMock(mode);
    await assert.rejects(execute(api,'linux',{cwd:'/repo',command:'touch file',timeoutMs:20,maxOutputBytes:1024}),error=>error.outcome==='unknown');
    assert.equal(calls.filter(x=>x[0]==='send').length,1); assert.equal(calls.at(-1)[0],'close');
  }
});
test('unsupported platform refuses command before opening terminal',async()=>{
  const {api,calls}=terminalMock();await assert.rejects(execute(api,'windows',{cwd:'C:',command:'echo hello',timeoutMs:100,maxOutputBytes:1024}),/Linux and macOS/);assert.deepEqual(calls,[]);
});

test('real Effect client encodes unary calls, streams chunks and acknowledges them',{timeout:5000},async t=>{
  const server=new WebSocketServer({port:0,host:'127.0.0.1'});
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{for(const socket of server.clients) socket.terminate();server.close(resolve);}));
  let acknowledged=false;
  server.on('connection',socket=>socket.on('message',raw=>{
    const parsed=JSON.parse(raw.toString());
    for(const message of Array.isArray(parsed)?parsed:[parsed]) {
      if(message._tag==='Ping'){socket.send(JSON.stringify({_tag:'Pong'}));continue;}
      if(message._tag==='Ack'){acknowledged=true;continue;}
      if(message._tag!=='Request')continue;
      if(message.tag==='projects.readFile')socket.send(JSON.stringify({_tag:'Exit',requestId:message.id,exit:{_tag:'Success',value:{relativePath:message.payload.relativePath,contents:'mock',byteLength:4,truncated:false}}}));
      if(message.tag==='terminal.observe')socket.send(JSON.stringify({_tag:'Chunk',requestId:message.id,values:[{type:'output',threadId:'test',terminalId:'term',data:'event'}]}));
    }
  }));
  await withRpc(`ws://127.0.0.1:${server.address().port}`,async api=>{
    assert.equal((await api.read({cwd:'/repo',relativePath:'file'})).contents,'mock');
    let observed;
    const ready=Promise.withResolvers();
    const observer=api.observe({threadId:'test',terminalId:'term'},event=>{observed=event;ready.resolve();});
    await ready.promise;assert.equal(observed.data,'event');
    // A unary round trip lets the ACK preceding it reach the mock peer.
    await api.read({cwd:'/repo',relativePath:'file'});assert.equal(acknowledged,true);observer.cancel();
  });
});

test('foreground wrapper runs shell quoting correctly and returns actual process exit',async()=>{
  const {spawn}=await import('node:child_process');
  let child,listener;
  const api={
    open:async()=>{child=spawn('/bin/sh',[],{stdio:['pipe','pipe','pipe']});},
    observe(input,callback){
      listener=callback;
      child.stdout.on('data',data=>callback({type:'output',data:data.toString()}));
      child.stderr.on('data',data=>callback({type:'output',data:data.toString()}));
      child.on('exit',(exitCode,exitSignal)=>callback({type:'exited',exitCode,exitSignal}));
      queueMicrotask(()=>callback({type:'snapshot',snapshot:{}}));
      return{done:new Promise(()=>{}),cancel(){}};
    },
    send:async({data})=>{child.stdin.end(data);},
    close:async()=>{if(child.exitCode===null)child.kill();},
  };
  const result=await execute(api,'linux',{cwd:'/tmp',command:"printf '%s\\n' \"quote ' and dollar \\$ survive\"; exit 23",timeoutMs:2000,maxOutputBytes:1024});
  assert.equal(result.exitCode,23);assert.match(result.output,/quote ' and dollar \$ survive/);
});

test('output limit reports unknown and closes only its own terminal',async()=>{
  const{api,calls}=terminalMock();
  await assert.rejects(execute(api,'linux',{cwd:'/repo',command:'echo hello',timeoutMs:100,maxOutputBytes:1}),error=>error.outcome==='unknown');
  assert.equal(calls.at(-1)[0],'close');assert.equal(calls[0][1].terminalId,calls.at(-1)[1].terminalId);
});

test('bootstrap validates destination origin and binds DPoP without sending A to target',async t=>{
  const endpoint={providerKind:'cloudflare_tunnel',httpBaseUrl:'https://target.test',wsBaseUrl:'wss://target.test/ws'};
  const environment={environmentId:'test-environment',label:'Mock host',endpoint,linkedAt:'2026-10-16T00:00:00Z'};
  const trace=[];
  t.mock.method(globalThis,'fetch',async(url,init={})=>{
    trace.push({url,init});
    if(url.endsWith('/v1/environments'))return fake({environments:[environment]});
    if(url.endsWith('/dpop-token')){
      assert.equal(init.body.get('subject_token'),'account-A');assert.equal(init.body.get('client_id'),'t3-web');
      return fake({access_token:'relay-dpop',issued_token_type:'urn:ietf:params:oauth:token-type:access_token',token_type:'DPoP',expires_in:300,scope:'environment:connect environment:status'});
    }
    if(url.endsWith('/connect')){
      assert.ok(JSON.parse(init.body).clientProofKeyThumbprint);assert.equal(init.headers.authorization,'DPoP relay-dpop');
      return fake({environmentId:'test-environment',endpoint,credential:'bootstrap-only',expiresAt:'2026-10-16T00:01:00Z'});
    }
    if(url.endsWith('/.well-known/t3/environment')) return fake({environmentId:'test-environment',label:'Mock host',platform:{os:'linux',arch:'x64'},serverVersion:'test',orchestrationProtocolVersion:2,capabilities:{}});
    if(url.endsWith('/oauth/token')){
      assert.equal(init.body.get('subject_token'),'bootstrap-only');assert.equal(init.body.get('scope'),'filesystem:read');
      // Deliberately deny requested scope: no websocket or remote operation follows.
      return fake({access_token:'target-dpop',issued_token_type:'urn:ietf:params:oauth:token-type:access_token',token_type:'DPoP',expires_in:300,scope:'terminal:read'});
    }
    throw Error('Unexpected endpoint');
  });
  const remote=new Remote({getAccessToken:async()=>({accessToken:'account-A'})},'https://relay.test');
  await assert.rejects(remote.connected('test-environment',['filesystem:read'],()=>{throw Error('must not operate');}),/required DPoP scopes/);
  assert.equal(trace.length,5);
  assert.ok(trace.filter(x=>x.url.startsWith('https://target.test')).every(x=>!JSON.stringify(x.init.headers ?? {}).includes('account-A')));
});

test('full mocked flow resolves current tunnel from stale localhost discovery record', {timeout:5000}, async t=>{
  const server=new WebSocketServer({port:0,host:'127.0.0.1'});
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{for(const socket of server.clients)socket.terminate();server.close(resolve);}));
  server.on('connection',socket=>socket.on('message',raw=>{
    const parsed=JSON.parse(raw.toString());
    for(const msg of Array.isArray(parsed)?parsed:[parsed]){
      if(msg._tag==='Ping')socket.send(JSON.stringify({_tag:'Pong'}));
      if(msg._tag==='Request')socket.send(JSON.stringify({_tag:'Exit',requestId:msg.id,exit:{_tag:'Success',value:{relativePath:'file',contents:'verified mock',byteLength:13,truncated:false}}}));
    }
  }));
  const Original=globalThis.WebSocket;
  let socketUrl;
  t.mock.method(globalThis,'WebSocket',function(url){socketUrl=new URL(url);return new Original(`ws://127.0.0.1:${server.address().port}`);});
  const endpoint={providerKind:'cloudflare_tunnel',httpBaseUrl:'https://target.test',wsBaseUrl:'wss://target.test/ws'};
  let insecure=false;
  t.mock.method(globalThis,'fetch',async(url,init={})=>{
    if(url.endsWith('/v1/environments'))return fake({environments:[{environmentId:'target',label:'Test',endpoint:{providerKind:'manual',httpBaseUrl:'http://127.0.0.1:3773/',wsBaseUrl:'ws://127.0.0.1:3773/'},linkedAt:'now'}]});
    if(url.endsWith('/dpop-token'))return fake({access_token:'relay-token',issued_token_type:'urn:ietf:params:oauth:token-type:access_token',token_type:'DPoP',expires_in:300,scope:'environment:connect environment:status'});
    if(url.endsWith('/connect'))return fake({environmentId:'target',endpoint:insecure?{...endpoint,httpBaseUrl:'http://127.0.0.1:3773/'}:endpoint,credential:'bootstrap',expiresAt:'later'});
    if(url.endsWith('/.well-known/t3/environment'))return fake({environmentId:'target',label:'Test',platform:{os:'darwin',arch:'arm64'},serverVersion:'test',orchestrationProtocolVersion:2,capabilities:{}});
    if(url.endsWith('/oauth/token'))return fake({access_token:'target-token',issued_token_type:'urn:ietf:params:oauth:token-type:access_token',token_type:'DPoP',expires_in:300,scope:'filesystem:read'});
    if(url.endsWith('/websocket-ticket')){
      assert.equal(init.headers.authorization,'DPoP target-token');
      const payload=JSON.parse(Buffer.from(init.headers.dpop.split('.')[1],'base64url'));
      assert.equal(payload.htm,'POST');assert.equal(payload.htu,'https://target.test/api/auth/websocket-ticket');
      return fake({ticket:'synthetic-ticket',expiresAt:'2026-10-16T00:00:00Z'});
    }
    throw Error('Unexpected request');
  });
  const remote=new Remote({getAccessToken:async()=>({accessToken:'synthetic-A'})},'https://relay.test');
  const result=await remote.connected('target',['filesystem:read'],api=>api.read({cwd:'/repo',relativePath:'file'}));
  assert.equal(result.contents,'verified mock');assert.equal(socketUrl.origin,'wss://target.test');assert.equal(socketUrl.searchParams.get('wsTicket'),'synthetic-ticket');assert.equal(socketUrl.searchParams.get('orchestrationProtocol'),'2');
  insecure=true;
  await assert.rejects(remote.connected('target',['filesystem:read'],()=>assert.fail('insecure destination must not execute')),/HTTPS/);
});

test('relay denial reports known safe reason without reflecting server content',async t=>{
  const remote=new Remote({getAccessToken:async()=>({accessToken:'synthetic-A'})},'https://relay.test');
  const endpoint={providerKind:'manual',httpBaseUrl:'http://127.0.0.1:3773/',wsBaseUrl:'ws://127.0.0.1:3773/'};
  let reason='endpoint_provider_not_managed';
  t.mock.method(globalThis,'fetch',async(url)=>{
    if(url.endsWith('/v1/environments'))return fake({environments:[{environmentId:'target',label:'Test',endpoint,linkedAt:'now'}]});
    if(url.endsWith('/dpop-token'))return fake({access_token:'relay-token',issued_token_type:'urn:ietf:params:oauth:token-type:access_token',token_type:'DPoP',expires_in:300,scope:'environment:connect environment:status'});
    return fake({reason,error_description:'private-response-must-not-be-printed'},403);
  });
  await assert.rejects(remote.check('target'),error=>error.message.includes('endpoint_provider_not_managed')&&!error.message.includes('private-response'));
  reason='private-response-must-not-be-printed';
  await assert.rejects(remote.check('target'),error=>error.message.includes('HTTP 403')&&!error.message.includes('private-response'));
});
