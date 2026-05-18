# RepoRadar

RepoRadar is an AI-powered codebase onboarding app that will analyze public GitHub repositories, summarize important files, and render an interactive knowledge graph.

## Current Status

Workstream A establishes the project foundation:

- Next.js App Router with TypeScript
- Tailwind CSS
- ESLint
- Vitest and Testing Library
- Shared UI primitives
- Shared typed API response helpers
- Placeholder routes for `/`, `/repos/[repoId]`, and `/repos/[repoId]/status`

## Getting Started

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

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
```
