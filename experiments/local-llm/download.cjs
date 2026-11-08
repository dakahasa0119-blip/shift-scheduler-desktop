'use strict';
const fs=require('node:fs'), fsp=fs.promises, path=require('node:path'), crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
function safeFile(root,name){
  if(!/^[A-Za-z0-9._-]+$/.test(name)||name==='.'||name==='..')throw new Error('unsafe_file_name');
  const resolved=path.resolve(root,name);
  if(path.dirname(resolved)!==path.resolve(root))throw new Error('unsafe_path');
  return resolved;
}
async function sha(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
async function valid(file,item){try{return (await fsp.stat(file)).size===item.bytes&&await sha(file)===item.sha256;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function removeFile(file){try{await fsp.unlink(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
async function writeJson(file,value){const tmp=file+'.tmp';await fsp.writeFile(tmp,JSON.stringify(value,null,2),'utf8');await fsp.rename(tmp,file);}
async function download(item,root,opts={}){
  if(!Number.isSafeInteger(item.bytes)||item.bytes<1||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error('invalid_manifest');
  const parsed=new URL(item.url);
  if(parsed.protocol!=='https:'&&!(opts.testLocal&&parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'))throw new Error('https_required');
  await fsp.mkdir(root,{recursive:true});
  const final=safeFile(root,item.file),partial=final+'.part',meta=partial+'.json';
  const identity=JSON.stringify({url:item.url,bytes:item.bytes,sha256:item.sha256});
  const started=Date.now(),events=[];
  if(await valid(final,item))return {file:final,reused:true,downloadedBytes:0,ms:Date.now()-started,events:['verified_existing_file']};
  if(fs.existsSync(final))throw new Error('installed_file_hash_mismatch');
  let old='';try{old=await fsp.readFile(meta,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old!==identity){await removeFile(partial);await fsp.writeFile(meta,identity);}
  let downloadedBytes=0,lastError;
  for(let attempt=0;attempt<(opts.attempts||3);attempt++){
    let offset=0;try{offset=(await fsp.stat(partial)).size;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(offset>item.bytes){await removeFile(partial);offset=0;events.push('oversize_partial_restarted');}
    if(offset===item.bytes){
      if(await valid(partial,item)){await fsp.rename(partial,final);await removeFile(meta);return {file:final,reused:false,downloadedBytes,ms:Date.now()-started,events:events.concat('sha256_verified')};}
      await removeFile(partial);offset=0;events.push('bad_partial_hash_restarted');
    }
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),opts.timeoutMs||300000);
    try{
      const headers=offset?{Range:'bytes='+offset+'-'}:{};
      const response=await fetch(item.url,{headers,signal:controller.signal});
      if(!response.ok)throw new Error('download_http_'+response.status);
      let append=false;
      if(offset&&response.status===206){
        const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
        if(!match||Number(match[1])!==offset||Number(match[3])!==item.bytes)throw new Error('bad_content_range');
        append=true;events.push('resumed_at_'+offset);
      }else if(response.status===200){if(offset)events.push('server_ignored_range_restart');offset=0;}
      else if(!offset&&response.status===206){
        if(!new RegExp('^bytes 0-\\d+/'+item.bytes+'$').test(response.headers.get('content-range')||''))throw new Error('bad_initial_range');
      }else throw new Error('unexpected_download_status');
      let got=0;
      const count=new Transform({transform(chunk,encoding,callback){
        got+=chunk.length;downloadedBytes+=chunk.length;
        if(got+offset>item.bytes)return callback(new Error('download_too_large'));
        callback(null,chunk);
      }});
      await pipeline(Readable.fromWeb(response.body),count,fs.createWriteStream(partial,{flags:append?'a':'w'}));
      if(!await valid(partial,item))throw new Error('download_hash_or_size_mismatch');
      await fsp.rename(partial,final);await removeFile(meta);
      return {file:final,reused:false,downloadedBytes,ms:Date.now()-started,events:events.concat('sha256_verified')};
    }catch(e){lastError=e;events.push('attempt_'+(attempt+1)+'_'+e.message);}
    finally{clearTimeout(timer);}
  }
  const e=new Error('download_incomplete: '+lastError?.message);e.events=events;throw e;
}
module.exports={download,sha,valid,safeFile,writeJson,removeFile};
