-- =============================================================================
-- Product inclusions: a product that also opens an Academy course and a period
-- of 3D Studio access (decision 129)
-- =============================================================================
-- Owner's request (2026-11-08): "the professional kit, the course on sale and
-- three months of the 3D Studio in one promotional pack. Stock is the kit's: no
-- sale without the articles. Studio plan Artist, the three months start at the
-- purchase. A buyer who already holds the course still pays the full pack. With
-- a Studio subscription, the better plan wins. A member who got the offered
-- access no longer opens the 48-hour trial. Withdrawal: a partial refund (the
-- team chooses the amount). One payment, no price split for now. No gift."
--
-- Model
--   * product_inclusions: what buying ONE unit of a product also grants — a
--     course (`kind = 'course'`) or a Studio plan for N months
--     (`kind = 'studio'`). Written only by admin_save_product_inclusions()
--     (manage_products), read like the products. The pack's articles and stock
--     stay the kit mechanism of decision 117 (product_bundle_items).
--   * A line of such a product (order_items BEFORE INSERT, whatever inserts it):
--     one unit per line, a customer ACCOUNT on the order (access is granted to
--     an account: no guest, no gift), every included course published. The
--     inclusions are copied into order_item_inclusions (AFTER INSERT): a later
--     change of the pack never changes what an order paid for.
--   * Payment (payment_status → paid, any path): per copied inclusion,
--       course → a `bundle` course_entitlements row for the order, unless the
--                member already holds the course (owner: sold anyway, no
--                reduction, no note); an expired unrevoked one is closed first;
--       studio → a studio_access_grants row: plan, starts now (or at the end of
--                the member's open grant of the same plan, so a second pack
--                adds its months instead of overlapping), ends N months later.
--   * Full refund (payment_status or status → refunded): the order's bundle
--     entitlements and Studio grants are revoked. A partial refund (withdrawal
--     with a partial refund, decided by the owner) keeps them.
--   * Studio: an active grant is a fourth source of access beside the trial,
--     the subscription and staff, in every check (has_studio_access,
--     studio_user_has_access, studio_user_tier — the best tier wins).
--     studio_access_json() reports `granted` (no Stripe subscription active) and
--     `grant_ended`, plus the grant's plan and dates. start_studio_trial()
--     opens no trial once the member holds or held a grant (not revoked).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. What a product grants
-- -----------------------------------------------------------------------------
create table public.product_inclusions (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  kind          text not null check (kind in ('course', 'studio')),
  course_id     uuid references public.courses (id) on delete restrict,
  studio_plan   text check (studio_plan in ('essential', 'artist', 'atelier')),
  studio_months integer check (studio_months between 1 and 24),
  position      integer not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  updated_by    uuid references public.profiles (id) on delete set null,
  constraint product_inclusions_shape check (
    (kind = 'course' and course_id is not null and studio_plan is null and studio_months is null)
    or (kind = 'studio' and course_id is null and studio_plan is not null and studio_months is not null))
);

comment on table public.product_inclusions is
  'Access granted with ONE unit of a product (decision 129): an Academy course or N months of a 3D Studio plan. Written only by admin_save_product_inclusions(); granted when the order is paid.';

create unique index product_inclusions_one_course_idx on public.product_inclusions (product_id, course_id)
  where kind = 'course';
create unique index product_inclusions_one_studio_idx on public.product_inclusions (product_id)
  where kind = 'studio';
create index product_inclusions_product_idx on public.product_inclusions (product_id, position);
create index product_inclusions_course_idx on public.product_inclusions (course_id) where course_id is not null;
create index product_inclusions_created_by_idx on public.product_inclusions (created_by);
create index product_inclusions_updated_by_idx on public.product_inclusions (updated_by);

alter table public.product_inclusions enable row level security;
revoke all on public.product_inclusions from anon, authenticated;
grant select on public.product_inclusions to anon, authenticated;

create policy "product_inclusions: public reads active products, staff read all"
  on public.product_inclusions for select to anon, authenticated
  using (
    exists (select 1 from public.products p
             where p.id = product_inclusions.product_id and p.status = 'active')
    or (select private.is_staff())
  );

create trigger product_inclusions_audit
  before insert or update on public.product_inclusions
  for each row execute function private.set_audit_columns();
