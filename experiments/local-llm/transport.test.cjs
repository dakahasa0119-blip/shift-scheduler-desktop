'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {requestJSON}=require('./http-client.cjs');
test('explicit timeout allows delayed headers and rejects total deadline',async()=>{
 const server=http.createServer((req,res)=>setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));},120));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.deepEqual(await requestJSON(base,'test','/',{fictional:true},1000),{ok:true});await assert.rejects(requestJSON(base,'test','/',{},20),/request_total_timeout_20/);assert.throws(()=>requestJSON('http://example.com','test','/',{},20),/loopback_only/);}finally{await new Promise(r=>server.close(r));}
});
