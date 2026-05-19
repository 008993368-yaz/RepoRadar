# RepoRadar

RepoRadar is an AI-powered codebase onboarding app that will analyze public GitHub repositories, summarize important files, and render an interactive knowledge graph.

## Current Status

RepoRadar is complete through Workstream D:

- **Workstream A: Project Foundation**
  - Next.js App Router with TypeScript
  - Tailwind CSS
  - ESLint
  - Vitest and Testing Library
  - Shared UI primitives
  - Shared typed API response helpers
  - Routes for `/`, `/repos/[repoId]`, and `/repos/[repoId]/status`
- **Workstream B: Repository URL Input**
  - Homepage GitHub repository input form
  - URL parsing for full GitHub URLs, `github.com/owner/repo`, and `owner/repo`
  - Client-side validation, loading state, API error display, and example repositories
- **Workstream C: Database Schema + Data Access**
  - Supabase migrations for repos, analysis jobs, files, graph nodes, graph edges, and chat messages
  - Indexed common lookup paths and status constraints
  - Typed Supabase data-access helpers for repository analysis records
- **Workstream D: GitHub API Integration**
  - GitHub REST API client for repository metadata, README content, recursive file trees, and raw file contents
  - Optional `GITHUB_TOKEN` support
  - Normalized GitHub errors for invalid, missing, private, rate-limited, network, and API failure cases
  - `POST /api/analyze` now parses input, fetches GitHub metadata/README, persists the repo, and queues an analysis job

Next up: Workstream E, file selection and classification.

## Getting Started

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Apply the Supabase migrations in `supabase/migrations` to your Supabase project.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Environment Variables

```bash
GITHUB_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
```
