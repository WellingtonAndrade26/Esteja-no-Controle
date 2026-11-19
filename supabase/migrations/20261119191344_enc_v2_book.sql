-- The v2 ledger is separate from all v1 relations on the shared project.
create table public.enc_books (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision >= 0)
);
create table public.enc_records (
  owner_id uuid not null references public.enc_books on delete cascade,
  collection text not null check(collection in ('accounts','entries','plans','dues','rules','cards','purchases','positions','benefits','connections','imports','resources','logs')),
  key text not null, data jsonb not null check(jsonb_typeof(data)='object'),
  primary key(owner_id,collection,key)
);
create unique index enc_one_primary on public.enc_records(owner_id)
  where collection='accounts' and data->'primary'='true'::jsonb;
create table public.enc_receipts (
  owner_id uuid not null references public.enc_books on delete cascade,
  command_id uuid not null, request_hash text not null, revision bigint not null,
  primary key(owner_id,command_id)
);
create table public.enc_jobs (
  id uuid primary key, owner_id uuid not null references public.enc_books on delete cascade,
  connection_id text not null, status text not null default 'queued'
    check(status in ('queued','running','retry','done','failed','cancelled')),
  attempts integer not null default 0, available_at timestamptz not null default now(),
  lease uuid, leased_until timestamptz, error_code text
);
create index enc_jobs_owner on public.enc_jobs(owner_id, connection_id);
create unique index enc_one_sync on public.enc_jobs(owner_id,connection_id) where status in ('queued','running','retry');
create index enc_jobs_ready on public.enc_jobs(available_at) where status in ('queued','retry','running');
alter table public.enc_books enable row level security;
alter table public.enc_records enable row level security;
alter table public.enc_receipts enable row level security;
alter table public.enc_jobs enable row level security;
revoke all on public.enc_books, public.enc_records, public.enc_receipts, public.enc_jobs from public, anon, authenticated;
grant select,insert,update,delete on public.enc_books, public.enc_records,public.enc_receipts,public.enc_jobs to service_role;
create policy enc_books_owner on public.enc_books for select to authenticated using(owner_id=(select auth.uid()));
create policy enc_records_owner on public.enc_records for select to authenticated using(owner_id=(select auth.uid()));
create policy enc_receipts_backend on public.enc_receipts to service_role using(true) with check(true);
create policy enc_jobs_backend on public.enc_jobs to service_role using(true) with check(true);