create trigger product_inclusions_audit_log
  after insert or update or delete on public.product_inclusions
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 2. What an order line was sold with
-- -----------------------------------------------------------------------------
create table public.order_item_inclusions (
  id            bigint generated always as identity primary key,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  kind          text not null check (kind in ('course', 'studio')),
  course_id     uuid references public.courses (id) on delete restrict,
  course_title  text,
  studio_plan   text check (studio_plan in ('essential', 'artist', 'atelier')),
  studio_months integer check (studio_months between 1 and 24),
  created_at    timestamptz not null default now(),
  constraint order_item_inclusions_shape check (
    (kind = 'course' and course_id is not null and studio_plan is null and studio_months is null)
    or (kind = 'studio' and course_id is null and studio_plan is not null and studio_months is not null))
);

comment on table public.order_item_inclusions is
  'Access an order line was sold with (decision 129), copied from product_inclusions when the line is created. Granted on payment, revoked by a full refund.';

create index order_item_inclusions_item_idx on public.order_item_inclusions (order_item_id);
create index order_item_inclusions_course_idx on public.order_item_inclusions (course_id) where course_id is not null;

alter table public.order_item_inclusions enable row level security;
revoke all on public.order_item_inclusions from anon, authenticated;
grant select on public.order_item_inclusions to authenticated;

create policy "order_item_inclusions: owners and staff read"
  on public.order_item_inclusions for select to authenticated
  using (
    exists (select 1
              from public.order_items i
              join public.orders o on o.id = i.order_id
             where i.id = order_item_inclusions.order_item_id
               and o.user_id = (select auth.uid()))
    or (select private.is_staff())
  );

-- -----------------------------------------------------------------------------
-- 3. Studio access granted by a purchase
-- -----------------------------------------------------------------------------
create table public.studio_access_grants (
  id            uuid primary key default gen_random_uuid(),
  -- CASCADE: erasing an account erases its access (the order keeps the sale).
  user_id       uuid not null references public.profiles (id) on delete cascade,
  plan          text not null check (plan in ('essential', 'artist', 'atelier')),
  source        text not null default 'bundle' check (source in ('bundle')),
  order_id      uuid not null references public.orders (id) on delete restrict,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint studio_access_grants_period check (ends_at > starts_at),
  constraint studio_access_grants_one_per_line unique (order_item_id)
);

comment on table public.studio_access_grants is
  '3D Studio access bought with a product (decision 129): plan from starts_at to ends_at, unless revoked (full refund). Written only by the order payment trigger.';

create index studio_access_grants_user_idx on public.studio_access_grants (user_id, ends_at desc);
create index studio_access_grants_order_idx on public.studio_access_grants (order_id);
create index studio_access_grants_revoked_by_idx on public.studio_access_grants (revoked_by);

create trigger studio_access_grants_set_updated_at
  before update on public.studio_access_grants
  for each row execute function private.set_updated_at();
create trigger studio_access_grants_audit_log
  after insert or update or delete on public.studio_access_grants
  for each row execute function private.audit_changes();

alter table public.studio_access_grants enable row level security;
revoke all on public.studio_access_grants from anon, authenticated;
grant select on public.studio_access_grants to authenticated;

create policy "studio_access_grants: owners and statistics staff read"
  on public.studio_access_grants for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_permission('view_statistics')));

-- -----------------------------------------------------------------------------
-- 4. Order lines of a product with inclusions
-- -----------------------------------------------------------------------------
create or replace function private.guard_order_item_inclusions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.product_id is null
     or not exists (select 1 from public.product_inclusions pi where pi.product_id = new.product_id) then
    return new;
  end if;

  select o.user_id into v_user from public.orders o where o.id = new.order_id;
  -- Access is granted to an account: no guest order. The message is the one
  -- the checkout already maps to "sign in first" (account_required).
  if v_user is null then
    raise exception 'create_order: a course requires a customer account (pack %)', new.product_name
      using errcode = '42501';
  end if;
  if new.quantity <> 1 then
    raise exception 'create_order: one pack per line (%)', new.product_name using errcode = '22023';
  end if;
  if exists (select 1 from public.product_inclusions pi
               join public.courses c on c.id = pi.course_id
              where pi.product_id = new.product_id and pi.kind = 'course' and c.status <> 'published') then
    raise exception 'create_order: product % is not available', new.product_name using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create or replace function private.snapshot_order_item_inclusions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is not null then
    insert into public.order_item_inclusions (order_item_id, kind, course_id, course_title, studio_plan, studio_months)
    select new.id, pi.kind, pi.course_id, left(c.title, 200), pi.studio_plan, pi.studio_months
      from public.product_inclusions pi
      left join public.courses c on c.id = pi.course_id
     where pi.product_id = new.product_id
     order by pi.position, pi.kind;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_order_item_inclusions() from public, anon, authenticated;
