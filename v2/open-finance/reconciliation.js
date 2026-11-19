import {assert,choose,label,one,dateKey,addDays} from '../domain/base.js';
import {validTransaction,scopes} from './provider.js';
export function active(c,now){return c.status==='active' && c.expires>=now;}
export function candidates(s,t) {
  const taken=new Set(s.imports.filter(i=>i.local===t.local && i.direction===t.direction && (i.status==='matched'||i.status==='posted')).map(i=>i.entry));
  return s.entries.filter(e=>!taken.has(e.id) && e.amount===t.amount && e.date>=addDays(t.date,-3) && e.date<=addDays(t.date,3)
    && (t.direction==='expense'?e.from===t.local:e.to===t.local));

}
const scopeFor={account:'accounts',balance:'accounts',transaction:'transactions',card:'cards',invoice:'invoices',investment:'investments',loan:'loans'};
export function applyBankCommand(original,cmd,now,internal=false) {
  const s=structuredClone(original),{op,p,id}=cmd;
  const log=(event,connection)=>{s.logs.push({event,connection,date:now});};
  if(op==='consent'){
    one(s.accounts,p.account);
    const permissions=[...new Set(p.scopes)];assert(permissions.length && permissions.every(x=>scopes.includes(x)),'Escolha os dados autorizados.');
    const expires=dateKey(p.expires);assert(expires>now,'A validade deve ser futura.');
    s.connections.push({id,provider:'sandbox',institution:'Banco Horizonte · simulado',account:p.account,status:'pending',created:now,expires,scopes:permissions,cursor:null,lastSync:null});
    log('consent_created',id);return s;
  }
  if(op==='reconcile'){
    const t=one(s.imports,p.import);assert(t.status==='review','Item já conciliado.');
    if(p.action==='match'){
      assert(candidates(s,t).some(x=>x.id===p.entry),'A correspondência mudou.');
      t.status='matched';t.entry=p.entry;
    }else if(p.action==='transfer'){
      const a=one(s.accounts,t.local),other=one(s.accounts,p.other);
      assert(a.id!==other.id && t.date>=a.opened && t.date>=other.opened && t.date<=now,'Contas ou data inválidas.');
      s.entries.push({id,name:t.name,kind:'transfer',amount:t.amount,date:t.date,from:t.direction==='expense'?a.id:other.id,to:t.direction==='income'?a.id:other.id,category:'Transferência',source:'open_finance'});
      t.status='posted';t.entry=id;
    }else if(p.action==='post'){
      const a=one(s.accounts,t.local);assert(t.date>=a.opened && t.date<=now,'Data fora do período da conta.');
      s.entries.push({id,name:t.name,kind:t.direction,amount:t.amount,date:t.date,from:t.direction==='expense'?t.local:null,to:t.direction==='income'?t.local:null,category:'Importado',source:'open_finance'});
      t.status='posted';t.entry=id;
    }else{choose(p.action,['ignore']);t.status='ignored';}
    log('data_reconciled',t.connection);return s;
  }
  const c=one(s.connections,p.connection);
  if(op==='authorize'){assert(c.provider==='sandbox' && c.status==='pending' && c.expires>=now,'Consentimento indisponível.');c.status='active';log('connection_created',c.id);}
  else if(op==='revoke'){c.status='revoked';log('consent_revoked',c.id);}
  else if(op==='bankPage'){
    assert(internal && active(c,now),'Sincronização não autorizada.');
    assert(c.cursor===(p.previous??null),'Cursor desatualizado.');log('sync_started',c.id);
    for(const raw of p.rows){
      assert(c.scopes.includes(scopeFor[raw.type]),'Recurso fora do consentimento.');
      const key=JSON.stringify([c.provider,c.institution,raw.type,raw.account||'',label(raw.id)]);
      if(raw.type!=='transaction'){
        const existing=s.resources.find(r=>r.key===key);
        const row={...raw,key,connection:c.id,provider:c.provider,source:'open_finance'};
        if(existing)Object.assign(existing,row);else s.resources.push(row);continue;
      }
      const t=validTransaction(raw);
      if(s.imports.some(x=>x.key===key))continue;
      const fingerprint=JSON.stringify([c.provider,t.account,t.date,t.amount,t.direction,t.name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim()]);
      s.imports.push({...t,id:key,key,external_id:t.id,provider:c.provider,connection:c.id,source:'open_finance',local:c.account,status:'review',fingerprint});
    }
    c.cursor=p.next;c.lastSync=now;log('sync_completed',c.id);
  }else throw new Error('Operação bancária desconhecida.');
  return s;
}
