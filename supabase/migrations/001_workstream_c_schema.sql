create extension if not exists pgcrypto;

create table if not exists public.repos (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null,
  url text not null,
  description text,
  default_branch text,
  primary_language text,
  stars integer,
  forks integer,
  readme text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repos_owner_name_key unique (owner, name)
);

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  status text not null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint analysis_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed'))
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  path text not null,
  language text,
  size_bytes integer,
  content_hash text,
  summary text,
  role text,
  created_at timestamptz not null default now(),
  constraint files_repo_id_path_key unique (repo_id, path)
);

create table if not exists public.graph_nodes (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  label text not null,
  path text not null,
  type text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  constraint graph_nodes_repo_id_path_key unique (repo_id, path)
);

create table if not exists public.graph_edges (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  source_node_id uuid not null references public.graph_nodes(id) on delete cascade,
  target_node_id uuid not null references public.graph_nodes(id) on delete cascade,
  type text not null,
  confidence numeric,
  metadata jsonb not null default '{}'::jsonb,
  constraint graph_edges_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  role text not null,
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint chat_messages_role_check check (role in ('user', 'assistant'))
);

create index if not exists repos_owner_name_idx on public.repos(owner, name);
create index if not exists analysis_jobs_repo_id_status_idx
  on public.analysis_jobs(repo_id, status);
create index if not exists files_repo_id_path_idx on public.files(repo_id, path);
create index if not exists graph_nodes_repo_id_path_idx on public.graph_nodes(repo_id, path);
create index if not exists chat_messages_repo_id_created_at_idx
  on public.chat_messages(repo_id, created_at);
