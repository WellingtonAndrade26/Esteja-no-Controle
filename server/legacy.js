// Read-only conversion. All imported openings are derived from the materialized v1 balance.
// Ambiguities prevent activation, including unmatched invoice payments and unclassified benefits.
import {blank,assert,dayAt,shift,split,sum,dateKey} from '../v2/domain/base.js';
import {movement,benefitBalance} from '../v2/domain/engine.js';
const toCents=v=>{const n=Number(v)*100;assert(Number.isFinite(n)&&Math.abs(n-Math.round(n))<0.00001,'Valor legado sem precisão de centavos.');return Math.round(n);};
const lookup=(list,id)=>list.find(x=>x.id===id);
const when=x=>String(x||'').slice(0,10);
const walletNames={food:'Alimentação',meal:'Refeição',fuel:'Combustível'};
export function convertLegacy(raw,now){
 const s=blank(),issues=[],counts=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v.length]));
 const rows=k=>raw[k]||[];
 const review=message=>{if(!issues.includes(message))issues.push(message);};
 const operational=rows('accounts').filter(a=>a.type!=='investment');
 const main=operational.find(a=>a.is_primary)||operational[0];
 if(operational.filter(a=>a.is_primary).length>1)review('Há mais de uma conta principal na origem.');
 for(const a of operational)s.accounts.push({id:a.id,name:a.name,institution:a.institution||a.name,type:({checking:'Corrente',digital:'Digital',savings:'Poupança',salary:'Salário',wallet:'Carteira'})[a.type]||a.type,opened:when(a.created_at)||now,opening:toCents(a.balance),primary:a.id===main?.id,source:'system'});
 for(const a of rows('accounts').filter(a=>a.type==='investment'))s.positions.push({id:a.id,name:a.name,institution:a.institution||a.name,kind:'Outro',source:'system',history:[{date:now,amount:toCents(a.balance)}]});
 for(const a of rows('assets'))s.positions.push({id:a.id,name:a.name,institution:'Cadastro anterior',kind:'asset',source:'system',history:[{date:now,amount:toCents(a.value)}]});
 for(const t of rows('transactions')){
   if(!lookup(operational,t.account_id)){if(!rows('accounts').some(a=>a.type==='investment'&&a.id===t.account_id))review('Há lançamento sem conta identificável.');continue;}
   if(t.occurred_on>now){review('Há lançamento futuro já incluído no saldo corrente.');continue;}
   const category=lookup(rows('categories'),t.category_id)?.name||'Outros';
   if(t.kind==='income' && /^(VA|VR|Vale Alimentação|Vale Refeição|Vale Combustível)$/i.test(category)){review('Há crédito de vale no extrato bancário antigo. Confira a classificação na origem.');}
   const inFlow=t.kind==='income';s.entries.push({id:t.id,name:t.description,amount:toCents(t.amount),date:t.occurred_on,kind:t.kind,from:inFlow?null:t.account_id,to:inFlow?t.account_id:null,category,source:t.source_type==='installment_payment'?'installment':t.source_type==='recurring'?'automation':'manual'});
 }
 for(const t of rows('transfers')){
   const from=lookup(operational,t.from_account_id)?.id||null,to=lookup(operational,t.to_account_id)?.id||null;
   if(from||to)s.entries.push({id:t.id,name:t.note||'Transferência',amount:toCents(t.amount),date:t.transferred_on,kind:'transfer',from,to,source:'transfer',category:'Transferência'});
 }
 for(const a of s.accounts){
   const moves=s.entries.filter(e=>e.from===a.id||e.to===a.id);
   a.opened=[a.opened,...moves.map(e=>e.date)].sort()[0];a.opening-=sum(moves,e=>movement(e,a.id));
 }
 const account=id=>lookup(s.accounts,id)?.id || (!id?main?.id:null);
 for(const i of rows('installments').filter(i=>!i.card_id && i.payment_method!=='credit_card')){
   const n=i.installments_total,paid=i.installments_paid;
   if(!Number.isInteger(n)||n<1||n>600||paid<0||paid>n||(!i.next_due&&paid<n)){review('Parcelamento com cronograma incompleto.');continue;}
   const total=toCents(i.total_amount),regular=toCents(i.installment_amount);
   const final=total-regular*(n-1);
   if(final<=0||Math.abs(final-regular)>n){review('Total e valor das parcelas divergem na origem.');continue;}
   s.plans.push({id:i.id,name:i.name,total,count:n,priorPaid:paid,institution:'Cadastro anterior',method:i.payment_method||'Outro',category:i.category||'Outros',source:'system'});
   for(let part=paid+1;part<=n;part++)s.dues.push({id:i.id+'/'+part,plan:i.id,part,count:n,name:i.name,date:shift(i.next_due,part-paid-1),amount:part===n?final:regular,account:main?.id,group:'installment',created:now,paid:null,source:'system'});
 }
 for(const c of rows('credit_cards'))s.cards.push({id:c.id,name:c.name,institution:c.name,brand:c.brand||'Cartão',last4:c.last4||'••••',closing:c.closing_day,due:c.due_day,limit:toCents(c.limit_amount),account:main?.id,source:'system'});
 for(const p of rows('card_purchases')){
   const c=lookup(s.cards,p.card_id);if(!c){review('Compra sem cartão correspondente.');continue;}
   const amount=toCents(p.amount),month=String(p.invoice_month).slice(0,7);
   let due=dayAt(month,c.due);if(c.due<=c.closing)due=shift(due,1,c.due);
   s.purchases.push({id:p.id,name:p.description,date:p.purchased_on,amount,card:c.id,count:1,category:p.category||'Outros',source:'card'});
   s.dues.push({id:p.id+'/1',purchase:p.id,part:p.current_installment,count:p.installments_total,name:p.description,date:due,created:p.purchased_on,amount,account:main?.id,group:'invoice',card:c.id,legacyMonth:month,paid:null,source:'card'});
 }
 for(const p of rows('invoice_payments').slice().sort((a,b)=>a.paid_on.localeCompare(b.paid_on))){
   const c=lookup(s.cards,p.card_id),m=String(p.invoice_month).slice(0,7);let left=toCents(p.amount);
   const matches=s.entries.filter(e=>e.from===p.account_id && e.kind==='expense' && e.source==='manual' && e.amount===left && e.date===p.paid_on && e.name==='Pagamento fatura '+c?.name);
   if(matches.length!==1){review('Pagamento de fatura sem um único débito bancário correspondente.');continue;}matches[0].source='card';
   for(const d of s.dues.filter(d=>d.card===p.card_id && d.legacyMonth===m && !d.paid)){
     if(!left)break;const used=Math.min(left,d.amount);
     if(used<d.amount)s.dues.push({...d,id:d.id+'/'+p.id,amount:d.amount-used});
     d.amount=used;d.paid=p.paid_on;d.payment=matches[0].id;left-=used;
   }
   if(left)review('Há pagamento maior que as compras identificadas na fatura.');
 }
 for(const c of rows('credit_cards')){
   const used=sum(s.dues.filter(d=>d.card===c.id&&!d.paid));if(used!==toCents(c.used_amount))review('O limite utilizado do cartão diverge das compras e pagamentos registrados.');
 }
 for(const table of ['subscriptions','recurring_transactions'])for(const r of rows(table).filter(r=>r.active)){
   const subscription=table==='subscriptions',day=subscription?r.renewal_day:r.due_day;
   const start=dayAt(now.slice(0,7),day),group=subscription?'subscription':'recurring';
   const accounted=rows('bills').some(b=>b.source_type===group && b.source_id===r.id && String(b.source_period).startsWith(now.slice(0,7)))||rows('transactions').some(t=>t.source_type===group && t.source_id===r.id && String(t.source_period).startsWith(now.slice(0,7)));
   s.rules.push({id:r.id,name:r.name||r.description,amount:toCents(r.amount),account:account(r.account_id),kind:r.kind||'expense',start:accounted||start<now?shift(start,1,day):start,anchor:day,end:null,source:'automation'});
 }
 for(const b of rows('bills').filter(b=>!['paid','cancelled','canceled'].includes(b.status))){
   s.dues.push({id:b.id,name:b.name,amount:toCents(b.amount),account:account(b.account_id),group:b.source_type==='subscription'?'subscription':'bill',created:now,date:b.due_on,paid:null,source:'system'});
 }
 for(const f of rows('future_transactions').filter(f=>f.status==='planned'))s.dues.push({id:f.id,name:f.description,amount:toCents(f.amount),account:account(f.account_id),group:f.kind==='income'?'income':'bill',created:now,date:f.planned_on,paid:null,source:'system'});
 for(const w of rows('benefit_wallets')){
   const wallet=walletNames[w.kind];if(!wallet){review('Tipo de vale sem equivalência.');continue;}
   for(const t of rows('benefit_transactions').filter(t=>t.wallet_id===w.id))s.benefits.push({id:t.id,wallet,direction:t.kind==='income'?'credit':'debit',name:t.description||'Vale',date:t.occurred_on,amount:toCents(t.amount),source:'system'});
   const adjustment=toCents(w.balance)-benefitBalance(s,wallet);if(adjustment){review('O saldo de vale diverge de seu histórico.');}
 }
 if(s.dues.some(x=>!x.account)||s.rules.some(x=>!x.account))review('Há compromisso sem conta operacional definida.');
 return {state:s,issues,counts};
}
