-- Historique des conversations de l'assistant.
-- Chaque utilisateur ne voit, ne modifie et ne supprime QUE ses propres conversations (Row Level Security).
-- À exécuter une fois : Supabase → SQL Editor → coller → Run.

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'Nouvelle conversation',
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

drop policy if exists "conversations: lecture des siennes" on public.conversations;
drop policy if exists "conversations: création des siennes" on public.conversations;
drop policy if exists "conversations: modification des siennes" on public.conversations;
drop policy if exists "conversations: suppression des siennes" on public.conversations;

create policy "conversations: lecture des siennes" on public.conversations
  for select to authenticated using (auth.uid() = user_id);
create policy "conversations: création des siennes" on public.conversations
  for insert to authenticated with check (auth.uid() = user_id);
create policy "conversations: modification des siennes" on public.conversations
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversations: suppression des siennes" on public.conversations
  for delete to authenticated using (auth.uid() = user_id);
