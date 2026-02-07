-- Run this after your initial schema.sql if you already executed it

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  price_cents integer not null,
  billing_period text not null check (billing_period in ('monthly','one_time')),
  credits integer,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  plan_id uuid not null references public.membership_plans on delete restrict,
  status text not null default 'active' check (status in ('active','paused','canceled')),
  credits_remaining integer,
  renewal_date date,
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.notifications add column if not exists sent_email boolean not null default false;
alter table public.notifications add column if not exists sent_sms boolean not null default false;
alter table public.notifications add column if not exists sent_at timestamptz;

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique (class_id, user_id)
);

insert into public.membership_plans (code, name, price_cents, billing_period, credits)
values
  ('unlimited_monthly', 'Unlimited Monthly', 14900, 'monthly', null),
  ('drop_in', 'Drop-in', 2000, 'one_time', 1)
on conflict (code) do nothing;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Member'),
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.membership_plans enable row level security;
alter table public.memberships enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Profiles are updatable by owner" on public.profiles;
drop policy if exists "Profiles are insertable by owner" on public.profiles;
drop policy if exists "Membership plans readable by members" on public.membership_plans;
drop policy if exists "Memberships readable by owner" on public.memberships;
drop policy if exists "Memberships insertable by owner" on public.memberships;
drop policy if exists "Memberships updatable by owner" on public.memberships;
drop policy if exists "Attendance readable by admins" on public.attendance;
drop policy if exists "Attendance modifiable by admins" on public.attendance;

create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Membership plans readable by members"
  on public.membership_plans for select
  using (auth.role() = 'authenticated');

