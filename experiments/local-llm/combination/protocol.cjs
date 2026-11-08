'use strict';
const assert=require('node:assert/strict');
const {compactMessages}=require('../compact-prompt.cjs');
const {demos}=require('./fixtures.cjs');
const clone=x=>structuredClone(x);
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const variants={A:{label:'一括・例なし',examples:false,split:false},B:{label:'一括・完成例あり',examples:true,split:false},C:{label:'分割・例なし',examples:false,split:true},D:{label:'分割・完成例あり',examples:true,split:true}};
function scopedData(c,type,ref){
 const d=clone(c.bundle.data);if(!['goal','event'].includes(type))return d;
 const key=type==='goal'?'cm_goals':'cm_events',item=d[key].find(x=>x.ref===ref);assert(item);
 const ids=new Set(item.source_ids);d.records=(d.records||[]).filter(x=>ids.has(x.sourceId||x.ref));d.notes=(d.notes||[]).filter(x=>ids.has(x.sourceId||x.ref));d.cm_goals=type==='goal'?[item]:[];d.cm_events=type==='event'?[item]:[];
 // All text is copied unchanged; these counters describe only the scoped excerpt.
 d.context={...d.context,recordCount:d.records.length+d.notes.length,recordedDates:[...new Set([...d.records,...d.notes].map(x=>x.date))],plan_source_ids:(d.context.plan_source_ids||[]).filter(id=>ids.has(id)),scopedTo:{type,ref},coverageMeaning:'今回の行に関連する原記録候補のみ。観察済み・因果関係の証明ではない'};return d;
}
function restResult(r){const x=clone(r);delete x.cm.goal_courses;delete x.cm.event_courses;return x;}
function examples(c,type){const d=demos[c.kind];
 if(type==='goal')return d.c.bundle.data.cm_goals.map(g=>({input:scopedData(d.c,type,g.ref),output:d.result.cm.goal_courses.find(x=>x.goal_ref===g.ref)}));
 if(type==='event')return d.c.bundle.data.cm_events.map(e=>({input:scopedData(d.c,type,e.ref),output:d.result.cm.event_courses.find(x=>x.event_ref===e.ref)}));
 return [{input:d.c.bundle.data,output:type==='rest'?restResult(d.result):d.result}];
}
function messages(c,type,data,schema,example){
 const original=compactMessages(c)[0].content;let system=original.split('次のJSONスキーマに従います。')[0];
 const focus={full:'すべての指定欄を作ります。',goal:'今回は短期目標の行を一つだけ作ります。goal_ref、status、text、source_idsのオブジェクトだけを返します。目標の文言は実績ではありません。対応する候補以外は根拠にしません。',event:'今回は欠席または入浴中止の行を一つだけ作ります。event_ref、reason、responseのオブジェクトだけを返します。理由と実際の対応を混ぜません。',rest:'今回は今月の要点、ご家族への文章、意向、今後の方針、CMへの相談とneeds_reviewだけを作ります。goal_coursesとevent_coursesは別の処理で作るので出力しません。原記録を根拠にし、他の生成結果には頼りません。'}[type];
 if(type!=='full')system+='\n'+focus;
 if(example)system+='\n次は別人・別期間の架空の完成例です。書き方だけを参考にし、出来事・日付・引用・出典IDを今回の出力へ流用しません。fullの場合、例のoutputはresult部分だけです。\n'+JSON.stringify(examples(c,type));
 system+=type==='full'?'次のJSONスキーマに従います。'+original.split('次のJSONスキーマに従います。')[1]:'\n今回の出力スキーマ：'+JSON.stringify(schema);
 return [{role:'system',content:system},{role:'user',content:JSON.stringify(data)}];
}
function plan(c,variant){const v=variants[variant];assert(v);if(!v.split||c.kind!=='monthly')return [{name:'full',type:'full',maxTokens:4096,schema:c.schema,messages:v.examples?messages(c,'full',c.bundle.data,c.schema,true):compactMessages(c),sourceIds:c.bundle.sourceIds}];
 const rp=c.schema.properties.result.properties,cp=rp.cm.properties;
 const parts=[];
 for(const g of c.bundle.data.cm_goals){const schema=clone(cp.goal_courses.items);schema.properties.goal_ref.enum=[g.ref];const data=scopedData(c,'goal',g.ref);parts.push({name:'goal-'+g.ref,type:'goal',ref:g.ref,maxTokens:384,schema,messages:messages(c,'goal',data,schema,v.examples),sourceIds:g.source_ids});}
 for(const e of c.bundle.data.cm_events){const schema=clone(cp.event_courses.items);schema.properties.event_ref.enum=[e.ref];const data=scopedData(c,'event',e.ref);parts.push({name:'event-'+e.ref,type:'event',ref:e.ref,maxTokens:384,schema,messages:messages(c,'event',data,schema,v.examples),sourceIds:e.source_ids});}
 const remaining=4096-parts.reduce((s,p)=>s+p.maxTokens,0);assert(remaining>=1536,'aggregate_output_budget_too_small');
 const cm=clone(cp);delete cm.goal_courses;delete cm.event_courses;const schema=object({kind:rp.kind,family:rp.family,cm:object(cm),needs_review:rp.needs_review});
 parts.push({name:'rest',type:'rest',maxTokens:remaining,schema,messages:messages(c,'rest',c.bundle.data,schema,v.examples),sourceIds:c.bundle.sourceIds});return parts;
}
function assemble(c,parts){if(parts.length===1&&parts[0].type==='full')return clone(parts[0].output);
 assert(parts.every(p=>p.output&&!p.error),'incomplete_generation_cannot_be_assembled');const rest=clone(parts.find(p=>p.type==='rest').output);
 rest.cm.goal_courses=parts.filter(p=>p.type==='goal').map(p=>clone(p.output));rest.cm.event_courses=parts.filter(p=>p.type==='event').map(p=>clone(p.output));
 return {exportId:c.jobId,provider:c.provider,inputHash:c.inputHash,result:rest};
}
module.exports={variants,plan,assemble,scopedData,restResult};
