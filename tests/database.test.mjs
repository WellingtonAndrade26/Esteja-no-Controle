import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {operate,runJob,financialDay} from '../server/service.js';
import {addDays} from '../v2/domain/base.js';
const dir=new URL('../supabase/migrations/',import.meta.url);
test('PostgreSQL: atomicidade, recibos, isolamento, concorrência e fila',async t=>{
 const db=await PGlite.create(),u=crypto.randomUUID(),v=crypto.randomUUID(),now=financialDay();
 try{
 await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls; create function auth.uid() returns uuid language sql as $$select null::uuid$$;');
 for(const file of (await readdir(dir)).filter(f=>f.includes('v2_book')||f.includes('erase_revision')))await db.exec(await readFile(new URL(file,dir),'utf8'));
 await db.query('insert into auth.users values ($1),($2)',[u,v]);
 const rpc=async(name,p)=>{const vals=Object.values(p).map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v);const args=Object.keys(p).map((k,i)=>k+'=> $'+(i+1)).join(',');if(name==='enc_claim')return (await db.query('select * from public.enc_claim('+args+')',vals)).rows;return (await db.query('select public.'+name+'('+args+') as result',vals)).rows[0].result;};
 const op=(body,who=u)=>operate({who,rpc,body});
 const read=()=>op({action:'read'});
 let revision=0;
 async function cmd(opName,p){const body={op:opName,p,id:crypto.randomUUID(),revision};const {revision:r}=await op(body);revision=r;return body;}
 const main=await cmd('account',{name:'Principal',date:now,type:'Digital',amount:100000});
 const acct=main.id;
 await t.test('recibo reapresentado preserva saldo; conflito de conteúdo é recusado',async()=>{const repeated=await op(main);assert.equal(repeated.revision,1);await assert.rejects(()=>op({...main,p:{...main.p,amount:50}}),/conflict/);});
 await t.test('dois comandos com a mesma revisão: somente um confirmado',async()=>{const b={op:'entry',revision,p:{account:acct,name:'Teste',kind:'expense',date:now,amount:30000}};const results=await Promise.allSettled([op({...b,id:crypto.randomUUID()}),op({...b,id:crypto.randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);revision=(await read()).revision;});
 await t.test('falha no segundo item da gravação reverte o primeiro',async()=>{const before=await read();await assert.rejects(()=>rpc('enc_commit',{who:u,request_id:crypto.randomUUID(),digest:'x',expected:revision,changes:[{collection:'entries',key:'new',data:{id:'new'}},{collection:'invalida',key:'bad',data:{}}]}));assert.deepEqual(await read(),before);});
 await t.test('segunda conta recebe livro vazio e papéis públicos não têm acesso administrativo',async()=>{assert.equal((await op({action:'read'},v)).state.entries.length,0);for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from public.enc_records'));await assert.rejects(()=>rpc('enc_snapshot',{who:u}));await db.exec('reset role');}});
 const plan=await cmd('plan',{account:acct,name:'Teste',count:1,amount:900,date:now});
 await t.test('pagamento repetido não cria nova saída',async()=>{const p={due:plan.id+'/1',account:acct,date:now};const paid=await cmd('pay',p);await op(paid);await assert.rejects(()=>cmd('pay',p));assert.equal((await read()).state.entries.length,2);});
 await t.test('novo primário com índice exclusivo',async()=>{const second=await cmd('account',{name:'Carteira',date:now,type:'Carteira',amount:0});await cmd('primary',{account:second.id});assert.deepEqual((await read()).state.accounts.filter(a=>a.primary).map(a=>a.id),[second.id]);});
 const c=await cmd('consent',{account:acct,expires:addDays(now,10),scopes:['transactions','accounts']});await cmd('authorize',{connection:c.id});
 await t.test('sincronização no servidor aplica página e finaliza o job numa transação',async()=>{await cmd('sync',{connection:c.id});const s=(await read()).state;assert.equal(s.imports.length,1);assert.equal(s.resources.length,2);assert.equal((await db.query("select status from enc_jobs")).rows[0].status,'done');await cmd('sync',{connection:c.id});assert.equal((await read()).state.imports.length,1);});
 await t.test('retentativa persistente, exclusão mútua e revogação de trabalho em voo',async()=>{const job=await rpc('enc_enqueue',{who:u,connection:c.id,request_id:crypto.randomUUID()}),lease=crypto.randomUUID();assert.equal((await rpc('enc_claim',{lease_id:lease,wanted:job})).length,1);assert.equal((await rpc('enc_claim',{lease_id:crypto.randomUUID(),wanted:job})).length,0);await rpc('enc_fail',{job_id:job,job_lease:lease,code:'upstream'});const r=(await db.query('select status,available_at>now() as delayed from enc_jobs where id=$1',[job])).rows[0];assert.deepEqual(r,{status:'retry',delayed:true});await cmd('revoke',{connection:c.id});await runJob(rpc,job);assert.equal((await db.query('select status from enc_jobs where id=$1',[job])).rows[0].status,'cancelled');await assert.rejects(()=>cmd('sync',{connection:c.id}));});
 await t.test('exclusão impede reenvio de comando antigo e preserva somente a revisão',async()=>{const result=await op({action:'erase',confirmation:'EXCLUIR'});assert.ok(result.revision>revision);assert.equal(result.state.entries.length,0);await assert.rejects(()=>op(main),/stale_revision/);});
 }finally{await db.close();}
});
