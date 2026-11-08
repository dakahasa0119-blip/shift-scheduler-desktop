'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {download,valid,writeJson,removeFile}=require('./download.cjs');
const {requestJSON}=require('./http-client.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function checkResources({freeDisk,freeMemory},needDisk,needMemory){if(freeDisk<needDisk)throw new Error('insufficient_disk');if(freeMemory<needMemory)throw new Error('insufficient_available_memory');}
function psQuote(s){return "'"+String(s).replace(/'/g,"''")+"'";}
function powershell(script){return new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',c=>c?reject(new Error('powershell_failed: '+err.slice(-1500))):resolve(out.trim()));});}
async function withLock(root,fn){await fsp.mkdir(root,{recursive:true});const file=path.join(root,'install.lock');let lock;
 try{lock=await fsp.open(file,'wx');}catch(e){if(e.code!=='EEXIST')throw e;let previous;try{previous=JSON.parse(await fsp.readFile(file,'utf8'));}catch{throw new Error('install_lock_unreadable');}let alive=true;try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw new Error('install_already_running');await removeFile(file);lock=await fsp.open(file,'wx');}
 try{await lock.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()}));return await fn();}finally{await lock.close();await removeFile(file);}
}
async function install(root,manifest){if(process.platform!=='win32'||process.arch!=='x64')throw new Error('windows_x64_required');
 return withLock(root,async()=>{const disk=await fsp.statfs(root),resources={freeDisk:Number(disk.bavail)*Number(disk.bsize),freeMemory:os.freemem(),totalMemory:os.totalmem()};
 const missing=[];for(const item of [manifest.runtime,manifest.model])if(!await valid(path.join(root,item.file),item))missing.push(item);
 const needDisk=missing.reduce((n,x)=>n+x.bytes,0)+manifest.inference.diskReserveBytes+120*1024*1024;checkResources(resources,needDisk,manifest.inference.minimumAvailableMemoryBytes);
 await writeJson(path.join(root,'state.json'),{stage:'downloading',experimentVersion:manifest.experimentVersion,model:manifest.model.sha256});
 const runtime=await download(manifest.runtime,root),model=await download(manifest.model,root);
 const bin=path.join(root,'runtime-'+manifest.runtime.sha256.slice(0,12)),exe=path.join(bin,'llama-server.exe'),stamp=path.join(bin,'verified.json');
 let extracted=false;if(!fs.existsSync(stamp)||!fs.existsSync(exe)){
  // The archive hash was verified first. Only this versioned experimental dir is written.
  await powershell('$ErrorActionPreference="Stop"; Expand-Archive -LiteralPath '+psQuote(runtime.file)+' -DestinationPath '+psQuote(bin)+' -Force');
  if(!fs.existsSync(exe))throw new Error('runtime_executable_missing');await writeJson(stamp,{runtimeSha256:manifest.runtime.sha256});extracted=true;
 }
 await writeJson(path.join(root,'state.json'),{stage:'ready',experimentVersion:manifest.experimentVersion,model:manifest.model.sha256,runtime:manifest.runtime.sha256});
 return {root,exe,modelPath:model.file,resources,needDisk,runtime,model,extracted};});
}
async function unusedPort(){const s=net.createServer();await new Promise((r,j)=>{s.on('error',j);s.listen(0,'127.0.0.1',r);});const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function startServer(installed,manifest,results,tag='first'){
 const port=await unusedPort(),apiKey=crypto.randomBytes(24).toString('hex'),base='http://127.0.0.1:'+port;
 const logFile=path.join(results,'server-'+tag+'.log'),fd=fs.openSync(logFile,'w');
 const args=['--model',installed.modelPath,'--host','127.0.0.1','--port',String(port),'--api-key',apiKey,'--threads',String(manifest.inference.threads),'--threads-batch',String(manifest.inference.threads),'--ctx-size',String(manifest.inference.contextTokens),'--parallel','1','--gpu-layers','0','--no-webui','--no-cache-prompt','--no-cache-idle-slots','--no-context-shift','--offline','--metrics'];
 if(manifest.inference.batchSize)args.push('--batch-size',String(manifest.inference.batchSize));
 if(manifest.inference.ubatchSize)args.push('--ubatch-size',String(manifest.inference.ubatchSize));
 if(manifest.inference.noRepack)args.push('--no-repack');
 if(Object.hasOwn(manifest.inference,'enableThinking'))args.push('--reasoning',manifest.inference.enableThinking?'on':'off');
 if(manifest.inference.reasoning)args.push('--jinja','--reasoning','on','--reasoning-format','deepseek');
 const started=Date.now(),child=spawn(installed.exe,args,{windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);
 let exit=null,spawnError=null;child.on('exit',(code,signal)=>{exit={code,signal};});child.on('error',e=>{spawnError=e;});
 function request(endpoint,body,timeout=10000){return requestJSON(base,apiKey,endpoint,body,timeout);}
 async function stop(){if(child.exitCode===null&&!spawnError){child.kill();for(let i=0;i<40&&child.exitCode===null;i++)await delay(100);}}
 try{while(Date.now()-started<180000){if(spawnError)throw spawnError;if(exit)throw new Error('server_exited_'+exit.code);try{const h=await request('/health');if(h.status==='ok')return {pid:child.pid,port,base,request,stop,child,ms:Date.now()-started,logFile};}catch{}await delay(500);}throw new Error('server_start_timeout');}catch(e){await stop();throw e;}
}
module.exports={install,startServer,checkResources,withLock,powershell,psQuote,delay};
