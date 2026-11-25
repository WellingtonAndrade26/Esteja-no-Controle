-- Install once on the designated Supabase project. Configure the URL for another environment.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $setup$
declare token text; scheduler_name text='enc-v2-sync-retry';
begin
  if exists(select 1 from cron.job where jobname=scheduler_name) then return; end if;
  token:='encw_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  perform vault.create_secret(token,'enc_v2_queue_worker','Drains queued sync jobs only');
  insert into public.enc_worker_key(singleton,verifier) values(true,encode(sha256(convert_to(token,'UTF8')),'hex'))
    on conflict(singleton) do update set verifier=excluded.verifier;
  perform cron.schedule(scheduler_name,'*/5 * * * *',$job$
    select net.http_post(
        url:='https://iyfknonepcarerlpcxlu.supabase.co/functions/v1/finance-v2',
        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
          (select decrypted_secret from vault.decrypted_secrets where name='enc_v2_queue_worker')),
        body:='{}'::jsonb,timeout_milliseconds:=30000
    ) where exists(select 1 from public.enc_jobs
        where (status in ('queued','retry') and available_at<=now()) or (status='running' and leased_until<=now()));
  $job$);
end $setup$;
