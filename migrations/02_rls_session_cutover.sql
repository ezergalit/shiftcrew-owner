-- ============================================================================
-- RLS CUTOVER — replace every open (qual = true) policy in menu_app with
-- session-scoped policies backed by menu_app.app_sessions.
--
-- ⚠️⚠️ DO NOT APPLY until BOTH apps are deployed with the session-token client
-- (lib/appSession.js + the x-app-session fetch header + owner_login_v2/team_join
-- logins). Applied earlier, the live web apps lose all data access.
--
-- After applying, verify at minimum:
--   * owner login -> dashboard loads menu + team + settings
--   * team login  -> menu loads, a quiz answer writes menu_progress
--   * a request WITHOUT the header returns [] everywhere
--   * a token from restaurant A cannot read restaurant B (change the .eq id)
--
-- The infra migration (menu_app_sessions_infra) already shipped:
--   app_sessions, session_restaurant(), session_member(), session_role(),
--   owner_login_v2, team_join, change_owner_password, forgot_password_request,
--   delete_restaurant_account, delete_my_team_profile.
--
-- Existing logged-in users: their localStorage session has no token, so the
-- first load after cutover returns no rows and the apps route back to login —
-- one re-login, no data loss.
-- ============================================================================

-- Drop every existing policy in menu_app so nothing permissive lingers.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies where schemaname = 'menu_app'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Shorthand used below:
--   (select menu_app.session_restaurant())  -> uuid or null
--   (select menu_app.session_member())      -> uuid or null (team sessions only)
--   (select menu_app.session_role())        -> 'owner' | 'team' | null
-- The (select ...) wrapper lets Postgres evaluate once per statement.

-- ---------------- restaurants ----------------
create policy sess_select on menu_app.restaurants for select
  using (id = (select menu_app.session_restaurant()));
