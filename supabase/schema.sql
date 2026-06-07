-- ============================================================
-- Transporter — Clean Schema v3
-- Run this in Supabase SQL Editor.
-- WARNING: drops all existing tables and starts fresh.
-- ============================================================

drop table if exists public.operation_events      cascade;
drop table if exists public.driver_live_tracking  cascade;
drop table if exists public.admin_notifications   cascade;
drop table if exists public.notifications         cascade;
drop table if exists public.login_approvals       cascade;
drop table if exists public.students              cascade;
drop table if exists public.drivers               cascade;
drop table if exists public.buses                 cascade;
drop table if exists public.registrations         cascade;

-- ============================================================
-- 1. buses
-- ============================================================
create table public.buses (
  id                 uuid        primary key default gen_random_uuid(),
  bus_number         text        not null unique,
  route_name         text        not null,
  plate              text        not null unique,
  status             text        not null default 'active'
                     check (status in ('active', 'inactive', 'maintenance')),
  assigned_driver_id uuid,                        -- FK added after drivers
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ============================================================
-- 2. registrations — every signup request (pending + approved history)
-- ============================================================
create table public.registrations (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  name         text        not null,
  email        text        not null unique,
  role         text        not null check (role in ('student', 'driver')),
  status       text        not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  approved_at  timestamptz
);

-- ============================================================
-- 3. drivers — approved drivers only
-- ============================================================
create table public.drivers (
  id         uuid        primary key references auth.users(id) on delete cascade,
  name       text        not null,
  email      text        not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. students — approved students only
-- ============================================================
create table public.students (
  id              uuid        primary key references auth.users(id) on delete cascade,
  name            text        not null,
  email           text        not null unique,
  assigned_bus_id uuid        references public.buses(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- now wire buses → drivers FK
alter table public.buses
  add constraint buses_driver_fk
  foreign key (assigned_driver_id) references public.drivers(id) on delete set null;

-- ============================================================
-- 5. notifications — admin broadcasts to students / drivers / all
-- ============================================================
create table public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  message     text        not null,
  target_role text        not null check (target_role in ('all', 'student', 'driver')),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- GPS support tables (needed for live tracking feature)
-- ============================================================

-- live GPS row per active driver (upserted every location update)
create table public.driver_live_tracking (
  user_id     uuid              primary key references public.drivers(id) on delete cascade,
  latitude    double precision  not null,
  longitude   double precision  not null,
  speed_kmh   double precision  not null default 0,
  distance_km double precision  not null default 0,
  is_active   boolean           not null default false,
  started_at  timestamptz,
  updated_at  timestamptz       not null default now()
);

-- trip event log (trip_started / trip_ended) — feeds the admin operations queue
create table public.operation_events (
  id             uuid              primary key default gen_random_uuid(),
  event_type     text              not null check (event_type in ('trip_started', 'trip_ended')),
  driver_user_id uuid              not null references public.drivers(id) on delete cascade,
  driver_name    text              not null,
  bus_id         uuid              references public.buses(id) on delete set null,
  bus_number     text,
  latitude       double precision,
  longitude      double precision,
  distance_km    double precision  not null default 0,
  speed_kmh      double precision  not null default 0,
  created_at     timestamptz       not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index on public.registrations (status);
create index on public.buses (assigned_driver_id);
create index on public.students (assigned_bus_id);
create index on public.driver_live_tracking (updated_at desc);
create index on public.operation_events (created_at desc);
create index on public.operation_events (driver_user_id);

-- ============================================================
-- Seed 48 default buses
-- ============================================================
insert into public.buses (bus_number, route_name, plate, status)
select
  'BUS-' || lpad(n::text, 3, '0'),
  (array[
    'SRM Main Gate',   'Potheri Station', 'Guduvanchery',  'Tambaram',
    'Chromepet',       'Velachery',       'Madhya Kailash','Sholinganallur'
  ])[(n - 1) % 8 + 1],
  'TN-' || lpad((10 + (n - 1) % 20)::text, 2, '0') || '-AB-' || (2000 + n)::text,
  'active'
from generate_series(1, 48) as n
on conflict (bus_number) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.registrations      enable row level security;
alter table public.students           enable row level security;
alter table public.drivers            enable row level security;
alter table public.buses              enable row level security;
alter table public.notifications      enable row level security;
alter table public.driver_live_tracking enable row level security;
alter table public.operation_events   enable row level security;

-- registrations: user sees own row; admin sees all
create policy "reg_own"   on public.registrations for select using (auth.uid() = user_id or auth.email() = 'transporter@admin.com');
create policy "reg_insert" on public.registrations for insert with check (auth.uid() = user_id);
create policy "reg_update" on public.registrations for update using (auth.email() = 'transporter@admin.com');

-- students: own row or admin
create policy "students_select" on public.students for select using (auth.uid() = id or auth.email() = 'transporter@admin.com');
create policy "students_insert" on public.students for insert with check (auth.email() = 'transporter@admin.com');
create policy "students_update" on public.students for update using (auth.email() = 'transporter@admin.com');

-- drivers: own row or admin
create policy "drivers_select" on public.drivers for select using (auth.uid() = id or auth.email() = 'transporter@admin.com');
create policy "drivers_insert" on public.drivers for insert with check (auth.email() = 'transporter@admin.com');

-- buses: all logged-in users read; admin writes
create policy "buses_read"  on public.buses for select using (auth.uid() is not null);
create policy "buses_write" on public.buses for all    using (auth.email() = 'transporter@admin.com');

-- notifications: visible by role; admin inserts
create policy "notif_select" on public.notifications for select using (
  auth.email() = 'transporter@admin.com'
  or target_role = 'all'
  or (target_role = 'student' and exists (select 1 from public.students where id = auth.uid()))
  or (target_role = 'driver'  and exists (select 1 from public.drivers  where id = auth.uid()))
);
create policy "notif_insert" on public.notifications for insert with check (auth.email() = 'transporter@admin.com');

-- live tracking: all logged-in read; driver writes own row
create policy "track_read"  on public.driver_live_tracking for select using (auth.uid() is not null);
create policy "track_write" on public.driver_live_tracking for all    using (auth.uid() = user_id);

-- operation events: all logged-in read; driver or admin inserts/updates
create policy "op_read"   on public.operation_events for select using (auth.uid() is not null);
create policy "op_insert" on public.operation_events for insert with check (auth.uid() = driver_user_id or auth.email() = 'transporter@admin.com');
create policy "op_update" on public.operation_events for update using  (auth.uid() = driver_user_id or auth.email() = 'transporter@admin.com');