create policy "Memberships readable by owner"
  on public.memberships for select
  using (auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Memberships insertable by owner"
  on public.memberships for insert
  with check (auth.uid() = user_id);

create policy "Memberships updatable by owner"
  on public.memberships for update
  using (auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Attendance readable by admins"
  on public.attendance for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Attendance modifiable by admins"
  on public.attendance for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create or replace function public.reserve_spot(p_class_id uuid)
returns void as $$
declare
  capacity_count integer;
  reserved_count integer;
  existing_status text;
  status_to_set text;
  plan_credits integer;
  credits_left integer;
begin
  if not exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'No active membership.';
  end if;

  select mp.credits, m.credits_remaining
  into plan_credits, credits_left
  from public.memberships m
  join public.membership_plans mp on mp.id = m.plan_id
  where m.user_id = auth.uid();

  if plan_credits is not null and (credits_left is null or credits_left <= 0) then
    raise exception 'Not enough credits.';
  end if;

  select capacity into capacity_count from public.classes where id = p_class_id;
  if capacity_count is null then
    raise exception 'Class not found.';
  end if;

  select status into existing_status
  from public.reservations
  where class_id = p_class_id and user_id = auth.uid();

  if existing_status is not null then
    return;
  end if;

  select count(*) into reserved_count
  from public.reservations
  where class_id = p_class_id and status = 'reserved';

  if reserved_count < capacity_count then
    status_to_set := 'reserved';
  else
    status_to_set := 'waitlist';
  end if;

  insert into public.reservations (class_id, user_id, status)
  values (p_class_id, auth.uid(), status_to_set);

  if plan_credits is not null and status_to_set = 'reserved' then
    update public.memberships
    set credits_remaining = credits_remaining - 1
    where user_id = auth.uid();
  end if;

  insert into public.notifications (user_id, message)
  values (auth.uid(),
    case
      when status_to_set = 'reserved' then 'You are booked for your class.'
      else 'You are on the waitlist. We will notify you if a spot opens.'
    end
  );
end;
$$ language plpgsql security definer;

create or replace function public.cancel_spot(p_class_id uuid)
returns void as $$
declare
  removed_status text;
  promoted_user uuid;
  plan_credits integer;
  credits_left integer;
begin
  select status into removed_status
  from public.reservations
  where class_id = p_class_id and user_id = auth.uid();

  if removed_status is null then
    return;
  end if;

  delete from public.reservations
  where class_id = p_class_id and user_id = auth.uid();

  insert into public.notifications (user_id, message)
  values (auth.uid(), 'You canceled your class.');

  if removed_status = 'reserved' then
    for promoted_user in
      select user_id from public.reservations
      where class_id = p_class_id and status = 'waitlist'
      order by created_at
    loop
      select mp.credits, m.credits_remaining
      into plan_credits, credits_left
      from public.memberships m
      join public.membership_plans mp on mp.id = m.plan_id
      where m.user_id = promoted_user;

      if plan_credits is null or credits_left > 0 then
        update public.reservations
        set status = 'reserved'
        where class_id = p_class_id and user_id = promoted_user;

        if plan_credits is not null then
          update public.memberships
          set credits_remaining = credits_remaining - 1
          where user_id = promoted_user;
        end if;

        insert into public.notifications (user_id, message)
        values (promoted_user, 'You are in! A spot opened up for your class.');
        exit;
      end if;
    end loop;
  end if;
end;
$$ language plpgsql security definer;

create or replace function public.update_capacity(p_class_id uuid, new_capacity integer)
returns void as $$
DECLARE
  reserved_count integer;
  promoted_user uuid;
  plan_credits integer;
  credits_left integer;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Not authorized.';
  end if;

  update public.classes set capacity = new_capacity where id = p_class_id;

  select count(*) into reserved_count
  from public.reservations
  where class_id = p_class_id and status = 'reserved';

  while reserved_count < new_capacity loop
    select user_id into promoted_user
    from public.reservations
    where class_id = p_class_id and status = 'waitlist'
    order by created_at
    limit 1;

    exit when promoted_user is null;

    select mp.credits, m.credits_remaining
    into plan_credits, credits_left
    from public.memberships m
    join public.membership_plans mp on mp.id = m.plan_id
    where m.user_id = promoted_user;

    if plan_credits is not null and credits_left <= 0 then
      delete from public.reservations where class_id = p_class_id and user_id = promoted_user;
      insert into public.notifications (user_id, message)
      values (promoted_user, 'Your waitlist spot expired due to no credits. Please renew.');
      continue;
    end if;

    update public.reservations
    set status = 'reserved'
    where class_id = p_class_id and user_id = promoted_user;

    if plan_credits is not null then
      update public.memberships
      set credits_remaining = credits_remaining - 1
      where user_id = promoted_user;
    end if;

    insert into public.notifications (user_id, message)
    values (promoted_user, 'You are in! A spot opened up for your class.');

    reserved_count := reserved_count + 1;
  end loop;
end;
$$ language plpgsql security definer;

create or replace function public.select_plan(plan_id uuid)
returns void as $$
declare
  plan_credits integer;
begin
  select credits into plan_credits from public.membership_plans where id = plan_id;
  if plan_credits is null then
    plan_credits := null;
  end if;

  insert into public.memberships (user_id, plan_id, status, credits_remaining, renewal_date)
  values (auth.uid(), plan_id, 'active', plan_credits, (current_date + interval '30 days')::date)
  on conflict (user_id) do update
  set plan_id = excluded.plan_id,
      status = 'active',
      credits_remaining = plan_credits,
      renewal_date = excluded.renewal_date;
end;
$$ language plpgsql security definer;

create or replace function public.check_in(p_class_id uuid, p_user_id uuid)
returns void as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Not authorized.';
  end if;
  insert into public.attendance (class_id, user_id)
  values (p_class_id, p_user_id)
  on conflict (class_id, user_id) do nothing;
end;
$$ language plpgsql security definer;

create or replace function public.undo_check_in(p_class_id uuid, p_user_id uuid)
returns void as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Not authorized.';
  end if;
  delete from public.attendance where class_id = p_class_id and user_id = p_user_id;
end;
$$ language plpgsql security definer;

grant execute on function public.reserve_spot(uuid) to authenticated;
grant execute on function public.cancel_spot(uuid) to authenticated;
grant execute on function public.update_capacity(uuid, integer) to authenticated;
grant execute on function public.select_plan(uuid) to authenticated;
grant execute on function public.check_in(uuid, uuid) to authenticated;
grant execute on function public.undo_check_in(uuid, uuid) to authenticated;
