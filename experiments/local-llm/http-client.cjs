'use strict';
const http=require('node:http');
// Node fetch has an additional five-minute response-header timeout. A CPU-only
// monthly generation can exceed it. Use one explicit total timeout instead.
function requestJSON(base,apiKey,endpoint,body,timeoutMs=10000){
 const target=new URL(endpoint,base);if(target.protocol!=='http:'||target.hostname!=='127.0.0.1')throw new Error('loopback_only');
 return new Promise((resolve,reject)=>{
  const data=body?JSON.stringify(body):null;let done=false,timer;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);};
  const req=http.request(target,{method:body?'POST':'GET',agent:false,headers:{Authorization:'Bearer '+apiKey,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})}},res=>{
   let chunks=[],bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){req.destroy(new Error('response_too_large'));return;}chunks.push(chunk);});
   res.on('error',e=>finish(e));res.on('aborted',()=>finish(new Error('response_aborted')));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');if(res.statusCode<200||res.statusCode>=300)return finish(new Error('server_http_'+res.statusCode+': '+text.slice(0,600)));try{finish(null,JSON.parse(text));}catch(e){finish(new Error('response_not_json: '+e.message));}});
  });
  timer=setTimeout(()=>{const e=new Error('request_total_timeout_'+timeoutMs);req.destroy(e);finish(e);},timeoutMs);req.on('error',e=>finish(e));req.end(data);
 });
}
module.exports={requestJSON};