revoke all on function private.snapshot_order_item_inclusions() from public, anon, authenticated;

create trigger order_items_inclusions_guard
  before insert on public.order_items
  for each row execute function private.guard_order_item_inclusions();
create trigger order_items_inclusions_snapshot
  after insert on public.order_items
  for each row execute function private.snapshot_order_item_inclusions();

-- -----------------------------------------------------------------------------
-- 5. Access from payment, revoked by a full refund
--    `orders_stock_transitions_zd_inclusions` sorts after
--    `orders_stock_transitions_zc_courses` and before `orders_zz_move_admin_note`.
-- -----------------------------------------------------------------------------
create or replace function private.apply_order_inclusion_transitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inc   record;
  v_open  public.course_entitlements;
  v_start timestamptz;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    for v_inc in
      select x.*, i.product_name
        from public.order_item_inclusions x
        join public.order_items i on i.id = x.order_item_id
       where i.order_id = new.id
       order by x.id
    loop
      if new.user_id is null then
        new.admin_note := concat_ws(E'\n', new.admin_note,
          '[auto] Pack payé sans compte client : accès non attribués (' || v_inc.product_name || ').');
        exit;
      end if;

      if v_inc.kind = 'course' then
        -- Replayed transition: already granted for this order.
        continue when exists (select 1 from public.course_entitlements e
                               where e.order_id = new.id and e.course_id = v_inc.course_id and e.source = 'bundle');
        v_open := null;
        select e.* into v_open from public.course_entitlements e
         where e.user_id = new.user_id and e.course_id = v_inc.course_id and e.revoked_at is null
         for update;
        -- Already held: the pack is sold anyway (owner, 2026-11-08), nothing to add.
        continue when v_open.id is not null and (v_open.expires_at is null or v_open.expires_at > now());
        if v_open.id is not null then
          update public.course_entitlements set revoked_at = now(), revoked_by = null where id = v_open.id;
        end if;
        insert into public.course_entitlements (user_id, course_id, source, order_id, note)
        values (new.user_id, v_inc.course_id, 'bundle', new.id, left('Pack ' || v_inc.product_name, 500));

      else
        continue when exists (select 1 from public.studio_access_grants g where g.order_item_id = v_inc.order_item_id);
        perform pg_advisory_xact_lock(hashtextextended('studio_access_grant:' || new.user_id::text, 0));
        select greatest(now(), coalesce(max(g.ends_at), now())) into v_start
          from public.studio_access_grants g
         where g.user_id = new.user_id and g.plan = v_inc.studio_plan
           and g.revoked_at is null and g.ends_at > now();
        insert into public.studio_access_grants (user_id, plan, order_id, order_item_id, starts_at, ends_at)
        values (new.user_id, v_inc.studio_plan, new.id, v_inc.order_item_id,
                v_start, v_start + make_interval(months => v_inc.studio_months));
      end if;
    end loop;
  end if;

  if (new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded')
     or (new.status = 'refunded' and old.status is distinct from 'refunded') then
    update public.course_entitlements
       set revoked_at = now(), revoked_by = auth.uid()
     where order_id = new.id and source = 'bundle' and revoked_at is null;
    update public.studio_access_grants
       set revoked_at = now(), revoked_by = auth.uid()
     where order_id = new.id and revoked_at is null;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_order_inclusion_transitions() from public, anon, authenticated;

create trigger orders_stock_transitions_zd_inclusions
  before update of status, payment_status on public.orders
  for each row execute function private.apply_order_inclusion_transitions();

-- -----------------------------------------------------------------------------
-- 6. Back office: what a product grants
-- -----------------------------------------------------------------------------
-- p_inclusions: [{"kind": "course", "course_id": uuid} | {"kind": "studio",
-- "studio_plan": text, "studio_months": int}], in display order; [] = none.
create or replace function public.admin_save_product_inclusions(p_product_id uuid, p_inclusions jsonb)
returns setof public.product_inclusions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product  public.products;
  v_item     jsonb;
  v_position integer := 0;
  v_kind     text;
  v_course   uuid;
  v_plan     text;
  v_months   integer;
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_save_product_inclusions: permission denied' using errcode = '42501';
  end if;
  if p_inclusions is null or jsonb_typeof(p_inclusions) <> 'array' or jsonb_array_length(p_inclusions) > 10 then
    raise exception 'admin_save_product_inclusions: inclusions must be an array (max 10)' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'admin_save_product_inclusions: product not found' using errcode = 'P0002';
  end if;
  if v_product.product_type = 'gift_card' and jsonb_array_length(p_inclusions) > 0 then
    raise exception 'admin_save_product_inclusions: a gift card grants nothing' using errcode = '22023';
  end if;

  delete from public.product_inclusions where product_id = p_product_id;

  for v_item in select * from jsonb_array_elements(p_inclusions) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'admin_save_product_inclusions: invalid inclusion' using errcode = '22023';
    end if;
    v_kind := v_item ->> 'kind';
    if v_kind = 'course' then
      begin
        v_course := (v_item ->> 'course_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'admin_save_product_inclusions: invalid course' using errcode = '22023';
      end;
      if v_course is null or not exists (select 1 from public.courses c where c.id = v_course) then
        raise exception 'admin_save_product_inclusions: course not found' using errcode = 'P0002';
      end if;
      if exists (select 1 from public.product_inclusions where product_id = p_product_id and course_id = v_course) then
        raise exception 'admin_save_product_inclusions: course listed twice' using errcode = '22023';
      end if;
      insert into public.product_inclusions (product_id, kind, course_id, position)
      values (p_product_id, 'course', v_course, v_position);
    elsif v_kind = 'studio' then
      v_plan := v_item ->> 'studio_plan';
      if v_plan is null or v_plan not in ('essential', 'artist', 'atelier') then
        raise exception 'admin_save_product_inclusions: invalid Studio plan' using errcode = '22023';
      end if;
      begin
        v_months := (v_item ->> 'studio_months')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'admin_save_product_inclusions: invalid duration' using errcode = '22023';
      end;
      if v_months is null or v_months not between 1 and 24 then
        raise exception 'admin_save_product_inclusions: invalid duration' using errcode = '22023';
      end if;
      if exists (select 1 from public.product_inclusions where product_id = p_product_id and kind = 'studio') then
        raise exception 'admin_save_product_inclusions: one Studio access per product' using errcode = '22023';
      end if;
      insert into public.product_inclusions (product_id, kind, studio_plan, studio_months, position)
      values (p_product_id, 'studio', v_plan, v_months, v_position);
    else
      raise exception 'admin_save_product_inclusions: invalid kind' using errcode = '22023';
    end if;
    v_position := v_position + 1;
  end loop;

  return query select * from public.product_inclusions where product_id = p_product_id order by position;
end;
$$;

comment on function public.admin_save_product_inclusions(uuid, jsonb) is
  'Back office (manage_products, decision 129): replaces what one unit of a product grants (courses, Studio plan for N months).';

revoke all on function public.admin_save_product_inclusions(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_product_inclusions(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. 3D Studio: a grant is a source of access
-- -----------------------------------------------------------------------------
-- The best plan of the member's grants running now, null without one.
create or replace function private.studio_grant_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.plan
    from public.studio_access_grants g
   where g.user_id = p_user
     and private.account_active(p_user)
     and g.revoked_at is null
     and g.starts_at <= now() and now() < g.ends_at
   order by case g.plan when 'atelier' then 3 when 'artist' then 2 else 1 end desc
   limit 1;
$$;

revoke all on function private.studio_grant_plan(uuid) from public, anon, authenticated;

create or replace function private.has_studio_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (
       (private.account_active((select auth.uid()))
         and exists (select 1 from public.studio_trials t
                      where t.user_id = (select auth.uid()) and now() < t.trial_expires_at))
       or private.studio_subscription_active((select auth.uid()))
       or private.studio_grant_plan((select auth.uid())) is not null
       or private.is_staff()
     );
$$;

create or replace function private.studio_user_has_access(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and (
       (private.account_active(p_user)
         and exists (select 1 from public.studio_trials t
                      where t.user_id = p_user and now() < t.trial_expires_at))
       or private.studio_subscription_active(p_user)
       or private.studio_grant_plan(p_user) is not null
       or exists (select 1 from public.profiles p
                    join public.roles r on r.key = p.role and r.is_staff
                   where p.id = p_user and p.status = 'active')
     );
$$;

create or replace function private.studio_user_tier(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with tiers(tier, rank) as (
    select s.plan, case s.plan when 'atelier' then 3 when 'artist' then 2 else 1 end
      from public.studio_subscriptions s
     where s.user_id = p_user
       and private.account_active(p_user)
       and s.status in ('active', 'trialing', 'past_due')
       and s.current_period_end > now()
    union all
    select g.plan, case g.plan when 'atelier' then 3 when 'artist' then 2 else 1 end
      from public.studio_access_grants g
     where g.user_id = p_user
       and private.account_active(p_user)
       and g.revoked_at is null
       and g.starts_at <= now() and now() < g.ends_at
    union all
    select 'essential', 1
      from public.studio_trials t
     where t.user_id = p_user and private.account_active(p_user) and now() < t.trial_expires_at
    union all
    select 'atelier', 3
      from public.profiles p
      join public.roles r on r.key = p.role and r.is_staff
     where p.id = p_user and p.status = 'active'
  )
  select tier from tiers where p_user is not null order by rank desc limit 1;
$$;

-- The state the editor reads, with the offered access.
--   granted      a grant runs and no Stripe subscription is active
--   grant_ended  no access left, the last thing held was a grant (or a grant
--                and an expired trial): the plans are offered, not a trial
create or replace function private.studio_access_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trial public.studio_trials;
  v_sub   public.studio_subscriptions;
  v_grant public.studio_access_grants;
  v_state text;
  v_tier  text := private.studio_user_tier(p_user);
  v_grant_plan text := private.studio_grant_plan(p_user);
begin
  select * into v_trial from public.studio_trials t where t.user_id = p_user;
  select * into v_sub from public.studio_subscriptions s
   where s.user_id = p_user
     and s.status <> 'incomplete_expired'
   order by (s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now()) desc,
            s.current_period_end desc
   limit 1;
  -- The grant shown: the running one of the best plan, else the last one.
  select * into v_grant from public.studio_access_grants g
   where g.user_id = p_user and g.revoked_at is null
   order by (g.starts_at <= now() and now() < g.ends_at and g.plan = v_grant_plan) desc,
            g.ends_at desc
   limit 1;

  v_state := case
    when private.studio_subscription_active(p_user) then 'subscribed'
    when private.is_staff() then 'staff'
    when v_grant_plan is not null then 'granted'
    when v_trial.user_id is not null and now() < v_trial.trial_expires_at
         and private.account_active(p_user) then 'trial_active'
    when v_sub.id is not null and v_sub.status = 'incomplete' then 'subscription_pending'
    when v_sub.id is not null and (v_grant.id is null or v_sub.current_period_end > v_grant.ends_at) then 'subscription_ended'
    when v_grant.id is not null then 'grant_ended'
    when v_trial.user_id is not null then 'trial_expired'
    else 'not_started'
  end;

  return jsonb_build_object(
    'state', v_state,
    'server_now', now(),
    'trial_started_at', v_trial.trial_started_at,
    'trial_expires_at', v_trial.trial_expires_at,
    'first_creation_at', v_trial.first_creation_at,
    'subscription_plan', v_sub.plan,
    'subscription_status', v_sub.status,
    'subscription_period_end', v_sub.current_period_end,
    'subscription_interval', v_sub.billing_interval,
    'subscription_cancel_at_period_end', v_sub.cancel_at_period_end,
    'grant_plan', v_grant.plan,
    'grant_starts_at', v_grant.starts_at,
    'grant_ends_at', v_grant.ends_at,
    'grant_active', v_grant_plan is not null,
    'tier', v_tier,
    'glowbook', coalesce(v_tier = 'atelier', false),
    'limits', jsonb_build_object(
      'creations', private.studio_plan_limit(v_tier, 'creations'),
      'gem_groups', private.studio_plan_limit(v_tier, 'gem_groups')),
    'usage', jsonb_build_object(
      'creations', (select count(*) from public.creations c where c.user_id = p_user),
      'gem_groups', (select count(*) from public.gem_groups g where g.user_id = p_user))
  );
end;
$$;

-- No 48-hour trial once the member holds or held an offered access (owner, 2026-11-08).
create or replace function public.start_studio_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_started boolean := false;
begin
  if v_user is null then
    raise exception 'start_studio_trial: sign-in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'start_studio_trial: no profile' using errcode = '42501';
  end if;
  if not private.account_active(v_user) then
    raise exception 'start_studio_trial: account not active' using errcode = '42501';
  end if;

  if not private.studio_subscription_active(v_user)
     and not private.is_staff()
     and not exists (select 1 from public.studio_subscriptions s
                      where s.user_id = v_user and s.status not in ('incomplete', 'incomplete_expired'))
     and not exists (select 1 from public.studio_access_grants g
                      where g.user_id = v_user and g.revoked_at is null) then
    insert into public.studio_trials (user_id) values (v_user)
    on conflict (user_id) do nothing;
    v_started := found;
  end if;

  return private.studio_access_json(v_user) || jsonb_build_object('started', v_started);
end;
$$;
