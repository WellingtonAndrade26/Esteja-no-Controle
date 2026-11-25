import {operate,runJob} from './service.js';
const allowed=new Set((Deno.env.get('ENC_ALLOWED_ORIGINS')||BUILD_ALLOWED_ORIGINS).split(',').filter(Boolean));
const base=Deno.env.get('SUPABASE_URL');
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
async function rpc(name,params){
  const res=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(params)});
  if(!res.ok){const info=await res.json().catch(()=>({}));throw new Error(['stale_revision','request_id_conflict','inactive_consent','lost_lease'].includes(info.message)?info.message:'Falha no banco de dados.');}
  const text=await res.text();return text?JSON.parse(text):null;
}
Deno.serve(async req=>{
  const origin=req.headers.get('Origin'),headers={'Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
  const respond=(value,status)=>new Response(JSON.stringify(value),{headers,status});
  if(origin && !allowed.has(origin))return respond({error:'Origem não permitida.'},403);
  if(origin)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond({error:'Método inválido.'},405);
  try{
    const bearer=req.headers.get('Authorization')||'';
    const token=Deno.env.get('ENC_JOB_TOKEN');
    if(!origin && token && bearer==='Bearer '+token){await runJob(rpc);return respond({ok:true},200);}
    if(!origin && /^Bearer encw_[0-9a-f]{64}$/.test(bearer)){
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bearer.slice(7)));
      const fingerprint=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
      if(!await rpc('enc_worker_valid',{fingerprint}))return respond({error:'Acesso negado.'},401);
      await runJob(rpc);return respond({ok:true},200);
    }
    if(!bearer.startsWith('Bearer '))return respond({error:'Entre novamente.'},401);
    const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY'),Authorization:bearer}});
    if(!auth.ok)return respond({error:'Entre novamente.'},401);
    const {id:who}=await auth.json();
    const reader=req.body?.getReader(),chunks=[];let size=0;
    if(!reader)return respond({error:'Pedido inválido.'},400);
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();return respond({error:'Pedido muito grande.'},413);}chunks.push(value);}
    const body=JSON.parse(await new Blob(chunks).text());const result=await operate({who,rpc,body});
    return respond(result,200);
  }catch(e){const msg=String(e.message);const conflict=['stale_revision','request_id_conflict','lost_lease'].includes(msg);
    const internal=msg==='Falha no banco de dados.'||e instanceof TypeError;
    console.warn('finance_v2_error',{code:conflict?'conflict':internal?'backend_error':'invalid_request'});
    return respond({error:internal?'Serviço indisponível. Tente novamente.':msg.slice(0,160)},conflict?409:internal?503:400);}
});
