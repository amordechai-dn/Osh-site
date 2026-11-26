import {categoryGroup} from './defaults.js?v=1.8.3';
export const VERSION='1.8.3';
export const uid=()=>crypto.randomUUID();
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const monthNow=()=>today().slice(0,7);
export const copy=x=>structuredClone(x);
export function empty(){return {schema:1,id:uid(),entities:{},rates:{},createdAt:new Date().toISOString()}}
export function put(db,entity){const v={...entity,id:entity.id||uid(),updatedAt:new Date().toISOString(),rev:uid()};db.entities[v.id]=v;return v}
export function list(db,kind){return Object.values(db.entities).filter(x=>x.kind===kind&&!x.deleted)}
export function remove(db,id){if(db.entities[id])put(db,{...db.entities[id],deleted:true})}
export function dateFor(month,day){const [y,m]=month.split('-').map(Number);return `${month}-${String(Math.min(Number(day)||1,new Date(y,m,0).getDate())).padStart(2,'0')}`}
export function nextMonth(month,step=1){const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+step,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
const planFields=['type','name','amount','day','category','place'];
const fieldsOf=p=>Object.fromEntries(planFields.map(k=>[k,p[k]??(k==='day'?1:'')]));
export function templateAt(t,month){
 if(!t||t.deleted||(t.start&&month<t.start))return null;
 const change=[...(t.changes||[])].filter(c=>c.from<=month).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);
 if(change?.active===false)return null;
 return {...t,...change};
}
function materialize(db,t,month){
 const effective=templateAt(t,month);if(!effective)return;
 const existing=Object.values(db.entities).find(p=>p.kind==='planned'&&p.month===month&&p.template===t.id);
 if(existing&&!existing.recurrenceStopped)return existing;
 return put(db,{id:existing?.id||'planned:'+month+':'+t.id,kind:'planned',month,...fieldsOf(effective),template:t.id,status:'pending',deleted:false,recurrenceStopped:false});
}
function expenseRuleEntryAt(db,month){
 const rule=db.entities['expense-budget:monthly'];
 if(!rule||rule.deleted)return null;
 return [...(rule.changes||[])].filter(c=>c.from<=month).sort((a,b)=>a.from.localeCompare(b.from)).at(-1)??null;
}
const expenseRuleAt=(db,month)=>expenseRuleEntryAt(db,month)?.amount??null;
export function monthlyExpenseBudget(db,month){
 const m=list(db,'month').find(m=>m.month===month);
 return m?.expenseBudget??expenseRuleAt(db,month)??(m?.budgets||list(db,'category').map(c=>({amount:c.budget||0}))).reduce((sum,b)=>sum+b.amount,0);
}
export function migrateExpenseBudgets(db){
 for(const m of list(db,'month'))if(m.expenseBudget===undefined){
  const rule=expenseRuleEntryAt(db,m.month),amount=rule&&rule.from!=='0000-01'?rule.amount:(m.budgets||[]).reduce((sum,b)=>sum+b.amount,0);
  db.entities[m.id]={...m,expenseBudget:amount,expenseBudgetOverride:false,rev:(m.rev||m.id)+':expense-total-v1'};
 }
 const amount=list(db,'category').reduce((sum,c)=>sum+(c.budget||0),0);
 if(!db.entities['expense-budget:monthly']&&amount>0)db.entities['expense-budget:monthly']={id:'expense-budget:monthly',kind:'expense-budget',changes:[{from:'0000-01',amount}],rev:'legacy-expense-budget:'+amount,updatedAt:'2026-11-26T00:00:00.000Z'};
}
export function setExpenseBudget(db,month,amount,scope='month'){
 if(!Number.isSafeInteger(amount)||amount<0||amount>1e11)throw Error('יש להזין תקציב תקין');
 const m=ensureMonth(db,month),future=scope==='future';
 if(future){
  const old=db.entities['expense-budget:monthly'];
  put(db,{...old,id:'expense-budget:monthly',kind:'expense-budget',changes:[...(old?.changes||[]).filter(c=>c.from<month),{from:month,amount}]});
  for(const later of list(db,'month').filter(m=>m.month>month&&!m.expenseBudgetOverride))put(db,{...later,expenseBudget:amount});
 }
 put(db,{...m,expenseBudget:amount,expenseBudgetOverride:!future});
}
export function ensureMonth(db,month){
 let m=list(db,'month').find(x=>x.month===month);
 if(!m)m=put(db,{id:'month:'+month,kind:'month',month,budgets:list(db,'category').map(c=>({category:c.id,amount:c.budget||0})),expenseBudget:monthlyExpenseBudget(db,month),expenseBudgetOverride:false});
 else if(month<monthNow())return m;
 for(const t of list(db,'template'))materialize(db,t,month);
 return m;
}
export function nextRecurringMonth(t,month){return [t.start,...(t.changes||[]).map(c=>c.from)].filter(m=>m&&m>month&&templateAt(t,m)).sort()[0]||null}
export function isRecurring(db,p){
 const t=p.kind==='template'?p:db.entities[p.template],month=p.month||monthNow();
 return Boolean(t&&!t.deleted&&(templateAt(t,nextMonth(month))||nextRecurringMonth(t,month)));
}
function changeSchedule(db,t,from,values,active=true){
 const before=copy(t),changes=(t.changes||[]).filter(c=>c.from<from);
 changes.push({from,...fieldsOf(values),active});
 const saved=put(db,{...t,start:t.start&&t.start<from?t.start:from,changes});
 for(const p of list(db,'planned').filter(p=>p.template===t.id&&p.month>=from&&p.status==='pending')){
  const prior=templateAt(before,p.month),after=templateAt(saved,p.month);
  const currentFields=fieldsOf(p),priorFields=prior?fieldsOf(prior):null;
  const overridden=p.monthlyOverride||!prior||planFields.some(k=>currentFields[k]!==priorFields[k]);
  if(overridden)continue;
  if(after)put(db,{...p,...fieldsOf(after)});
  else put(db,{...p,deleted:true,recurrenceStopped:true});
 }
 for(const m of list(db,'month').filter(m=>m.month>=from))materialize(db,saved,m.month);
 return saved;
}
export function savePlan(db,month,input){
 const values=fieldsOf(input);
 if(!/^\d{4}-\d{2}$/.test(month)||!['income','expenses','savings'].includes(values.type)||!values.name.trim()||!Number.isSafeInteger(values.amount)||values.amount<=0||!Number.isInteger(values.day)||values.day<1||values.day>31)throw Error('יש לבדוק את פרטי התכנון');
 const old=db.entities[input.id],template=old?.kind==='template'?old:db.entities[old?.template];
 const existing=old?.kind==='planned'?old:old?.kind==='template'?Object.values(db.entities).find(p=>p.kind==='planned'&&p.month===month&&p.template===old.id):null;
 const p={...existing,kind:'planned',month,...values,status:existing?.status||'pending',deleted:false};
 if(!p.id)p.id=template?'planned:'+month+':'+template.id:uid();
 const wasRecurring=template&&isRecurring(db,{...p,template:template.id});
 let t=template&&!template.deleted?template:null;
 if(input.recurring&&!t)t=put(db,{id:'template:'+p.id,kind:'template',start:month,...values});
 if(t)p.template=t.id;
 p.monthlyOverride=Boolean(t&&input.recurring&&wasRecurring&&input.scope!=='future');
 const saved=put(db,p);
 if(input.recurring&&t&&(input.scope==='future'||!wasRecurring))changeSchedule(db,t,month,values,true);
 else if(!input.recurring&&t&&wasRecurring)changeSchedule(db,t,nextMonth(month),values,false);
 for(const m of list(db,'month').filter(m=>m.month>=month))if(t)materialize(db,db.entities[t.id],m.month);
 return db.entities[saved.id];
}
export function deletePlan(db,month,id,scope='month'){
 const old=db.entities[id];if(!old)return;
 const t=old.kind==='template'?old:db.entities[old.template];
 const p=old.kind==='planned'?old:t?Object.values(db.entities).find(p=>p.kind==='planned'&&p.month===month&&p.template===t.id):null;
 if(p)remove(db,p.id);
 else if(t)put(db,{id:'planned:'+month+':'+t.id,kind:'planned',month,...fieldsOf(t),template:t.id,status:'pending',deleted:true});
 if(scope==='future'&&t&&!t.deleted)changeSchedule(db,t,nextMonth(month),t,false);
}
export function updateTemplate(db,t,current=monthNow()){const saved=put(db,{...t,kind:'template',start:t.start||nextMonth(current)});for(const m of list(db,'month').filter(x=>x.month>current)){let p=list(db,'planned').find(x=>x.month===m.month&&x.template===saved.id);if(p&&p.status==='pending')put(db,{...p,type:t.type,name:t.name,category:t.category||'',place:t.place||'',amount:t.amount,day:t.day||1});else if(!p&&!t.deleted&&m.month>=saved.start)put(db,{id:'planned:'+m.month+':'+saved.id,kind:'planned',month:m.month,type:t.type,name:t.name,category:t.category||'',place:t.place||'',amount:t.amount,day:t.day||1,template:saved.id,status:'pending'});}return saved}
export function ils(t){if(t.currency==='USD')return t.rate?Math.round(t.amount*t.rate):null;return t.amount}
export function transactions(db,month){return list(db,'transaction').filter(x=>x.date.slice(0,7)===month)}
export function spendingGroups(db,month){
 const amounts={living:0,leisure:0};
 for(const t of transactions(db,month)){
  if(t.type!=='expenses')continue;
  const amount=ils(t);if(amount===null)continue;
  const category=db.entities[t.category||db.entities[t.refundOf]?.category]||{};
  amounts[categoryGroup(category)]+=amount*(t.refundOf?-1:1);
 }
 return amounts;
}
export function totals(db,month){let income=0,expenses=0,savings=0,pending=0,estimated=0;for(const t of transactions(db,month)){const n=ils(t);if(n===null){pending++;continue}if(t.estimated)estimated++;if(t.type==='income')income+=n;if(t.type==='expenses')expenses+=t.refundOf?-n:n;if(t.type==='savings')savings+=n}const plans=list(db,'planned').filter(x=>x.month===month),m=list(db,'month').find(x=>x.month===month);let commitments=plans.filter(x=>x.status==='pending'&&x.type!=='income').reduce((s,x)=>s+x.amount,0);return {income,expenses,savings,pending,estimated,remain:income-expenses-savings,available:income-expenses-savings-commitments,commitments,plannedIncome:plans.filter(x=>x.status!=='skipped'&&x.type==='income').reduce((s,x)=>s+x.amount,0),plannedSavings:plans.filter(x=>x.status!=='skipped'&&x.type==='savings').reduce((s,x)=>s+x.amount,0),plannedExpenses:monthlyExpenseBudget(db,month),expenseRemaining:monthlyExpenseBudget(db,month)-expenses,plannedSpecificExpenses:plans.filter(p=>p.type==='expenses'&&p.status!=='skipped').reduce((sum,p)=>sum+p.amount,0)}}
export function spent(db,month,category){return transactions(db,month).filter(t=>t.type==='expenses'&&t.category===category).reduce((s,t)=>s+(ils(t)||0)*(t.refundOf?-1:1),0)}
export function confirm(db,id,changes={}){const p=db.entities[id];if(!p||p.deleted||p.status!=='pending')throw Error('הפריט כבר אושר או דולג');const t=put(db,{kind:'transaction',type:p.type,name:p.name,category:p.category,place:p.place,amount:p.amount,currency:'ILS',date:dateFor(p.month,p.day),...changes,id:'transaction:'+p.id,planned:p.id});put(db,{...p,status:'paid',transaction:t.id});return t}
export function deleteTransaction(db,id){const t=db.entities[id];if(list(db,'transaction').some(x=>x.refundOf===id))throw Error('יש למחוק תחילה את ההחזרים המקושרים');remove(db,id);if(t?.planned&&db.entities[t.planned])put(db,{...db.entities[t.planned],status:'pending',transaction:null})}
export function refund(db,id,amount,date){const original=db.entities[id];if(!original||original.type!=='expenses'||original.refundOf)throw Error('אפשר להחזיר הוצאה בלבד');const returned=list(db,'transaction').filter(t=>t.refundOf===id).reduce((s,t)=>s+t.amount,0);if(!(amount>0)||returned+amount>original.amount)throw Error('ההחזר גדול מיתרת ההוצאה');return put(db,{kind:'transaction',type:'expenses',name:`החזר · ${original.name}`,category:original.category,place:original.place,amount,currency:original.currency,date,refundOf:id})}
export function validate(db){if(!db||db.schema!==1||typeof db.id!=='string'||!db.entities||typeof db.entities!=='object'||Array.isArray(db.entities)||Object.keys(db.entities).length>100000)throw Error('קובץ נתונים לא תקין');for(const [id,e] of Object.entries(db.entities)){if(e.id!==id||typeof e.kind!=='string'||(e.amount!==undefined&&(!Number.isSafeInteger(e.amount)||e.amount<0)))throw Error('רשומה לא תקינה בקובץ');}return db}
export function merge(base,local,remote){validate(remote);if(local.id!==remote.id)throw Error('זהו גיבוי של כספת אחרת. יש לשחזר אותו במקום לסנכרן');const merged=copy(local),conflicts=[];for(const id of new Set([...Object.keys(local.entities),...Object.keys(remote.entities)])){const l=local.entities[id],r=remote.entities[id],b=base?.entities?.[id];if(!l){merged.entities[id]=r;continue}if(!r)continue;if(l.rev===r.rev)continue;if(l.rev===b?.rev){merged.entities[id]=r;continue}if(r.rev===b?.rev)continue;conflicts.push({id,local:l,remote:r});}merged.rates={...remote.rates,...local.rates};return {merged,conflicts}}
export function csv(db){const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';return '\ufeff'+[['תאריך','סוג','שם / מקום','קטגוריה','סכום מקורי','מטבע','סכום בשקלים','שער','תאריך שער','הערכה','החזר'],...list(db,'transaction').sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,{income:'הכנסה',expenses:'הוצאה',savings:'חיסכון'}[t.type],t.name,db.entities[t.category]?.name||'',t.amount/100,t.currency,ils(t)===null?'':ils(t)/100,t.rate||'',t.rateDate||'',t.estimated?'כן':'לא',t.refundOf?'כן':'לא'])].map(r=>r.map(x=>quote(/^[=+\-@\t\r]/.test(String(x))?'\''+x:x)).join(',')).join('\r\n')}
export function applyDefault(db,month){const m=ensureMonth(db,month);put(db,{...m,budgets:list(db,'category').map(c=>({category:c.id,amount:c.budget||0}))});for(const t of list(db,'template')){const existing=list(db,'planned').find(p=>p.month===month&&p.template===t.id);if(existing)continue;put(db,{id:'planned:'+month+':'+t.id,kind:'planned',month,type:t.type,name:t.name,category:t.category||'',place:t.place||'',amount:t.amount,day:t.day||1,template:t.id,status:'pending'})}}
