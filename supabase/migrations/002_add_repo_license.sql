alter table public.repos
  add column if not exists license text;
