-- Keep only a sequence number after erasure to reject outstanding writes from old tabs.
create or replace function public.enc_erase(who uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.enc_books(owner_id,revision) values(who,1)
    on conflict(owner_id) do update set revision=public.enc_books.revision+1;
  delete from public.enc_jobs where owner_id=who;
  delete from public.enc_provider_credentials where owner_id=who;
  delete from public.enc_records where owner_id=who;
  delete from public.enc_receipts where owner_id=who;
end $$;
create function public.enc_revoke_credentials() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  delete from public.enc_provider_credentials where owner_id=new.owner_id and connection_id=new.key;
  return new;
end $$;
revoke all on function public.enc_revoke_credentials() from public,anon,authenticated;
grant execute on function public.enc_revoke_credentials() to service_role;
create trigger enc_forget_credentials after insert on public.enc_records for each row
 when (new.collection='connections' and new.data->>'status'='revoked') execute function public.enc_revoke_credentials();
