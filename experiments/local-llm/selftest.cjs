'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {download,valid,safeFile,writeJson}=require('./download.cjs');
const {checkResources,withLock,delay,startServer}=require('./install.cjs');
const {validate}=require('./validate.cjs');
const manifest=require('./manifest.json'),cases=require('./cases.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=path.resolve(process.env.EXPERIMENT_TEST_HOME||path.join(os.tmpdir(),'care-local-llm-selftest'));
const results=[];async function test(name,fn){await fn();results.push({name,pass:true});console.log('PASS '+name);}
async function main(){await fsp.mkdir(root,{recursive:true});const body=Buffer.alloc(128*1024);for(let i=0;i<body.length;i++)body[i]=i%251;let resumeCount=0,rangeRequests=0;
 const server=http.createServer((req,res)=>{const offset=req.headers.range?Number(req.headers.range.match(/bytes=(\d+)-/)[1]):0;if(offset)rangeRequests++;
  if(req.url==='/resume'&&resumeCount++===0){res.writeHead(200,{'Content-Length':body.length});res.write(body.subarray(0,32768));setTimeout(()=>res.destroy(),200);return;}
  if(req.url==='/wrong'){res.writeHead(200);res.end(Buffer.alloc(body.length,99));return;}
  if(req.url==='/ignore-range'){res.writeHead(200,{'Content-Length':body.length});res.end(body);return;}
  res.writeHead(offset?206:200,{'Content-Length':body.length-offset,...(offset?{'Content-Range':`bytes ${offset}-${body.length-1}/${body.length}`}:{})});res.end(body.subarray(offset));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const item=(name,route='/ok')=>({file:name,url:url+route,bytes:body.length,sha256:hash(body)});
 try{
  await test('interrupted_download_resumes_verified_bytes',async()=>{const i=item('resume.bin','/resume'),r=await download(i,root,{testLocal:true});assert(await valid(r.file,i));assert(r.events.some(x=>x.startsWith('resumed_at_')));assert(rangeRequests>0);});
  await test('verified_download_reused_without_network',async()=>{const i=item('resume.bin','/resume'),r=await download(i,root,{testLocal:true});assert(r.reused);assert.equal(r.downloadedBytes,0);});
  await test('bad_hash_never_activated',async()=>{const i=item('bad.bin','/wrong');await assert.rejects(download(i,root,{testLocal:true,attempts:1}),/download_incomplete/);assert(!fs.existsSync(path.join(root,i.file)));});
  await test('stale_partial_identity_restarts',async()=>{const i=item('identity.bin'),p=path.join(root,i.file);await fsp.writeFile(p+'.part',Buffer.from('wrong model'));await fsp.writeFile(p+'.part.json','stale identity');const r=await download(i,root,{testLocal:true});assert(await valid(r.file,i));});
  await test('range_ignored_restarts_without_appending',async()=>{const i=item('ignored.bin','/ignore-range'),p=path.join(root,i.file);await fsp.writeFile(p+'.part',body.subarray(0,100));await fsp.writeFile(p+'.part.json',JSON.stringify({url:i.url,bytes:i.bytes,sha256:i.sha256}));const r=await download(i,root,{testLocal:true});assert(r.events.includes('server_ignored_range_restart'));assert(await valid(r.file,i));});
  await test('disk_shortage_stops_before_install_injected',async()=>{assert.throws(()=>checkResources({freeDisk:100,freeMemory:1000},101,100),/insufficient_disk/);});
  await test('memory_shortage_stops_before_start_injected',async()=>{assert.throws(()=>checkResources({freeDisk:1000,freeMemory:99},100,100),/insufficient_available_memory/);});
  await test('path_escape_refused',async()=>{assert.throws(()=>safeFile(root,'../outside'),/unsafe/);});
  await test('concurrent_install_refused_no_lock_loss',async()=>{await withLock(root,async()=>{await assert.rejects(withLock(root,async()=>{}),/install_already_running/);assert(fs.existsSync(path.join(root,'install.lock')));});assert(!fs.existsSync(path.join(root,'install.lock')));});
  await test('atomic_status_can_be_replaced',async()=>{const f=path.join(root,'atomic.json');await writeJson(f,{stage:'first'});await writeJson(f,{stage:'second'});assert.equal(JSON.parse(await fsp.readFile(f,'utf8')).stage,'second');});
  await test('old_request_result_rejected',async()=>{const c=cases[0];const answer={exportId:'an-older-job',inputHash:c.inputHash,provider:c.provider,result:{kind:'daily',day_summary:{text:'青い舟を折られました。',source_ids:['R1']},needs_review:[]}};assert.throws(()=>validate(answer,c),/enum/);});
  await test('wrong_client_input_hash_rejected',async()=>{const c=cases[3];const answer={exportId:c.jobId,inputHash:cases[0].inputHash,provider:c.provider,result:{kind:'daily',day_summary:{text:'花を見られました。',source_ids:['R1']},needs_review:[]}};assert.throws(()=>validate(answer,c),/enum/);});
  await test('invented_reference_rejected',async()=>{const c=cases[0],a={exportId:c.jobId,inputHash:c.inputHash,provider:c.provider,result:{kind:'daily',day_summary:{text:'青い舟を折られました。',source_ids:['R999']},needs_review:[]}};assert.throws(()=>validate(a,c),/unknown_source/);});
  await test('fabricated_direct_quote_rejected',async()=>{const c=cases[0],a={exportId:c.jobId,inputHash:c.inputHash,provider:c.provider,result:{kind:'daily',day_summary:{text:'「とても楽しかった」と話されました。',source_ids:['R1']},needs_review:[]}};assert.throws(()=>validate(a,c),/inexact_quotation/);});
  await test('fixtures_independent_and_fictional',async()=>{assert.equal(new Set(cases.map(c=>c.jobId)).size,cases.length);for(const c of cases){assert(c.fictional);assert.equal(hash(c.messages[1].content),c.inputHash);assert(!/gmail\.com|script\.google\.com|sk-proj-|AIza/.test(JSON.stringify(c)));}});
 }finally{await new Promise(r=>server.close(r));}
 const exe=process.env.EXPERIMENT_RUNTIME_EXE;
 if(exe)await test('actual_runtime_missing_model_fails_cleanly',async()=>{await assert.rejects(startServer({exe:path.resolve(exe),modelPath:path.join(root,'missing.gguf')},manifest,root,'failure'),/server_exited|ENOENT/);});
 const result={at:new Date().toISOString(),passed:results.length,results,limitations:['Download/network and resource failures use controlled synthetic inputs.','Actual full-model startup/restart occurs in run.cjs.']};
 const output=path.resolve(process.env.EXPERIMENT_RESULTS||path.join(__dirname,'results'));await fsp.mkdir(output,{recursive:true});await writeJson(path.join(output,'selftest.json'),result);console.log(JSON.stringify({passed:results.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
