import {today,uid,one,blank} from './domain/base.js';
import {execute} from './domain/book.js';
import {demo} from './domain/demo.js';
import {SandboxProvider} from './open-finance/provider.js';
import {active} from './open-finance/reconciliation.js';
export const DEMO_KEY='enc-v2-sandbox-2';
let client, revision=0, state, cloud=false, initialized=false;
export const isCloud=()=>cloud;
export const data=()=>state;
export const enabled=()=>!!(globalThis.ENC_V2?.url && globalThis.ENC_V2?.key);
function local(){
  const raw=localStorage.getItem(DEMO_KEY);
  if(!raw)return {revision:0,state:demo(today()),receipts:{}};
  const value=JSON.parse(raw);
  if(value.state?.version!==2)throw new Error('Demonstração incompatível. Exporte os dados antes de restaurar.');
  return value;
}
function set(v){state=v.state;revision=v.revision;}
async function remote(body){
  const {data:{session},error}=await client.auth.getSession();if(error || !session)throw new Error('Entre novamente.');
  const r=await fetch(globalThis.ENC_V2.url+'/functions/v1/finance-v2',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',apikey:globalThis.ENC_V2.key,Authorization:'Bearer '+session.access_token},body:JSON.stringify(body)});
  const value=await r.json().catch(()=>({}));if(!r.ok){throw new Error(r.status===409?'Os dados mudaram em outra sessão. Atualize e confira antes de repetir.':value.error||'Falha na sincronização.');}return value;
}
export async function refresh(){
  if(cloud){set(await remote({action:'read'}));}else set(local());
}
export async function init(){
  if(enabled() && !initialized){
    const {createClient}=await import('./vendor/auth.js');
    client=createClient(globalThis.ENC_V2.url,globalThis.ENC_V2.key,{auth:{storageKey:'enc-v2-auth',persistSession:true,detectSessionInUrl:true}});
    cloud=!!(await client.auth.getSession()).data.session;initialized=true;
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT' && cloud){cloud=false;state=blank();setTimeout(()=>location.reload(),0);}
    });
  }
  await refresh();
}
export async function login(email,password){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw new Error('Falha ao entrar. Confira e-mail e senha.');cloud=true;state=blank();await refresh();}
export async function logout(){if(client){const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;}cloud=false;await refresh();}
export async function dispatch(op,p,id=uid()){
  if(cloud){set(await remote({id,op,p,revision}));return;}
  const write=async()=>{
    const prev=local(), cmd={op,id,p},tag=JSON.stringify([op,p]);
    if(prev.receipts[id]){if(prev.receipts[id]!==tag)throw new Error('Identificador reutilizado.');set(prev);return;}
    if(prev.revision!==revision){set(prev);throw new Error('Dados atualizados em outra aba. Confira e tente novamente.');}
    let next;
    if(op==='sync'){
      const c=one(prev.state.connections,p.connection);if(!active(c,today()))throw new Error('Consentimento inativo.');
      const page=await new SandboxProvider().syncConnection(c,c.cursor);
      next=execute(prev.state,{id,op:'bankPage',p:{connection:c.id,previous:c.cursor,rows:page.rows,next:page.next}},today(),true);
    }else next=execute(prev.state,cmd,today());
    const snapshot={state:next,revision:prev.revision+1,receipts:{...prev.receipts,[id]:tag}};
    localStorage.setItem(DEMO_KEY,JSON.stringify(snapshot));set(snapshot);
  };
  if(navigator.locks)await navigator.locks.request(DEMO_KEY,write);else await write();
}
export async function erase(){
 if(cloud){set(await remote({action:'erase',confirmation:'EXCLUIR'}));return;}
 const eraseLocal=()=>{const previous=local();const clean={state:blank(),revision:previous.revision+1,receipts:{}};localStorage.setItem(DEMO_KEY,JSON.stringify(clean));set(clean);};
 if(navigator.locks)await navigator.locks.request(DEMO_KEY,eraseLocal);else eraseLocal();
}

export const legacyReview=()=>remote({action:'legacyReview'});
export const legacyExport=()=>remote({action:'legacyExport'});
