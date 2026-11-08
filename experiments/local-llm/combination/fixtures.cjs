'use strict';
// All content in this file is fictional. Demonstrations and held-out records are disjoint.
const crypto=require('node:crypto');
const originals=require('../cases.json');
const clone=x=>structuredClone(x),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const block=(text='',source_ids=[])=>({text,source_ids});
function make(base,id,data,expectations,printData){
 const c=clone(originals.find(x=>x.id===base));c.id=id;c.jobId='fictional-'+id;c.period=data.period;c.kind=data.kind;c.title=id;c.inputHash=hash(data);c.fictional=true;
 c.bundle.data=clone(data);c.bundle.serialized=JSON.stringify(data);c.bundle.sourceMap={};
 for(const n of [...data.records||[],...data.notes||[]]){const ref=n.sourceId||n.ref;c.bundle.sourceMap[ref]={kind:'note',id:'fictional-'+ref,revision:1,date:n.date,field:'rawMemo',category:n.eventType||n.category,text:n.rawMemo||n.text};}
 if(data.goal)c.bundle.sourceMap.G1={kind:'goal',id:'fictional-goal',revision:1,date:data.period,field:'text',text:data.goal.text};
 c.bundle.sourceIds=Object.keys(c.bundle.sourceMap);c.bundle.inputHash=c.inputHash;
 for(const [k,v]of Object.entries({exportId:c.jobId,provider:c.provider,inputHash:c.inputHash}))c.schema.properties[k].enum=[v];
 c.messages=[{role:'system',content:''},{role:'user',content:c.bundle.serialized}];c.expectations=expectations||{checks:[],forbiddenFacts:[]};c.printData=printData||{};return c;
}
const note=(sourceId,date,eventType,rawMemo,extra={})=>({sourceId,date,eventType,observedAt:'',rawMemo,...extra});
const context={version:2,emptyMeaning:'空欄は未記載。未観察を正常・改善へ変えない',sourcePolicy:'選択された本人の原記録。予定と実績を区別する',plan_source_ids:[]};
const goal=(ref,text,source_ids,start='2026-04-01')=>({ref,text,baseline:'',focus:'本人の様子と必要だった支援',start,end:'2027-03-31',effective_from:start,effective_to:'2027-03-31',source_ids});
const demoData={kind:'monthly',period:'2026-04',records:[],notes:[
 note('X1','2026-04-03','食事','本人が温かいスープを選び、持ち手のある器を用意するとご自身で飲まれた。'),
 note('X2','2026-04-10','活動','歌の会で本人が春の歌を選ばれた。歌い終わりに「懐かしいね」と話された。'),
 note('X3','2026-04-17','連絡','ご家族から、親戚の集まりへ出席するため欠席するとの連絡があった。'),
 note('X4','2026-04-24','連絡','本人から、家でも持ち手のある器を使いたいとケアマネジャーへ相談したい旨を伺った。'),
 note('X5','2026-04-27','食事','今後も持ち手のある器を用意することを事業所で決めた。')
 ],context:{...context,plan_source_ids:['X5']},cm_contract:'monthly-course-v2',cm_goals:[goal('J1','使いやすい器で食事を楽しむ。',['X1']),goal('J2','家庭で新聞を読む。',[])],cm_events:[{ref:'Z1',date:'2026-04-17',type:'欠席',source_ids:['X3']}]};
