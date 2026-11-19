import {sum,one,dayAt,addDays,shift} from './base.js';
export const primary = s => s.accounts.find(a=>a.primary);
export function movement(entry, id) {
  if(entry.to===id) return entry.amount;
  if(entry.from===id) return -entry.amount;
  return 0;
}
export function balance(s,id,asOf='9999-12-31') {
  const a=one(s.accounts,id);
  return (a.opened<=asOf?a.opening:0)+sum(s.entries.filter(e=>e.date<=asOf),e=>movement(e,id));
}
export function benefitBalance(s,wallet,asOf='9999-12-31') {
  return sum(s.benefits.filter(x=>x.wallet===wallet && x.date<=asOf),x=>x.direction==='credit'?x.amount:-x.amount);
}
export function cardStats(s,id,asOf='9999-12-31') {
  const card=one(s.cards,id);
  const used=sum(s.dues.filter(x=>x.card===id && x.created<=asOf && (!x.paid || x.paid>asOf)));
  return {used, available:card.limit-used};
}
export function upcoming(s,end,asOf,account=primary(s)?.id) {
  const rows=s.dues.filter(x=>x.created<=asOf && (!x.paid || x.paid>asOf) && x.date<=end && x.account===account);
  for(const rule of s.rules.filter(r=>r.account===account)) {
    for(let d=rule.start;d<=end && (!rule.end || d<=rule.end);d=shift(d,1,rule.anchor||Number(rule.start.slice(8)))) {
      const id=rule.id+'/'+d;
      if(!s.dues.some(x=>x.id===id)) {
        rows.push({...rule,id,date:d,rule:rule.id,group:rule.kind==='income'?'income':'subscription'});
      }
    }
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function positions(s,at) {
  return s.positions.filter(x=>x.history.some(h=>h.date<=at)).map(x=>({...x,value:[...x.history].filter(h=>h.date<=at).sort((a,b)=>a.date.localeCompare(b.date)).at(-1).amount}));
}
export function dashboard(s,asOf) {
  const id=primary(s)?.id;
  const month=asOf.slice(0,7), start=month+'-01',end=dayAt(month,31);
  const entries=s.entries.filter(e=>e.date>=start && e.date<=asOf);
  const incoming=id?sum(entries.filter(e=>e.kind==='income' && e.to===id)):0;
  const spent=id?sum(entries.filter(e=>e.kind==='expense' && e.from===id)):0;
  const moved=id?sum(entries.filter(e=>!['income','expense'].includes(e.kind)),e=>movement(e,id)):0;
  const current=id?balance(s,id,asOf):0, opening=current-incoming+spent-moved;
  const due=upcoming(s,end,asOf,id);
  const pending=sum(due.filter(x=>x.group!=='income')), expected=sum(due.filter(x=>x.group==='income'));
  const pos=positions(s,asOf),invested=sum(pos.filter(x=>x.kind!=='asset'),x=>x.value), assets=sum(pos.filter(x=>x.kind==='asset'),x=>x.value);
  const bank=sum(s.accounts,a=>balance(s,a.id,asOf));
  return {opening,current,incoming,spent,moved,pending,expected,result:current+expected-pending,invested,assets,bank,wealth:bank+invested+assets,due,end};
}
export function forecast(s,asOf,days) {
  const a=primary(s); if(!a) return [];
  const rows=upcoming(s,addDays(asOf,days),asOf,a.id);
  let value=balance(s,a.id,asOf);
  return Array.from({length:days+1},(_,n)=>{
    const date=addDays(asOf,n);
    for(const r of rows.filter(r=>n===0?r.date<=date:r.date===date)) value+=r.group==='income'?r.amount:-r.amount;
    return {date,value};
  });
}
