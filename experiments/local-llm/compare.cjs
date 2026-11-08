'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {install,startServer,delay}=require('./install.cjs');
const {writeJson}=require('./download.cjs'),{validate}=require('./validate.cjs'),{render}=require('./render.cjs');
const profiles=require('./profiles.json'),allCases=require('./cases.json');
const profile=profiles.find(p=>p.id===process.env.EXPERIMENT_PROFILE);if(!profile)throw new Error('unknown_profile');
const caseIds=(process.env.EXPERIMENT_CASES||'daily-followup,daily-client-b,hint-open,monthly').split(',');
if(caseIds.some(id=>!allCases.some(c=>c.id===id)))throw new Error('unknown_case');
const cases=caseIds.map(id=>{const c=allCases.find(c=>c.id===id);return profile.promptVariant==='compact-v1'?{...c,messages:require('./compact-prompt.cjs').compactMessages(c)}:c;});
const dir=path.resolve(process.env.EXPERIMENT_RESULTS||path.join(__dirname,'results'));
const root=path.join(os.tmpdir(),'care-llm-'+profile.id),rows=[];
const report={startedAt:new Date().toISOString(),fictionalOnly:true,protocol:'comparison-1',promptVariant:profile.promptVariant||'product-original',profileId:profile.id,model:profile.model,runtime:profile.runtime,inference:profile.inference,profileNote:profile.note,environment:{platform:process.platform,arch:process.arch,node:process.version,totalMemory:os.totalmem(),availableMemory:os.freemem(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,githubRun:process.env.GITHUB_RUN_ID||null},cases:rows,limits:['Fictional screening only, not clinical or statistical validation','Different model families, native templates and documented sampling; not a pure parameter-count experiment','CPU host varies across runners; wall time is not an ordinary laptop guarantee','No production application integration or real care data','Schema acceptance does not prove factual or language quality']};
function log(event,data){console.log(JSON.stringify({at:new Date().toISOString(),event,...data}));}
function monitor(pid){const file=path.join(dir,'memory.csv'),stop=path.join(dir,'memory.stop');const p=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'memory.ps1'),'-ServerPid',String(pid),'-OutputFile',file,'-StopFile',stop],{windowsHide:true,stdio:'ignore'});p.on('error',()=>{});return async()=>{await fsp.writeFile(stop,'stop');for(let i=0;i<30&&p.exitCode===null;i++)await delay(200);if(p.exitCode===null)p.kill();};}
function parseFinal(text){if(typeof text!=='string')throw new Error('missing_final_text');let s=text.trim();if(s.startsWith('```')){const m=s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);if(!m)throw new Error('invalid_json_fence');s=m[1];}return JSON.parse(s);}
async function main(){await fsp.mkdir(dir,{recursive:true});let server,stopMonitor;
 try{
  log('install_started',{profile:profile.id,bytes:profile.model.bytes});report.install=await install(root,profile);log('install_finished',{modelMs:report.install.model.ms,bytes:report.install.model.downloadedBytes});
  server=await startServer(report.install,profile,dir);report.startupMs=server.ms;stopMonitor=monitor(server.pid);log('server_ready',{ms:server.ms});
  for(const c of cases){const began=Date.now(),entry={id:c.id,inputHash:c.inputHash||c.bundle?.inputHash,promptSha256:crypto.createHash('sha256').update(JSON.stringify(c.messages)).digest('hex')};
   try{
    const kwargs=Object.hasOwn(profile.inference,'enableThinking')?{enable_thinking:profile.inference.enableThinking}:{};
    const template=await server.request('/apply-template',{messages:c.messages,add_generation_prompt:true,chat_template_kwargs:kwargs}),tokens=await server.request('/tokenize',{content:template.prompt,add_special:true});
    entry.inputTokens=tokens.tokens.length;entry.promptTemplateSha256=crypto.createHash('sha256').update(template.prompt).digest('hex');
    if(entry.inputTokens+profile.inference.maxOutputTokens+64>profile.inference.contextTokens)throw new Error('context_budget_exceeded_no_truncation');
    log('case_started',{profile:profile.id,id:c.id,inputTokens:entry.inputTokens});
    const body={model:'local',messages:c.messages,temperature:profile.inference.temperature,top_p:profile.inference.topP,top_k:profile.inference.topK,min_p:0,presence_penalty:profile.inference.presencePenalty,repeat_penalty:1,seed:profile.inference.seed,max_tokens:profile.inference.maxOutputTokens,stream:false,cache_prompt:false,chat_template_kwargs:kwargs};
    // Do not force a reasoning model's initial thinking tokens into JSON grammar.
    if(!profile.inference.reasoning)body.response_format={type:'json_object',schema:c.schema};
    const raw=await server.request('/v1/chat/completions',body,profile.inference.requestTimeoutMs);await writeJson(path.join(dir,c.id+'.raw.json'),raw);
    entry.elapsedMs=Date.now()-began;entry.usage=raw.usage;entry.timings=raw.timings;entry.finishReason=raw.choices?.[0]?.finish_reason;entry.reasoningCharacters=raw.choices?.[0]?.message?.reasoning_content?.length||0;
    if(entry.finishReason!=='stop')throw new Error('generation_not_complete_'+entry.finishReason);
    entry.output=parseFinal(raw.choices?.[0]?.message?.content);entry.validation=validate(entry.output,c);
   }catch(e){entry.elapsedMs=Date.now()-began;entry.error=e.message;entry.validation={structuralPass:false,error:e.message,semanticAcceptance:'not_accepted'};}
   rows.push(entry);await writeJson(path.join(dir,'report.json'),report);log('case_finished',{profile:profile.id,id:c.id,elapsedMs:entry.elapsedMs,finishReason:entry.finishReason,validation:entry.validation});
  }
  report.executionCompleted=true;
 }catch(e){report.executionCompleted=false;report.error=e.stack;process.exitCode=1;log('experiment_failed',{profile:profile.id,error:e.message});}
 finally{if(stopMonitor)await stopMonitor();if(server)await server.stop();report.finishedAt=new Date().toISOString();
  const file=path.join(dir,'memory.csv'),samples=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split(/\r?\n/).slice(1).map(l=>l.split(',').slice(1).map(Number)):[];
  report.memory={sampleCount:samples.length,maxSampledWorkingSetBytes:Math.max(0,...samples.map(s=>s[0])),maxSampledPrivateBytes:Math.max(0,...samples.map(s=>s[1])),sumProcessPeakWorkingSetUpperBound:Math.max(0,...samples.map(s=>s[2])),measurement:'Server process tree, sampled every 2 s; not total system RAM'};
  await writeJson(path.join(dir,'report.json'),report);render(cases,rows,dir);log('complete',{profile:profile.id,executionCompleted:report.executionCompleted,memory:report.memory});
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={parseFinal};