create policy owner_update on menu_app.restaurants for update
  using (id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner')
  with check (id = (select menu_app.session_restaurant()));
-- No INSERT/DELETE: creation goes through create_restaurant_account (definer),
-- deletion through delete_restaurant_account (definer).

-- ---------------- menu_items (owner-only) ----------------
create policy owner_all on menu_app.menu_items for all
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner')
  with check (restaurant_id = (select menu_app.session_restaurant()));

-- ---------------- published_menu ----------------
-- Reads: any session of the restaurant. Writes: the sync trigger fires inside
-- the owner's own menu_items statement, so the same owner check applies.
create policy sess_select on menu_app.published_menu for select
  using (restaurant_id = (select menu_app.session_restaurant()));
create policy owner_write on menu_app.published_menu for insert
  with check (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');
create policy owner_update on menu_app.published_menu for update
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');
create policy owner_delete on menu_app.published_menu for delete
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');

-- ---------------- team_members ----------------
create policy sess_select on menu_app.team_members for select
  using (restaurant_id = (select menu_app.session_restaurant()));
-- A member updates only their own row (last_seen_at, baseline, total_seconds…).
create policy member_update on menu_app.team_members for update
  using (id = (select menu_app.session_member()))
  with check (id = (select menu_app.session_member()));
-- The owner can remove a member (מחיקת חבר צוות in the team tab).
create policy owner_delete on menu_app.team_members for delete
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');
-- No INSERT: members are created by team_join (definer).

-- ---------------- menu_progress ----------------
create policy member_all on menu_app.menu_progress for all
  using (team_member_id = (select menu_app.session_member()))
  with check (team_member_id = (select menu_app.session_member()));
create policy owner_select on menu_app.menu_progress for select
  using ((select menu_app.session_role()) = 'owner' and team_member_id in
         (select id from menu_app.team_members where restaurant_id = (select menu_app.session_restaurant())));

-- ---------------- leaderboard ----------------
create policy sess_select on menu_app.leaderboard for select
  using (restaurant_id = (select menu_app.session_restaurant()));
create policy member_write on menu_app.leaderboard for insert
  with check (restaurant_id = (select menu_app.session_restaurant())
              and team_member_id = (select menu_app.session_member()));
create policy member_update on menu_app.leaderboard for update
  using (team_member_id = (select menu_app.session_member()))
  with check (team_member_id = (select menu_app.session_member()));

-- ---------------- daily_brief ----------------
create policy sess_select on menu_app.daily_brief for select
  using (restaurant_id = (select menu_app.session_restaurant()));
create policy owner_write on menu_app.daily_brief for insert
  with check (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');
create policy owner_update on menu_app.daily_brief for update
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');
create policy owner_delete on menu_app.daily_brief for delete
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');

-- ---------------- daily_brief_reads ----------------
create policy sess_select on menu_app.daily_brief_reads for select
  using (team_member_id in
         (select id from menu_app.team_members where restaurant_id = (select menu_app.session_restaurant())));
create policy member_write on menu_app.daily_brief_reads for insert
  with check (team_member_id = (select menu_app.session_member()));
create policy member_update on menu_app.daily_brief_reads for update
  using (team_member_id = (select menu_app.session_member()))
  with check (team_member_id = (select menu_app.session_member()));

-- ---------------- exam_results ----------------
create policy sess_select on menu_app.exam_results for select
  using (restaurant_id = (select menu_app.session_restaurant()));
create policy member_write on menu_app.exam_results for insert
  with check (restaurant_id = (select menu_app.session_restaurant())
              and team_member_id = (select menu_app.session_member()));

-- ---------------- exam_config ----------------
create policy sess_select on menu_app.exam_config for select
  using (restaurant_id = (select menu_app.session_restaurant()));
create policy owner_write on menu_app.exam_config for insert
  with check (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');
create policy owner_update on menu_app.exam_config for update
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');

-- ---------------- progress_snapshots ----------------
create policy sess_select on menu_app.progress_snapshots for select
  using (restaurant_id = (select menu_app.session_restaurant()));
create policy member_write on menu_app.progress_snapshots for insert
  with check (restaurant_id = (select menu_app.session_restaurant())
              and team_member_id = (select menu_app.session_member()));

-- ---------------- weekly_scores ----------------
create policy sess_select on menu_app.weekly_scores for select
  using (team_member_id in
         (select id from menu_app.team_members where restaurant_id = (select menu_app.session_restaurant())));
-- Writes go through add_weekly_points (security definer), which bypasses RLS.

-- ---------------- match_times ----------------
create policy sess_select on menu_app.match_times for select
  using (restaurant_id = (select menu_app.session_restaurant()));
create policy member_write on menu_app.match_times for insert
  with check (restaurant_id = (select menu_app.session_restaurant())
              and team_member_id = (select menu_app.session_member()));

-- ---------------- owner_users ----------------
create policy owner_all on menu_app.owner_users for all
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner')
  with check (restaurant_id = (select menu_app.session_restaurant()));

-- ---------------- operator_requests ----------------
create policy owner_select on menu_app.operator_requests for select
  using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');
create policy owner_insert on menu_app.operator_requests for insert
  with check (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner');

-- ---------------- wine_knowledge (shared cross-restaurant memory) ----------------
create policy sess_select on menu_app.wine_knowledge for select
  using ((select menu_app.session_restaurant()) is not null);
create policy owner_insert on menu_app.wine_knowledge for insert
  with check ((select menu_app.session_role()) = 'owner');
create policy owner_update on menu_app.wine_knowledge for update
  using ((select menu_app.session_role()) = 'owner');

-- ---------------- menu_offers ----------------
-- Scope by restaurant if the column exists (table appeared without docs).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='menu_app' and table_name='menu_offers' and column_name='restaurant_id') then
    execute $p$create policy sess_select on menu_app.menu_offers for select
      using (restaurant_id = (select menu_app.session_restaurant()))$p$;
    execute $p$create policy owner_write on menu_app.menu_offers for insert
      with check (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner')$p$;
    execute $p$create policy owner_update on menu_app.menu_offers for update
      using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner')$p$;
    execute $p$create policy owner_delete on menu_app.menu_offers for delete
      using (restaurant_id = (select menu_app.session_restaurant()) and (select menu_app.session_role()) = 'owner')$p$;
  end if;
end $$;

-- app_sessions: RLS enabled, zero policies, zero grants — reachable only
-- through the definer functions. Nothing to add here.
