create table if not exists public.report_page_history (
  date_key text primary key,
  report_date text not null,
  report jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

grant select on public.report_page_history to anon, authenticated;
grant insert, update, delete on public.report_page_history to authenticated;

alter table public.report_page_history enable row level security;

drop policy if exists "anyone can read report page history" on public.report_page_history;
create policy "anyone can read report page history"
on public.report_page_history
for select
to anon, authenticated
using (true);

drop policy if exists "report admins can insert page history" on public.report_page_history;
create policy "report admins can insert page history"
on public.report_page_history
for insert
to authenticated
with check (public.is_report_admin());

drop policy if exists "report admins can update page history" on public.report_page_history;
create policy "report admins can update page history"
on public.report_page_history
for update
to authenticated
using (public.is_report_admin())
with check (public.is_report_admin());

drop policy if exists "report admins can delete page history" on public.report_page_history;
create policy "report admins can delete page history"
on public.report_page_history
for delete
to authenticated
using (public.is_report_admin());
