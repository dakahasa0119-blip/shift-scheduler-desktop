'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {install,startServer,delay}=require('./install.cjs');
const {writeJson}=require('./download.cjs');
const {validate}=require('./validate.cjs');
const {render}=require('./render.cjs');
const manifest=require('./manifest.json'),allCases=require('./cases.json');
const selectedIds=(process.env.EXPERIMENT_CASES||'').split(',').filter(Boolean);
if(selectedIds.some(id=>!allCases.some(c=>c.id===id)))throw new Error('unknown_experiment_case');
const cases=selectedIds.length?allCases.filter(c=>selectedIds.includes(c.id)):allCases;
const resultsDir=path.resolve(process.env.EXPERIMENT_RESULTS||path.join(__dirname,'results'));
const root=path.resolve(process.env.EXPERIMENT_HOME||path.join(os.tmpdir(),'care-local-llm-experiment'));
const results=[],report={startedAt:new Date().toISOString(),fictionalOnly:true,model:manifest.model,runtime:manifest.runtime,inference:manifest.inference,environment:{platform:process.platform,arch:process.arch,node:process.version,totalMemory:os.totalmem(),availableMemory:os.freemem(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,githubRun:process.env.GITHUB_RUN_ID||null},limits:['Prototype only; not an installed application provider','GitHub Windows runner has preinstalled tools; not a clean consumer laptop','Single model, one pass per fictional case; no clinical or statistical guarantee','No 8 GB laptop acceptance','Schema checks do not prove factual or linguistic correctness'],cases:results};
function log(event,data){console.log(JSON.stringify({event,...data}));}
function memoryMonitor(pid,tag){const file=path.join(resultsDir,'memory-'+tag+'.csv'),stop=path.join(resultsDir,'memory-'+tag+'.stop');const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'memory.ps1'),'-ServerPid',String(pid),'-OutputFile',file,'-StopFile',stop],{windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});child.on('error',()=>{});return {async stop(){await fsp.writeFile(stop,'stop');for(let i=0;i<30&&child.exitCode===null;i++)await delay(200);if(child.exitCode===null)child.kill();},file};}
async function generate(server,c){
 const template=await server.request('/apply-template',{messages:c.messages,add_generation_prompt:true});
 const tokenized=await server.request('/tokenize',{content:template.prompt,add_special:true});const inputTokens=tokenized.tokens.length;
 if(inputTokens+manifest.inference.maxOutputTokens+64>manifest.inference.contextTokens)throw new Error('context_budget_exceeded_no_truncation');
 const began=Date.now();log('case_started',{id:c.id,inputTokens});
 const pending=server.request('/v1/chat/completions',{model:'local',messages:c.messages,temperature:0,seed:manifest.inference.seed,max_tokens:manifest.inference.maxOutputTokens,stream:false,cache_prompt:false,response_format:{type:'json_object',schema:c.schema}},manifest.inference.requestTimeoutMs);
 if(!report.concurrentRecordSave){
  await delay(100);const at=Date.now();await writeJson(path.join(root,'fictional-record.json'),{client:'fictional-A',memo:'生成を待つ間に記録を保存',revision:2});
  report.concurrentRecordSave={actualDuringInference:true,ms:Date.now()-at,scope:'Prototype JSON store only; production UI not exercised'};
 }
 const raw=await pending,elapsedMs=Date.now()-began;await writeJson(path.join(resultsDir,c.id+'.raw.json'),raw);
 const text=raw.choices?.[0]?.message?.content;const entry={id:c.id,elapsedMs,inputTokens,usage:raw.usage,timings:raw.timings,finishReason:raw.choices?.[0]?.finish_reason};
 try{if(entry.finishReason!=='stop')throw new Error('generation_not_complete_'+entry.finishReason);entry.output=JSON.parse(text);entry.validation=validate(entry.output,c);}catch(e){entry.validation={structuralPass:false,error:e.message,semanticAcceptance:'not_accepted'};}
 log('case_finished',{id:c.id,elapsedMs,validation:entry.validation,usage:raw.usage});
 return entry;
}
async function main(){await fsp.mkdir(resultsDir,{recursive:true});let server,sampler;
 try{
  log('install_started',{model:manifest.model.name,bytes:manifest.model.bytes});report.install=await install(root,manifest);log('install_finished',{runtimeMs:report.install.runtime.ms,modelMs:report.install.model.ms,downloadedBytes:report.install.model.downloadedBytes});
  server=await startServer(report.install,manifest,resultsDir);report.firstStartupMs=server.ms;sampler=memoryMonitor(server.pid,'first');log('server_ready',{ms:server.ms});
  for(const c of cases){try{results.push(await generate(server,c));}catch(e){results.push({id:c.id,elapsedMs:0,error:e.message,validation:{structuralPass:false,semanticAcceptance:'not_accepted'}});log('case_failed',{id:c.id,error:e.message});}await writeJson(path.join(resultsDir,'report.json'),report);}
  await sampler.stop();sampler=null;await server.stop();server=null;
  const began=Date.now(),again=await install(root,{...manifest,experimentVersion:'2'});report.reinstall={ms:Date.now()-began,modelReused:again.model.reused,runtimeReused:again.runtime.reused,downloadedBytes:again.model.downloadedBytes+again.runtime.downloadedBytes,scope:'Application experiment version changed; pinned model/runtime unchanged'};
  server=await startServer(again,manifest,resultsDir,'restart');report.restartMs=server.ms;sampler=memoryMonitor(server.pid,'restart');
  const probe=await server.request('/v1/chat/completions',{model:'local',messages:[{role:'system',content:'Return the requested JSON only.'},{role:'user',content:'Return {"status":"ready"}.'}],temperature:0,max_tokens:32,cache_prompt:false,response_format:{type:'json_object',schema:{type:'object',properties:{status:{type:'string',enum:['ready']}},required:['status'],additionalProperties:false}}},60000);await writeJson(path.join(resultsDir,'restart-probe.raw.json'),probe);report.restartInference=JSON.parse(probe.choices[0].message.content).status==='ready';
  report.recordSurvivedRestart=JSON.parse(await fsp.readFile(path.join(root,'fictional-record.json'),'utf8')).revision===2;
  report.executionCompleted=true;
 }catch(e){report.executionCompleted=false;report.error=e.stack;process.exitCode=1;log('experiment_failed',{error:e.message});}
 finally{
  if(sampler)await sampler.stop();if(server)await server.stop();report.finishedAt=new Date().toISOString();
  const samples=[];for(const file of ['memory-first.csv','memory-restart.csv'])if(fs.existsSync(path.join(resultsDir,file))){const lines=(await fsp.readFile(path.join(resultsDir,file),'utf8')).trim().split(/\r?\n/).slice(1);for(const line of lines){const [,working,privateBytes,processPeak]=line.split(',');samples.push({working:Number(working),privateBytes:Number(privateBytes),processPeak:Number(processPeak)});}}
  report.memory={sampleCount:samples.length,maxSampledWorkingSetBytes:Math.max(0,...samples.map(x=>x.working)),maxSampledPrivateBytes:Math.max(0,...samples.map(x=>x.privateBytes)),sumProcessPeakWorkingSetUpperBound:Math.max(0,...samples.map(x=>x.processPeak)),measurement:'Windows process tree sampled every 2s; process peak counters included; not whole-system/application RAM'};
  await writeJson(path.join(resultsDir,'report.json'),report);render(cases,results,resultsDir);log('experiment_complete',{executionCompleted:report.executionCompleted,memory:report.memory,caseCount:results.length});
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
