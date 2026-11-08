'use strict';
const assert=require('node:assert/strict');
function schema(value,s,p='$'){
 if(s.enum)assert(s.enum.includes(value),p+': enum');
 if(s.type==='object'){assert(value&&typeof value==='object'&&!Array.isArray(value),p+': object');for(const k of s.required||[])assert(Object.hasOwn(value,k),p+': missing '+k);if(s.additionalProperties===false)for(const k of Object.keys(value))assert(Object.hasOwn(s.properties,k),p+': extra '+k);for(const [k,sub]of Object.entries(s.properties||{}))if(Object.hasOwn(value,k))schema(value[k],sub,p+'.'+k);}
 else if(s.type==='array'){assert(Array.isArray(value),p+': array');if(s.minItems!==undefined)assert(value.length>=s.minItems,p+': minItems');if(s.maxItems!==undefined)assert(value.length<=s.maxItems,p+': maxItems');value.forEach((v,i)=>schema(v,s.items,p+'['+i+']'));}
 else if(s.type==='string')assert(typeof value==='string',p+': string');
}
function validate(value,c){schema(value,c.schema);const result=value.result,data=c.bundle.data;
 const sources=new Map([...(data.records||[]),...(data.notes||[]),...(data.laterFollowups||[])].map(r=>[r.sourceId||r.ref,r]));
 if(c.kind==='observation'){
  if(data.goal)sources.set('G1',data.goal);const max={title:60,basis:150,uncertainty:120,question:220,recordPrompt:140};
  for(const h of result.hints){for(const[k,n]of Object.entries(max))assert(h[k].trim()&&h[k].length<=n,'hint_length_'+k);assert(h.sourceRefs.length>=1&&h.sourceRefs.length<=3,'hint_source_count');for(const s of h.sourceRefs){assert(sources.has(s.ref),'unknown_hint_source');assert(s.quote.length>=6&&s.quote.length<=160&&sources.get(s.ref).text.includes(s.quote),'inexact_hint_quote');}}
  const latest=data.records.map(r=>r.date).sort().at(-1);assert(result.hints.some(h=>h.sourceRefs.some(r=>sources.get(r.ref)?.date===latest)),'latest_record_not_cited');
 }else{
  function walk(o){if(!o||typeof o!=='object')return;if(Object.hasOwn(o,'source_ids')){assert(new Set(o.source_ids).size===o.source_ids.length,'duplicate_source');for(const id of o.source_ids)assert(sources.has(id),'unknown_source');if(Object.hasOwn(o,'text')){assert(!!o.text.trim()===!!o.source_ids.length,'text_source_pair');for(const id of o.source_ids)assert(sources.get(id)?.followup?.parent_current!==false,'superseded_followup_used');const cited=o.source_ids.map(id=>JSON.stringify(sources.get(id))).join('\n');for(const q of o.text.match(/「[^「」]*」|『[^『』]*』/g)||[])assert(cited.includes(q.slice(1,-1)),'inexact_quotation');}}for(const v of Object.values(o))if(typeof v==='object')Array.isArray(v)?v.forEach(walk):walk(v);}
  walk(result);
  if(c.kind==='monthly'){assert(result.cm.overall.text.trim(),'missing_overview');for(const [expected,actual,key]of [[data.cm_goals,result.cm.goal_courses,'goal_ref'],[data.cm_events,result.cm.event_courses,'event_ref']]){assert.equal(actual.length,expected.length,'row_count');assert.equal(new Set(actual.map(r=>r[key])).size,expected.length,'duplicate_row');for(const row of actual){const e=expected.find(x=>x.ref===row[key]);assert(e,'unknown_row');const ids=row.source_ids||[...row.reason.source_ids,...row.response.source_ids];assert(ids.every(id=>e.source_ids.includes(id)),'row_source_outside_candidates');}}for(const g of result.cm.goal_courses)if(g.status==='not_observed')assert(g.text===''&&g.source_ids.length===0,'unobserved_with_fact');}
 }
 const prose=JSON.stringify(result);const redFlags=(c.expectations.forbiddenFacts||[]).filter(s=>prose.includes(s));
 return {structuralPass:true,redFlags,semanticAcceptance:'human_review_required'};
}
module.exports={schema,validate};
