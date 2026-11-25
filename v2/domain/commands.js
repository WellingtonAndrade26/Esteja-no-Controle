import {assert,cents,dateKey,shift,dayAt,split,label,choose,one,integer,sum} from './base.js';
import {benefitBalance,cardStats,upcoming} from './engine.js';
export const wallets=['Alimentação','Refeição','Combustível'];
export const accountTypes=['Corrente','Digital','Carteira','Poupança','Salário'];
const posted=(v,now)=>{const d=dateKey(v);assert(d<=now,'Use o planejamento para datas futuras.');return d;};
function account(s,id,date) {
  const a=one(s.accounts,id); assert(a.opened<=date,'Data anterior à abertura da conta.'); return a.id;
}
function record(s,{id,date,name,amount,kind,from=null,to=null,source='manual',category='Outros'}) {
  s.entries.push({id,date,name,amount,kind,from,to,source,category});
}
function settle(s,d,id,source,date) {
  assert(!d.paid,'Este compromisso já foi liquidado.');
  d.paid=date; d.payment=id; d.source=source;
}
export function applyCommand(original,cmd,now) {
  dateKey(now); const {id,op,p={}}=cmd;
  assert(typeof id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id),'Identificador inválido.');
  const s=structuredClone(original);
  const name=()=>label(p.name), value=()=>cents(p.amount), date=()=>posted(p.date,now);
  const category=()=>label(p.category||'Outros');
  switch(op) {
    case 'account': {
      const opened=date(); s.accounts.push({id,name:name(),institution:label(p.institution||p.name),type:choose(p.type,accountTypes),opening:cents(p.amount,-999_999_999_999),opened,primary:!s.accounts.length,source:'manual'});break;
    }
    case 'primary': one(s.accounts,p.account); for(const a of s.accounts)a.primary=a.id===p.account;break;
    case 'entry': {
      const kind=choose(p.kind,['income','expense']),d=date(),a=account(s,p.account,d);
      record(s,{id,date:d,name:name(),amount:value(),kind,from:kind==='expense'?a:null,to:kind==='income'?a:null,category:category()});break;
    }
    case 'transfer': {
      const d=date(),from=account(s,p.from,d),to=account(s,p.to,d);assert(from!==to,'Selecione duas contas diferentes.');
      record(s,{id,date:d,name:p.name?name():'Transferência',amount:value(),kind:'transfer',from,to,source:'transfer'});break;
    }
    case 'position': {
      const amount=cents(p.amount,0),d=date();s.positions.push({id,name:name(),kind:choose(p.kind,['CDB','Tesouro','Fundo','Ações','ETF','Caixinha','Outro','asset']),institution:label(p.institution||p.name),history:[{date:d,amount}],source:'manual'});break;
    }
    case 'valuation': {
      const position=one(s.positions,p.position),d=date(),amount=cents(p.amount,0);
      assert(d>=position.history[0].date,'Data anterior à primeira posição.'); position.history.push({date:d,amount});break;
    }
    case 'invest': case 'redeem': {
      const position=one(s.positions,p.position),d=date(),amount=value(),a=account(s,p.account,d);
      assert(position.kind!=='asset','Selecione um investimento.');
      const latest=[...position.history].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
      assert(d>=latest.date,'Movimente a partir da última posição.');
      const deposit=op==='invest';const updated=latest.amount+(deposit?amount:-amount);
      cents(updated,0);position.history.push({date:d,amount:updated});
      record(s,{id,date:d,name:(deposit?'Aporte em ':'Resgate de ')+position.name,amount,kind:op,from:deposit?a:null,to:deposit?null:a,source:'transfer',category:'Investimento'});break;
    }
    case 'benefit': case 'benefitEdit': case 'benefitDelete': {
      const old=op==='benefit'?null:one(s.benefits,p.benefit);
      if(old)s.benefits=s.benefits.filter(x=>x.id!==old.id);
      if(op!=='benefitDelete')s.benefits.push({id:old?.id||id,name:name(),wallet:choose(p.wallet,wallets),direction:choose(p.direction,['credit','debit']),date:date(),amount:value(),source:'manual'});
      for(const w of new Set([p.wallet,old?.wallet].filter(Boolean))) {
        const days=[...new Set(s.benefits.filter(x=>x.wallet===w).map(x=>x.date))];
        assert(days.every(d=>benefitBalance(s,w,d)>=0),'Saldo insuficiente no histórico do vale.');
      } break;
    }
    case 'plan': case 'bill': {
      const d=dateKey(p.date),a=account(s,p.account,now),n=op==='plan'?integer(p.count,1,600,'Quantidade inválida.'):1;
      const amounts=split(value(),n), title=name();
      const group=op==='plan'?'installment':'bill';
      s.plans.push({id,name:title,total:p.amount,count:n,institution:label(p.institution||'Não informada'),method:label(p.method||'Débito em conta'),category:category(),source:'manual'});
      amounts.forEach((amount,i)=>s.dues.push({id:id+'/'+(i+1),plan:id,part:i+1,count:n,name:title,date:shift(d,i),amount,account:a,group,created:now,paid:null,source:'manual'})); break;
    }
    case 'recurring': {
      const start=dateKey(p.date),end=p.end?dateKey(p.end):null;assert(!end||end>=start,'Fim anterior ao início.');
      s.rules.push({id,name:name(),amount:value(),account:account(s,p.account,now),kind:choose(p.kind,['income','expense']),start,end,source:'automation'});break;
    }
    case 'pay': {
      let d=s.dues.find(x=>x.id===p.due);const paid=date();
      if(!d){d=upcoming(s,dateKey(p.occurrence),now,p.assigned).find(x=>x.id===p.due && x.rule);assert(d,'Compromisso não encontrado.');d={...d,created:now,paid:null};s.dues.push(d);}
      assert(!d.card && paid>=d.created,'Data ou tipo de pagamento inválido.');
      if(d.plan)assert(!s.dues.some(x=>x.plan===d.plan && x.part<d.part && !x.paid),'Pague a parcela anterior primeiro.');
      const a=account(s,p.account,paid),income=d.group==='income';
      settle(s,d,id,d.group==='installment'?'installment':d.rule?'automation':'manual',paid);
      record(s,{id,name:d.name,date:paid,amount:d.amount,kind:income?'income':'expense',to:income?a:null,from:income?null:a,source:d.source,category:d.group});break;
    }
    case 'card': {
      assert(/^\d{4}$/.test(p.last4),'Informe os quatro últimos dígitos.');
      s.cards.push({id,name:name(),institution:label(p.institution||p.name),brand:label(p.brand),last4:p.last4,closing:integer(p.closing,1,31,'Fechamento inválido.'),due:integer(p.due,1,31,'Vencimento inválido.'),limit:value(),account:account(s,p.account,now),source:'manual'});break;
    }
    case 'purchase': {
      const card=one(s.cards,p.card),d=date(),parts=split(value(),p.count),title=name();
      assert(cardStats(s,card.id).available>=p.amount,'Limite disponível insuficiente.');
      let close=dayAt(d.slice(0,7),card.closing);
      if(d>close)close=shift(close,1,card.closing);
      let first=dayAt(close.slice(0,7),card.due);
      if(first<=close)first=shift(first,1,card.due);
      s.purchases.push({id,name:title,date:d,amount:p.amount,card:card.id,count:parts.length,category:category(),source:'card'});
      parts.forEach((amount,i)=>s.dues.push({id:id+'/'+(i+1),purchase:id,part:i+1,count:parts.length,name:title,amount,date:shift(first,i,card.due),created:d,account:card.account,group:'invoice',card:card.id,paid:null,source:'card'}));break;
    }
    case 'invoice': {
      const card=one(s.cards,p.card),due=dateKey(p.due),d=date(),a=account(s,p.account,d);
      const rows=s.dues.filter(x=>x.card===card.id && x.date===due && !x.paid && x.created<=d);
      const amount=value(),outstanding=sum(rows);
      assert(rows.length && outstanding===(p.expected??amount) && amount<=outstanding,'Fatura alterada ou já paga. Atualize a tela.');
      let remaining=amount;
      for(const row of rows.sort((a,b)=>a.id.localeCompare(b.id))){
        if(!remaining)break;
        const paid=Math.min(remaining,row.amount);
        if(paid<row.amount){
          s.dues.push({...row,id:row.id+'/'+id,amount:row.amount-paid});
          row.amount=paid;
        }
        settle(s,row,id,'card',d);remaining-=paid;
      }
      record(s,{id,name:'Fatura '+card.name,date:d,amount:p.amount,kind:'expense',from:a,source:'card',category:'Fatura'});break;
    }
    default: throw new Error('Operação desconhecida.');
  }
  return s;
}
