create table if not exists public.analysis_outputs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  repo_summary text not null,
  architecture_overview text not null,
  learning_path jsonb not null default '[]'::jsonb,
  suggested_tasks jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analysis_outputs_repo_id_created_at_idx
  on public.analysis_outputs(repo_id, created_at desc);

create index if not exists analysis_outputs_analysis_job_id_idx
  on public.analysis_outputs(analysis_job_id);