-- Consistent one-statement read, including an optional receipt for retry resolution.
create function public.enc_snapshot(who uuid, request_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('revision',coalesce((select revision from public.enc_books where owner_id=who),0),
    'records',coalesce((select jsonb_object_agg(collection,items) from (
      select collection,jsonb_agg(data order by key) items from public.enc_records where owner_id=who group by collection
    ) grouped),'{}'::jsonb),
    'receipt',(select request_hash from public.enc_receipts where owner_id=who and command_id=request_id));
$$;
create function public.enc_commit(who uuid, request_id uuid, digest text, expected bigint, changes jsonb,
  job_id uuid default null, job_lease uuid default null, has_more boolean default false)
returns bigint language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; receipt public.enc_receipts; r jsonb;
begin
  insert into public.enc_books(owner_id) values(who) on conflict do nothing;
  select revision into strict current_revision from public.enc_books where owner_id=who for update;
  select * into receipt from public.enc_receipts where owner_id=who and command_id=request_id;
  if found then
    if receipt.request_hash<>digest then raise exception 'request_id_conflict'; end if;
    return receipt.revision;
  end if;
  if current_revision<>expected then raise exception 'stale_revision'; end if;
  if job_id is not null then
    update public.enc_jobs set status=case when has_more then 'queued' else 'done' end, lease=null,leased_until=null,
      attempts=case when has_more then 0 else attempts end,available_at=now(),error_code=null
      where id=job_id and owner_id=who and status='running' and lease=job_lease and leased_until>now();
    if not found then raise exception 'lost_lease'; end if;
  end if;
  -- Delete changed versions before insertion to make primary-account switches order independent.
  delete from public.enc_records e using jsonb_array_elements(changes) as change(item)
    where e.owner_id=who and e.collection=item->>'collection' and e.key=item->>'key';
  for r in select * from jsonb_array_elements(changes) loop
    if r->'data' is not null and r->'data'<>'null'::jsonb then
      insert into public.enc_records values(who,r->>'collection',r->>'key',r->'data');
      if r->>'collection'='connections' and r->'data'->>'status'='revoked' then
        update public.enc_jobs set status='cancelled',lease=null,leased_until=null
          where owner_id=who and connection_id=r->>'key' and status in ('queued','running','retry');
      end if;
    end if;
  end loop;
  update public.enc_books set revision=revision+1 where owner_id=who;
  insert into public.enc_receipts values(who,request_id,digest,current_revision+1);
  return current_revision+1;
end $$;
create function public.enc_enqueue(who uuid, connection text, request_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  perform 1 from public.enc_books where owner_id=who for update;
  if not exists(select 1 from public.enc_records where owner_id=who and collection='connections' and key=connection
    and data->>'status'='active' and (data->>'expires')::date>=current_date) then raise exception 'inactive_consent'; end if;
  insert into public.enc_jobs(id,owner_id,connection_id) values(request_id,who,connection) on conflict do nothing returning id into result;
  if result is null then select id into result from public.enc_jobs where owner_id=who and connection_id=connection
    and (id=request_id or status in ('queued','running','retry')) order by (id=request_id) desc limit 1; end if;
  return result;
end $$;
create function public.enc_claim(lease_id uuid, wanted uuid default null)
returns setof public.enc_jobs language sql volatile security invoker set search_path='' as $$
  update public.enc_jobs j set status='running',lease=lease_id,leased_until=now()+interval '2 minutes',attempts=attempts+1
  where id=(select id from public.enc_jobs where (wanted is null or id=wanted)
    and ((status in ('queued','retry') and available_at<=now()) or (status='running' and leased_until<=now()))
    order by available_at limit 1 for update skip locked) returning j.*;
$$;
create function public.enc_fail(job_id uuid, job_lease uuid, code text) returns void
language sql volatile security invoker set search_path='' as $$
  update public.enc_jobs set status=case when attempts>=6 or code='inactive_consent' then 'failed' else 'retry' end,
    available_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),
    error_code=case when code='inactive_consent' then code else 'sync_failed' end, lease=null,leased_until=null
    where id=job_id and lease=job_lease and status='running';
$$;
revoke all on function public.enc_snapshot(uuid,uuid),public.enc_commit(uuid,uuid,text,bigint,jsonb,uuid,uuid,boolean),public.enc_enqueue(uuid,text,uuid),public.enc_claim(uuid,uuid),public.enc_fail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enc_snapshot(uuid,uuid),public.enc_commit(uuid,uuid,text,bigint,jsonb,uuid,uuid,boolean),public.enc_enqueue(uuid,text,uuid),public.enc_claim(uuid,uuid),public.enc_fail(uuid,uuid,text) to service_role;
create function public.enc_erase(who uuid) returns void language sql volatile security invoker set search_path='' as $$
  delete from public.enc_books where owner_id=who;
$$;
revoke all on function public.enc_erase(uuid) from public,anon,authenticated;
grant execute on function public.enc_erase(uuid) to service_role;
-- Empty in sandbox. Only authenticated backend adapters may manage encrypted credentials.
create table public.enc_provider_credentials (
  owner_id uuid not null references public.enc_books on delete cascade,
  connection_id text not null, provider_id text not null,
  envelope jsonb not null check(envelope ?& array['kid','iv','cipher']),
  expires_at timestamptz, rotated_at timestamptz not null default now(),
  primary key(owner_id,connection_id,provider_id)
);
alter table public.enc_provider_credentials enable row level security;
revoke all on public.enc_provider_credentials from public,anon,authenticated;
grant select,insert,update,delete on public.enc_provider_credentials to service_role;
create policy enc_credentials_backend on public.enc_provider_credentials to service_role using(true) with check(true);
-- Only a digest of the narrow queue-drain credential is kept in this table.
create table public.enc_worker_key (
  singleton boolean primary key check(singleton),
  verifier text not null
);
alter table public.enc_worker_key enable row level security;
revoke all on public.enc_worker_key from public,anon,authenticated;
grant select on public.enc_worker_key to service_role;
create policy enc_key_backend on public.enc_worker_key for select to service_role using(true);
create function public.enc_worker_valid(fingerprint text) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.enc_worker_key where singleton and verifier=fingerprint)
$$;
revoke all on function public.enc_worker_valid(text) from public,anon,authenticated;
grant execute on function public.enc_worker_valid(text) to service_role;
