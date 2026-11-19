alter policy benefit_wallets_select_own on public.benefit_wallets using ((select auth.uid()) = user_id);
alter policy benefit_wallets_insert_own on public.benefit_wallets with check ((select auth.uid()) = user_id);
alter policy benefit_wallets_update_own on public.benefit_wallets using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy benefit_wallets_delete_own on public.benefit_wallets using ((select auth.uid()) = user_id);
alter policy benefit_transactions_select_own on public.benefit_transactions using ((select auth.uid()) = user_id);
alter policy benefit_transactions_insert_own on public.benefit_transactions with check ((select auth.uid()) = user_id);
alter policy benefit_transactions_update_own on public.benefit_transactions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy benefit_transactions_delete_own on public.benefit_transactions using ((select auth.uid()) = user_id);