const demoMonthly=make('monthly','demo-monthly',demoData);
const demoMonthlyResult={kind:'monthly',family:{overall:block('温かいスープを選ばれ、持ち手のある器をご用意するとご自身で飲まれました。歌の会では春の歌を選び、「懐かしいね」と話されました。',['X1','X2']),next_plan:block('引き続き、持ち手のある器をご用意します。',['X5']),consultation:block('ご自宅でも持ち手のある器を使いたいと、ケアマネジャーへの相談を希望されています。',['X4'])},cm:{overall:block('使いやすい器を用意することで、ご自身で飲む場面が見られた。家庭で使う器について相談希望あり。',['X1','X4']),next_plan:block('持ち手のある器を継続して用意する方針。',['X5']),consultation:block('本人は家庭でも持ち手のある器の使用を希望。',['X4']),goal_courses:[{goal_ref:'J1',status:'recorded',text:'本人が温かいスープを選択。持ち手のある器を用意するとご自身で飲まれた。',source_ids:['X1']},{goal_ref:'J2',status:'not_observed',text:'',source_ids:[]}],event_courses:[{event_ref:'Z1',reason:block('親戚の集まりへ出席するため。家族から連絡あり。',['X3']),response:block()}],cm_request:block('本人から、家庭で使う持ち手のある器について相談希望。',['X4'])},needs_review:[]};
const demoDaily=make('daily-client-b','demo-daily',{kind:'daily',period:'2026-04-05',records:[],notes:[note('X1','2026-04-05','活動','色鉛筆から緑を選ばれ「葉っぱを描く」と話された。隣の利用者は飲み物を希望し、その方へ職員がお茶を渡した。')],context});
const demoDailyResult={kind:'daily',day_summary:block('緑の色鉛筆を選び、「葉っぱを描く」と話されました。',['X1']),needs_review:[]};
const demoHint=make('hint-open','demo-hint',{kind:'observation',period:'2026-04-09',records:[{ref:'X1',date:'2026-04-08',recordType:'note',category:'活動',text:'編み物の途中で「目が疲れた」と話され、道具を置いて休まれた。休んだ後の目の疲れは聞けていない。',excerpted:false}],context});
const demoHintResult={kind:'observation',hints:[{title:'編み物のあとに話されていた目の疲れ',category:'活動',basis:'編み物の途中で目の疲れを話され、道具を置いて休まれました。',uncertainty:'休まれた後の目の疲れは分かっていません。',question:'その後の目の疲れについて、ご本人はどんなふうに話されていますか？',recordPrompt:'普段の関わりの中で聞けた、ご本人の言葉を残してください。',sourceRefs:[{ref:'X1',quote:'「目が疲れた」と話され、道具を置いて休まれた。'}]}]};
const heldData={kind:'monthly',period:'2026-11',records:[],notes:[
 note('R1','2026-11-02','その他','着替えでは最初のボタンを職員が手伝うと、残りのボタンはご自身で留められた。'),
 note('R2','2026-11-04','連絡','家族から、自宅の水道工事の立ち会いのため欠席すると連絡があった。'),
 note('R3','2026-11-06','入浴','本人は入浴を希望されていたが、事業所のシャワー設備が故障したため入浴を中止した。足の清拭を提案し、ご本人の了承を得て職員が実施した。'),
 note('R4','2026-11-09','活動','折り紙の途中で「手が疲れた」と話され、折り紙を終えられた。その後の手の疲れについては聞いていない。'),
 note('R5','2026-11-12','連絡','11月9日の帰宅後について家族から「家では本を読んでいました」と聞いた。手の疲れが残っていたかは家族も確認していない。',{sourceDate:'2026-11-09',followup:{parent_ref:'R4',parent_current:true}}),
 note('R6','2026-11-16','その他','本人が青い上着を選ばれ、最初のボタンを職員が手伝った。隣の利用者は足の痛みを話されていたが、これは本人の訴えではない。'),
 note('R7','2026-11-18','活動','街の絵はがきを並べると、本人が橋の写真を指さし「これがいい」と選ばれた。'),
 note('R8','2026-11-24','活動','12月に歌の時間を準備する方針を事業所で確認した。'),
 note('R9','2026-11-26','連絡','本人から、自宅で使う浴室の椅子をケアマネジャーに相談したいとの希望を伺った。事業所で購入すると決めたわけではない。'),
 note('R10','2026-11-28','活動','11月24日に確認した歌の時間の予定はいったん取り消した。次の活動は本人の希望を確認してから決める。'),
 note('R11','2026-11-29','連絡','旧記録への追記には発熱から回復したとあるが、元の記録が訂正され、この追記と現在の欠席記録との対応は確認できない。',{sourceDate:'2026-11-04',followup:{parent_ref:'R2',parent_current:false}})
 ],context:{...context,plan_source_ids:['R8','R10']},cm_contract:'monthly-course-v2',cm_goals:[goal('G1','必要な部分の支援を受けて着替える。',['R1','R6'],'2026-11-01'),goal('G2','本人の好みに合わせて活動を選ぶ。',['R4','R5','R7'],'2026-11-01'),goal('G3','自宅の植木の手入れを続ける。',[],'2026-11-01')],cm_events:[{ref:'E1',date:'2026-11-04',type:'欠席',source_ids:['R2']},{ref:'E2',date:'2026-11-06',type:'入浴中止',source_ids:['R3']}]};
const heldout=make('monthly','monthly-heldout',heldData,{checks:['設備故障による入浴中止を本人拒否や体調不良にしない','水道工事の欠席を発熱にしない','後日の家族の話を当日観察にしない','読書を手の疲れの回復の根拠にしない','取消済みの歌の予定を現行計画にしない','相談希望を購入決定にしない','目標3件と出来事2件を保持','観察のない家庭の目標を達成にしない'],forbiddenFacts:['発熱から回復','体調不良のため','目標を達成']},{client:'架空の利用者D',month:'2026-11',utilization:{planned:11,attended:10,absent:1,bathPlanned:6,bathDone:5,bathCancelled:1}});
const suites={known:{order:['A','B','C','D'],cases:[clone(originals.find(c=>c.id==='monthly'))]},heldout:{order:['D','C','B','A'],cases:[heldout]},short:{order:['A','B'],cases:['daily-followup','daily-client-b','hint-open','hint-followup','daily-injection'].map(id=>clone(originals.find(c=>c.id===id)))}};
module.exports={suites,demos:{monthly:{c:demoMonthly,result:demoMonthlyResult},daily:{c:demoDaily,result:demoDailyResult},observation:{c:demoHint,result:demoHintResult}},hash};
