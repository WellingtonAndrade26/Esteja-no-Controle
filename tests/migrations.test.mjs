import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const dir=new URL('../supabase/migrations/',import.meta.url);
test('políticas de vales preservam isolamento e snapshot legado filtra o titular',async()=>{
 const db=await PGlite.create(),u=crypto.randomUUID(),v=crypto.randomUUID();
 try{
 await db.exec("create schema auth; create role authenticated; create role anon; create role service_role bypassrls; create function auth.uid() returns uuid language sql as $$select current_setting('test.uid',true)::uuid$$; grant usage on schema auth to authenticated;");
 const tables='accounts transactions categories assets transfers installments credit_cards card_purchases invoice_payments subscriptions recurring_transactions bills future_transactions benefit_wallets benefit_transactions budgets goals goal_contributions debts'.split(' ');
 for(const t of tables)await db.exec('create table public.'+t+'(id uuid primary key,user_id uuid not null);');
 for(const t of ['benefit_wallets','benefit_transactions']){
   await db.exec('alter table '+t+' enable row level security; grant select,insert,update,delete on '+t+' to authenticated;');
   for(const cmd of ['select','insert','update','delete']){
    const policy='create policy '+t+'_'+cmd+'_own on '+t+' for '+cmd+' to authenticated';
    await db.exec(policy+(cmd==='insert'?' with check (auth.uid()=user_id)':' using (auth.uid()=user_id)'));
   }
 }
 for(const file of (await readdir(dir)).filter(f=>f.includes('benefit_policy')||f.includes('legacy_snapshot')))await db.exec(await readFile(new URL(file,dir),'utf8'));
 for(const owner of [u,v])await db.query('insert into benefit_wallets values (gen_random_uuid(),$1)',[owner]);
 const backup=(await db.query('select enc_legacy_snapshot($1) raw',[u])).rows[0].raw;
 assert.equal(backup.benefit_wallets.length,1);assert.equal('user_id' in backup.benefit_wallets[0],false);
 await db.query("select set_config('test.uid',$1,false)",[u]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from benefit_wallets')).rows.length,1);
 await assert.rejects(()=>db.query('insert into benefit_wallets values(gen_random_uuid(),$1)',[v]));
 await assert.rejects(()=>db.query('select enc_legacy_snapshot($1)',[v]));await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/rollback/restore_benefit_policies.sql',import.meta.url),'utf8'));
 }finally{await db.close();}
});
