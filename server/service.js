import {convertLegacy} from './legacy.js';
import {assert,blank,one} from '../v2/domain/base.js';
import {execute,diff} from '../v2/domain/book.js';
import {active} from '../v2/open-finance/reconciliation.js';
import {providerFor,fetchConsentedPage} from './providers.js';
const uuid=v=>assert(typeof v==='string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v),'Identificador inválido.');
export const financialDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Campo_Grande',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function runJob(rpc,wanted=null) {
  const lease=crypto.randomUUID(),job=(await rpc('enc_claim',{lease_id:lease,wanted}))[0];
  if(!job)return;
  const date=financialDay();
  try{
    const {revision,records}=await rpc('enc_snapshot',{who:job.owner_id});
    const s={...blank(),...records},c=one(s.connections,job.connection_id);
    assert(active(c,date),'inactive_consent');
    const page=await fetchConsentedPage(c);
    const id=crypto.randomUUID(),params={previous:c.cursor,connection:c.id,rows:page.rows,next:page.next};
    const next=execute(s,{id,op:'bankPage',p:params},date,true);
    await rpc('enc_commit',{who:job.owner_id,request_id:id,digest:'sync:'+job.id,expected:revision,changes:diff(s,next),job_id:job.id,job_lease:lease,has_more:page.hasMore});
  }catch(e){await rpc('enc_fail',{job_id:job.id,job_lease:lease,code:e.message==='inactive_consent'?'inactive_consent':'sync_failed'});throw e;}
}
async function hash(value){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
async function legacy(rpc,who){
 const raw=await rpc('enc_legacy_snapshot',{who});
 const converted=convertLegacy(raw,financialDay());
 return {...converted,stamp:await hash(raw)};
}
export async function operate({who,rpc,body}) {
  if(body.action==='erase'){assert(body.confirmation==='EXCLUIR','Confirmação obrigatória.');await rpc('enc_erase',{who});return operate({who,rpc,body:{action:'read'}});}
  if(body.action==='read') {
    const {records,revision}=await rpc('enc_snapshot',{who});
    return {state:{...blank(),...records},revision};
  }
  if(body.action==='legacyReview'){
    const {issues,counts,stamp}=await legacy(rpc,who);return {issues,counts,stamp};
  }
  if(body.action==='legacyExport')return {legacy:await rpc('enc_legacy_snapshot',{who})};
  const {id,op,p}=body;uuid(id);
  if(op==='sync'){
    const job=await rpc('enc_enqueue',{who,connection:p.connection,request_id:id});
    await runJob(rpc,job);
    return operate({who,rpc,body:{action:'read'}});
  }
  assert(op!=='bankPage','Operação reservada.');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([op,p])))),n=>n.toString(16).padStart(2,'0')).join('');
  const {records,revision,receipt}=await rpc('enc_snapshot',{who,request_id:id});
  const state={...blank(),...records};
  if(receipt){assert(receipt===digest,'request_id_conflict');return {state,revision};}
  assert(body.revision===revision,'stale_revision');
  let next;
  if(op==='legacyImport'){
    assert(!Object.values(records).some(v=>v.length),'O livro 2.0 precisa estar vazio para importar.');
    const info=await legacy(rpc,who);
    assert(info.stamp===p.stamp && !info.issues.length,'Origem alterada ou divergências na conferência.');
    assert(info.state.accounts.length,'Nenhuma conta operacional na origem.');
    next=info.state;
  }else {
    next=execute(state,{id,op,p},financialDay());
    if(op==='consent'){
      const c=one(next.connections,id),provider=providerFor(c.provider);
      const consent=await provider.createConsent(c);
      c.externalConsent=consent.id;
    }
    if(op==='revoke'){
      const c=one(next.connections,p.connection);await providerFor(c.provider).revokeConsent(c);
    }
  }
  await rpc('enc_commit',{who,request_id:id,digest,expected:revision,changes:diff(state,next)});
  return operate({who,rpc,body:{action:'read'}});
}
