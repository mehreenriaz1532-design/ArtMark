-- Artmark database setup. Paste this whole file into Supabase > SQL Editor > New query > Run.

-- 1) One generic table that holds chat data (threads, encrypted messages, public keys)
create table if not exists public.docs (
  path       text primary key,
  parent     text not null,
  data       jsonb not null default '{}'::jsonb,
  ts         bigint not null default 0,
  owner      uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists docs_parent_ts on public.docs (parent, ts);
alter table public.docs replica identity full;
alter table public.docs enable row level security;

drop policy if exists docs_read   on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;

-- Only signed-in people can read. Message text is end-to-end encrypted, so rows hold scrambled text.
create policy docs_read on public.docs for select to authenticated using (true);
-- You can only create rows as yourself, and only publish your own chat key.
create policy docs_insert on public.docs for insert to authenticated
  with check (owner = auth.uid() and (left(path,10) <> 'chat_keys/' or path = 'chat_keys/' || auth.uid()::text));
-- Thread rows are shared (joins, read receipts). Everything else only by its owner.
create policy docs_update on public.docs for update to authenticated
  using (left(path,8) = 'threads/' and left(path,10) <> 'chat_keys/' and position('/msgs/' in path) = 0
         or owner = auth.uid()
         or position('/msgs/' in path) > 0)
  with check (left(path,10) <> 'chat_keys/' or path = 'chat_keys/' || auth.uid()::text);
create policy docs_delete on public.docs for delete to authenticated using (owner = auth.uid());

-- 2) Deep merge helper so two people updating the same thread never overwrite each other
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
declare k text; r jsonb := coalesce(a, '{}'::jsonb);
begin
  if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(b) is distinct from 'object' then return b; end if;
  for k in select jsonb_object_keys(b) loop
    if jsonb_typeof(r -> k) = 'object' and jsonb_typeof(b -> k) = 'object' then
      r := jsonb_set(r, array[k], public.jsonb_deep_merge(r -> k, b -> k));
    else
      r := jsonb_set(r, array[k], b -> k, true);
    end if;
  end loop;
  return r;
end $$;

-- Fixed merge_doc with upsert to prevent P0002 errors
create or replace function public.merge_doc(p_path text, p_patch jsonb) returns void
language plpgsql as $$
begin
  insert into public.docs (path, parent, data, updated_at)
  values (p_path, split_part(p_path, '/', 1), p_patch, now())
  on conflict (path) do update 
  set data = public.jsonb_deep_merge(public.docs.data, p_patch), updated_at = now();
end $$;

-- 3) Public profiles (name and country) created automatically at sign-up
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text, country text, created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, country)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)), coalesce(new.raw_user_meta_data->>'country',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 4) Live updates
do $$ begin
  begin alter publication supabase_realtime add table public.docs; exception when duplicate_object then null; end;
end $$;

-- ================= v2 additions: social features (profiles, ratings, follows, orders, listings, reports) =================
create table if not exists public.app_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.app_admins enable row level security;
drop policy if exists app_admins_read on public.app_admins;
create policy app_admins_read on public.app_admins for select to authenticated using (true);

create or replace function public.is_admin(u uuid) returns boolean
language sql stable as $$ select exists(select 1 from public.app_admins where user_id = u) $$;

drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated using (
  left(path,8) <> 'reports/' or owner = auth.uid() or public.is_admin(auth.uid())
);

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
  using (
    (left(path,8) = 'threads/' and left(path,10) <> 'chat_keys/' and position('/msgs/' in path) = 0)
    or owner = auth.uid()
    or position('/msgs/' in path) > 0
    or (left(path,16) = 'follow_requests/' and data->>'target' = auth.uid()::text)
    or (left(path,7) = 'orders/' and (data->>'buyer' = auth.uid()::text or data->>'seller' = auth.uid()::text))
    or (left(path,8) = 'reports/' and public.is_admin(auth.uid()))
  )
  with check (left(path,10) <> 'chat_keys/' or path = 'chat_keys/' || auth.uid()::text);

create unique index if not exists follow_req_pair on public.docs (((data->>'from')), ((data->>'target')))
  where left(path,16) = 'follow_requests/';

create index if not exists docs_data_target on public.docs (((data->>'target'))) where left(path,16) = 'follow_requests/';
create index if not exists docs_data_from    on public.docs (((data->>'from')))    where left(path,16) = 'follow_requests/';
create index if not exists docs_data_buyer  on public.docs (((data->>'buyer')))  where left(path,7)  = 'orders/';
create index if not exists docs_data_seller on public.docs (((data->>'seller'))) where left(path,7)  = 'orders/';
