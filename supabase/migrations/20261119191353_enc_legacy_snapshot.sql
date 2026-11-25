-- Fixed allowlist of legacy finance tables. The owner is derived from verified Auth by the service.
create function public.enc_legacy_snapshot(who uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'accounts',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.accounts x where x.user_id=who),'[]'::jsonb),
  'transactions',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.transactions x where x.user_id=who),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.categories x where x.user_id=who),'[]'::jsonb),
  'assets',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.assets x where x.user_id=who),'[]'::jsonb),
  'transfers',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.transfers x where x.user_id=who),'[]'::jsonb),
  'installments',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.installments x where x.user_id=who),'[]'::jsonb),
  'credit_cards',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.credit_cards x where x.user_id=who),'[]'::jsonb),
  'card_purchases',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.card_purchases x where x.user_id=who),'[]'::jsonb),
  'invoice_payments',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.invoice_payments x where x.user_id=who),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.subscriptions x where x.user_id=who),'[]'::jsonb),
  'recurring_transactions',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.recurring_transactions x where x.user_id=who),'[]'::jsonb),
  'bills',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.bills x where x.user_id=who),'[]'::jsonb),
  'future_transactions',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.future_transactions x where x.user_id=who),'[]'::jsonb),
  'benefit_wallets',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.benefit_wallets x where x.user_id=who),'[]'::jsonb),
  'benefit_transactions',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.benefit_transactions x where x.user_id=who),'[]'::jsonb),
  'budgets',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.budgets x where x.user_id=who),'[]'::jsonb),
  'goals',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.goals x where x.user_id=who),'[]'::jsonb),
  'goal_contributions',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.goal_contributions x where x.user_id=who),'[]'::jsonb),
  'debts',coalesce((select jsonb_agg(to_jsonb(x)-'user_id' order by x.id) from public.debts x where x.user_id=who),'[]'::jsonb)
 );
$$;
revoke all on function public.enc_legacy_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.enc_legacy_snapshot(uuid) to service_role;
