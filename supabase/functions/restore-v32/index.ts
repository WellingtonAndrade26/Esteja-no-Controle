/**
 * WA Digital Labs · Esteja no Controle v3.2
 * Authenticated, project-scoped, transactional restore. No service secrets in the browser.
 * The Postgres RPC is private to service_role; this endpoint verifies every user JWT itself.
 */
const BASE=Deno.env.get('SUPABASE_URL')||'';
const ANON=Deno.env.get('SUPABASE_ANON_KEY')||'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const allowedExact=new Set([
  'https://controle.wadigitallabs.com',
  'https://esteja-no-controle-prisma.pages.dev'
]);
const previewPattern=/^https:\/\/[a-z0-9-]+\.esteja-no-controle-prisma\.pages\.dev$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tables=['goals','goal_contributions','categories','budgets'];
const collections=['accounts','entries','plans','dues','rules','cards','purchases',
  'positions','benefits','connections','imports','resources','logs'];
const encoder=new TextEncoder();
const secureOrigin=o=>!o||allowedExact.has(o)||previewPattern.test(o);
const fail=(msg,status=400)=>new Response(JSON.stringify({error:msg}),{
  status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function authenticate(req){
  const bearer=req.headers.get('authorization')||'';
  if(!bearer.startsWith('Bearer ')||bearer.length<25)throw new Error('auth');
  const r=await fetch(BASE+'/auth/v1/user',{headers:{apikey:ANON,Authorization:bearer},cache:'no-store'});
  if(!r.ok)throw new Error('auth');
  const user=await r.json();
  if(!uuid.test(user?.id||'')||user?.is_anonymous===true)throw new Error('auth');
  return user.id;
}
async function rpc(name,args){
  const r=await fetch(BASE+'/rest/v1/rpc/'+name,{method:'POST',cache:'no-store',
    headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'},
    body:JSON.stringify(args)});
  if(!r.ok){
    const details=await r.json().catch(()=>({}));
    const raw=[details?.message,details?.details,details?.hint].filter(Boolean).join(' ');
    if(raw.includes('restore_state_changed'))throw new Error('state_changed');
    if(raw.includes('restore_legacy_categories_in_use'))throw new Error('legacy_categories');
    throw new Error('restore_rejected');
  }
  return r.json();
}
function verifyBackup(wrapper,who){
  const p=wrapper?.payload;
  if(wrapper?.format!=='wa-esteja-no-controle-full'||wrapper?.encrypted!==false||
    wrapper?.schema!==1||p?.schema!==1||p?.format!==wrapper.format||
    p?.mode!=='cloud'||p?.userId!==who||typeof wrapper?.sha256!=='string'||
    !/^[a-f0-9]{64}$/.test(wrapper.sha256)||
    !Number.isSafeInteger(p.revision)||p.revision<0||!p.data||typeof p.data!=='object')
    throw new Error('invalid_backup');
  const d=p.data;
  if(d.book?.version!==2)throw new Error('invalid_backup');
  let count=0;
  for(const k of collections){
    if(!Array.isArray(d.book[k]))throw new Error('invalid_backup');
    count+=d.book[k].length;
    const keys=new Set();
    for(const entry of d.book[k]){
      const id=k==='resources'?entry?.key:entry?.id;
      if(typeof id!=='string'||!id||id.length>200||keys.has(id))throw new Error('invalid_backup');
      keys.add(id);
    }
  }
  for(const t of tables){
    if(!Array.isArray(d[t]))throw new Error('invalid_backup');
    count+=d[t].length;
    const keys=new Set();
    for(const item of d[t]){
      if(!uuid.test(item?.id||'')||item?.user_id!==who||keys.has(item.id))throw new Error('invalid_backup');
      keys.add(item.id);
    }
  }
  if(count>30000)throw new Error('invalid_backup');
  const goals=new Set(d.goals.map(x=>x.id));
  const cats=new Set(d.categories.map(x=>x.id));
  for(const a of d.goal_contributions)if(!goals.has(a.goal_id))throw new Error('invalid_backup');
  for(const a of d.budgets)if(!cats.has(a.category_id))throw new Error('invalid_backup');
  const counts={
    contas:d.book.accounts.length,movimentacoes:d.book.entries.length,
    compromissos:d.book.dues.length,parcelamentos:d.book.plans.length,
    cartoes:d.book.cards.length,metas:d.goals.length,aportes:d.goal_contributions.length,
    categorias:d.categories.length,orcamentos:d.budgets.length
  };
  for(const [k,v] of Object.entries(counts))if(p.counts?.[k]!==v)throw new Error('invalid_backup');
  return p;
}
async function verifyHash(wrapper){
  const raw=JSON.stringify(wrapper.payload);
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(raw));
  const hex=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  if(hex!==wrapper.sha256)throw new Error('invalid_backup');
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin');
  if(!secureOrigin(origin))return fail('Origem não permitida.',403);
  const cors=origin?{
    'Access-Control-Allow-Origin':origin,'Vary':'Origin',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'
  }:{};
  const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,
    headers:{'Content-Type':'application/json','Cache-Control':'no-store',...cors}});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Cache-Control':'no-store'}});
  if(req.method!=='POST')return respond({error:'Método não permitido.'},405);
  if(!BASE||!ANON||!SERVICE)return respond({error:'Serviço indisponível.'},503);
  const len=Number(req.headers.get('content-length')||0);
  if(len>6000000)return respond({error:'Arquivo muito grande para restauração automática.'},413);
  let who;
  try{who=await authenticate(req);}catch{return respond({error:'Entre novamente na sua conta.'},401);}
  try{
    const raw=await req.text();
    if(raw.length>6000000)return respond({error:'Arquivo excede o limite de tamanho.'},413);
    const body=JSON.parse(raw);
    if(body?.action==='preflight'){
      return respond(await rpc('enc_restore_v32',{p_who:who,p_apply:false}));
    }
    if(body?.action!=='restore'||body.confirmation!=='RESTAURAR')return respond({error:'Confirmação inválida.'},400);
    if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||
      typeof body.expectedToken!=='string'||!/^[a-f0-9]{32}$/.test(body.expectedToken))
      return respond({error:'Analise a conta novamente antes de restaurar.'},400);
    const payload=verifyBackup(body.backup,who);
    await verifyHash(body.backup);
    const result=await rpc('enc_restore_v32',{p_who:who,p_apply:true,
      p_expected_revision:body.expectedRevision,p_expected_token:body.expectedToken,
      p_data:payload.data});
    return respond(result);
  }catch(e){
    const type=e?.message;
    if(type==='state_changed')return respond({error:'Os dados mudaram desde a análise. Atualize a página e faça um novo backup preventivo.'},409);
    if(type==='legacy_categories')return respond({error:'Existem categorias antigas vinculadas a registros que não podem ser apagados. Restauração bloqueada sem alterar dados.'},409);
    if(type==='invalid_backup')return respond({error:'Backup inválido, incompleto ou modificado. Nenhum dado foi alterado.'},400);
    if(type==='restore_rejected')return respond({error:'O banco recusou a restauração. A transação foi cancelada sem alteração parcial.'},409);
    return respond({error:'Não foi possível concluir. Confira seus dados antes de tentar novamente.'},400);
  }
});
