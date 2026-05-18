# RepoRadar Implementation Roadmap

RepoRadar is an AI-powered codebase onboarding app. The MVP lets a user submit a public GitHub repository, analyzes important files, generates summaries, builds an interactive knowledge graph, and supports repo-specific chat.

This roadmap is intentionally organized by parallel workstreams instead of a strict sequence. Multiple engineers or agents can implement different tracks at the same time as long as they respect the shared contracts.

## MVP Definition

The MVP is complete when:

- A user can submit a public GitHub repo URL.
- The app validates the repo and fetches metadata, README, file tree, and selected file contents.
- Important files are filtered, classified, summarized, and persisted.
- A React Flow graph renders nodes and dependency edges.
- Clicking a graph node opens a useful file/module detail view.
- The dashboard shows repo summary, architecture overview, important files, and suggested beginner tasks.
- The repo chat answers questions using stored analysis context and file citations.
- Basic tests, error handling, CI, deployment docs, and README are in place.

## Shared Technical Decisions

- Frontend/backend: Next.js with TypeScript.
- Styling: Tailwind CSS.
- Graph UI: React Flow.
- Database: Supabase Postgres.
- External APIs: GitHub REST API and GitHub raw file content.
- AI provider: OpenAI, Anthropic, or Gemini behind a small internal adapter.
- Deployment: Vercel for the app, Supabase for persistence.
- Security rule: never execute repository code; only fetch and parse text files.

## Parallel Workstream Map

```text
Foundation + App Shell
  |
  +--> GitHub Analysis Pipeline ----+
  |                                 |
  +--> Database Schema -------------+--> Dashboard APIs --> Dashboard UI
  |                                 |
  +--> Parser + Graph Engine --------+--> Graph API ------> React Flow UI
  |                                 |
  +--> AI Summaries -----------------+--> Chat API -------> Chat UI
  |
  +--> Testing + CI + Docs + Deploy
```

## Workstream A: Project Foundation

**Goal:** Create the base application structure that all other tracks can build on.

**Can run in parallel with:** Database schema planning, parser design, AI prompt design, README drafting.

**Tasks:**

- Create a Next.js TypeScript app.
- Add Tailwind CSS.
- Add linting, formatting, and test runner setup.
- Define environment variable names:
  - `GITHUB_TOKEN`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY` or selected AI provider equivalent
- Create shared app layout.
- Create shared UI primitives for buttons, inputs, cards, tabs, drawers, loading states, and error states.
- Add route structure:
  - `/`
  - `/repos/[repoId]`
  - `/repos/[repoId]/status`
- Add a small typed API response/error pattern used by all routes.

**Deliverables:**

- App boots locally.
- TypeScript, Tailwind, and tests are configured.
- Routes exist with placeholder content.

**Acceptance checks:**

- `npm run dev` starts the app.
- `npm run build` succeeds.
- `npm test` runs at least one starter test.

## Workstream B: Repository URL Input

**Goal:** Let users submit GitHub repository URLs safely and get redirected into analysis.

**Can run in parallel with:** GitHub client implementation, database schema, homepage design.

**Tasks:**

- Build homepage repo input form.
- Implement GitHub URL parser supporting:
  - `https://github.com/vercel/next.js`
  - `github.com/vercel/next.js`
  - `vercel/next.js`
- Validate owner and repo names.
- Call `POST /api/analyze`.
- Show loading state while submission is in progress.
- Show clear errors for invalid input, missing repo, private repo, rate limit, and unsupported repo.
- Add example repo buttons.

**Deliverables:**

- Homepage supports the core entry flow.
- URL parsing is covered by unit tests.

**Acceptance checks:**

- Valid repo input starts analysis.
- Invalid input shows a clear message without navigating.
- URL parser tests cover valid and invalid examples.

## Workstream C: Database Schema + Data Access

**Goal:** Persist repo metadata, analysis jobs, selected files, graph data, and chat history.

**Can run in parallel with:** UI scaffolding, GitHub API client, parser implementation.

**Tasks:**

- Create Supabase SQL schema for:
  - `repos`
  - `analysis_jobs`
  - `files`
  - `graph_nodes`
  - `graph_edges`
  - `chat_messages`
- Add indexes for common lookups:
  - `repos(owner, name)`
  - `analysis_jobs(repo_id, status)`
  - `files(repo_id, path)`
  - `graph_nodes(repo_id, path)`
  - `chat_messages(repo_id, created_at)`
- Add row fields from the PRD.
- Add status constraints for analysis jobs.
- Create typed data-access helpers.
- Add idempotent repo lookup/caching by owner and repo name.

**Deliverables:**

- SQL migration or setup file.
- Typed database helper module.
- Basic tests for data mapping if a local test strategy is available.

**Acceptance checks:**

- Schema can be applied to Supabase.
- API code can create a repo, create a job, store files, store graph nodes/edges, and store chat messages.

## Workstream D: GitHub API Integration

**Goal:** Fetch repo metadata, README, file tree, and selected raw file contents from public repositories.

**Can run in parallel with:** File filtering, database schema, status UI.

**Tasks:**

- Implement GitHub client using REST API.
- Fetch repository metadata:
  - owner
  - name
  - description
  - stars
  - forks
  - default branch
  - primary language
  - license
- Fetch README content when available.
- Fetch recursive file tree for default branch.
- Fetch raw contents for selected text files.
- Normalize GitHub API errors into app errors:
  - invalid repo
  - not found
  - private repo
  - rate limited
  - network/API failure
- Use `GITHUB_TOKEN` when available.

**Deliverables:**

- GitHub client module.
- Tests with mocked GitHub responses.

**Acceptance checks:**

- Metadata fetch works for a public repo.
- README is available to the analysis pipeline.
- File tree fetch produces paths, sizes, and blob metadata.
- API rate-limit errors are user-readable.

## Workstream E: File Selection + Classification

**Goal:** Choose a bounded set of important text files for analysis.

**Can run in parallel with:** GitHub tree fetching, parser implementation, AI prompt design.

**Tasks:**

- Implement file ignore rules for:
  - `node_modules/`
  - `.git/`
  - build outputs
  - binary assets
  - fonts
  - videos
  - large files
- Prioritize important files:
  - README
  - package/config files
  - source files
  - components
  - API routes
  - database/schema files
  - entry points
  - tests
- Add file count and file size limits.
- Detect language from extension/path.
- Classify file roles:
  - `readme`
  - `component`
  - `api`
  - `config`
  - `schema`
  - `test`
  - `entrypoint`
  - `source`
- Generate content hashes for caching.

**Deliverables:**

- File selection module.
- Role classification module.
- Unit tests for important/ignored file examples.

**Acceptance checks:**

- Large repos do not trigger unbounded analysis.
- Important files are selected before lower-value files.
- Binary/generated files are skipped.

## Workstream F: Parser + Graph Engine

**Goal:** Build a useful dependency graph from selected files using lightweight heuristics.

**Can run in parallel with:** React Flow UI, file summaries, graph API contract.

**Tasks:**

- Parse JavaScript/TypeScript imports:
  - `import x from './module'`
  - `import { y } from '../utils/y'`
  - `const x = require('./module')`
- Parse basic Python imports:
  - `import module`
  - `from package import thing`
  - `from .local_module import helper`
- Resolve relative imports where possible.
- Create graph nodes for files and important directories.
- Create external dependency nodes for package imports.
- Create edges:
  - `imports`
  - `depends_on`
  - `contains`
  - `configured_by`
- Add route detection heuristics:
  - Next.js `app/api/**/route.ts`
  - Express `app.get`, `app.post`, `router.get`, `router.post`
  - FastAPI `@app.get`, `@router.post`
- Add database detection heuristics:
  - `schema.prisma`
  - `models.py`
  - `schema.sql`
  - `migrations/`
  - `drizzle.config.ts`
  - `supabase/`
- Produce React Flow-compatible graph output.

**Deliverables:**

- Import parser module.
- Graph builder module.
- Tests for import parsing and node/edge generation.

**Acceptance checks:**

- Graph can represent at least 100 nodes and 300 edges.
- Relative imports connect to real selected files when resolvable.
- Graph generation failure does not crash the whole analysis.

## Workstream G: Analysis Orchestration

**Goal:** Connect GitHub fetching, file selection, parsing, AI summarization, and database writes behind `POST /api/analyze`.

**Can run in parallel with:** UI status page, individual pipeline modules.

**Tasks:**

- Implement `POST /api/analyze`.
- Create or reuse repo record.
- Create analysis job with status `queued`.
- Run staged analysis:
  - fetching metadata
  - reading file tree
  - selecting files
  - fetching file contents
  - parsing dependencies
  - generating summaries
  - building graph
  - completed
- Store partial results as stages complete.
- Mark failed jobs with error messages.
- Return:
  - `repoId`
  - `jobId`
  - `status`
- Add caching behavior for previously analyzed repos.

**Deliverables:**

- Analyze API route.
- Analysis service module.
- Integration tests using mocked GitHub and mocked AI responses.

**Acceptance checks:**

- Submitting a valid public repo creates a repo and job.
- Failed stages return useful status instead of crashing.
- Previously analyzed repos avoid unnecessary expensive work.

## Workstream H: AI Summaries + Suggestions

**Goal:** Generate grounded repository summaries, file summaries, architecture notes, learning paths, and starter tasks.

**Can run in parallel with:** Parser, database, dashboard UI.

**Tasks:**

- Create AI provider adapter so the app is not tightly coupled to one SDK.
- Create prompt templates for:
  - repository summary
  - file/module summary
  - architecture overview
  - suggested learning path
  - beginner contribution tasks
  - repo chat answer
- Ground prompts only in fetched README, file paths, selected file contents, parsed dependencies, summaries, TODOs, and issues if available.
- Limit prompt size and file count.
- Generate file summaries before repo chat uses them.
- Include file citations in outputs where possible.
- Handle LLM failure by storing fallback summaries or partial analysis.

**Deliverables:**

- AI adapter module.
- Prompt template module.
- Summary generation service.
- Tests using mocked model responses.

**Acceptance checks:**

- Repo summary references real files.
- File summary includes purpose, key exports/functions when detectable, dependencies, related files, and why it matters.
- Dashboard can show 3-5 grounded beginner contribution tasks.

## Workstream I: Dashboard APIs

**Goal:** Expose stored analysis data to the frontend.

**Can run in parallel with:** Dashboard UI and graph UI once response contracts are agreed.

**Tasks:**

- Implement `GET /api/repos/:repoId`.
- Return:
  - repo metadata
  - summary
  - tech stack
  - architecture overview
  - important files
  - suggested tasks
  - latest analysis job status
- Implement `GET /api/repos/:repoId/graph`.
- Return React Flow-compatible nodes and edges.
- Implement `GET /api/repos/:repoId/status` if the status page needs polling.
- Normalize not-found and failed-analysis responses.

**Deliverables:**

- Dashboard API routes.
- Graph API route.
- Status API route if needed.
- Integration tests for response shapes.

**Acceptance checks:**

- Dashboard can load from stored data without re-running analysis.
- Graph API returns valid node and edge arrays.
- Failed or incomplete analysis states are represented clearly.

## Workstream J: Dashboard UI

**Goal:** Present the analyzed repository in a polished, portfolio-ready dashboard.

**Can run in parallel with:** API implementation using mocked/static data.

**Tasks:**

- Build repo dashboard route.
- Add repo metadata panel.
- Add AI summary panel.
- Add tech stack panel.
- Add architecture overview section.
- Add important files list.
- Add suggested contribution tasks section.
- Add loading, empty, and failed states.
- Ensure UI is keyboard navigable and responsive.

**Deliverables:**

- Dashboard page.
- Reusable dashboard components.

**Acceptance checks:**

- Dashboard renders useful data for a completed analysis.
- Dashboard handles queued/running/failed states.
- Text does not overflow on mobile or desktop.

## Workstream K: React Flow Knowledge Graph UI

**Goal:** Let users explore repository structure and dependencies visually.

**Can run in parallel with:** Graph engine and graph API using mocked graph data.

**Tasks:**

- Add React Flow dependency.
- Build graph canvas component.
- Render typed node styles:
  - directory
  - source file
  - component
  - API route
  - config file
  - schema file
  - external dependency
- Render labeled edges.
- Add pan and zoom controls.
- Add search by filename/module.
- Add filter by node type.
- Highlight connected nodes.
- Add node detail drawer.
- Add legend for node and edge types.

**Deliverables:**

- Graph panel component.
- Node detail drawer component.
- Search/filter controls.

**Acceptance checks:**

- User can inspect graph without page crashes.
- Clicking a node shows path, type, and summary.
- Search and filters update the graph.

## Workstream L: Repo Chat

**Goal:** Allow users to ask questions about the analyzed repository.

**Can run in parallel with:** Dashboard UI and AI summary service after data contract is clear.

**Tasks:**

- Implement `POST /api/repos/:repoId/chat`.
- Store user messages.
- Retrieve relevant context from file summaries, repo summary, graph metadata, and selected file chunks.
- Call AI adapter with grounded context.
- Store assistant response and citations.
- Return:
  - `answer`
  - `citations`
- Build dashboard chat panel.
- Display cited files with answer.
- Handle loading, empty, and error states.

**Deliverables:**

- Chat API route.
- Chat service.
- Chat UI panel.

**Acceptance checks:**

- User can ask a repo-specific question.
- Answer uses stored analysis context.
- Answer includes file citations when relevant.

## Workstream M: Analysis Status UI

**Goal:** Make staged analysis understandable while the backend works.

**Can run in parallel with:** Analysis orchestration and dashboard UI.

**Tasks:**

- Build `/repos/[repoId]/status` page.
- Show repo name when available.
- Show stage checklist:
  - fetching metadata
  - reading file tree
  - parsing dependencies
  - generating summaries
  - building graph
- Poll job status.
- Redirect or link to dashboard when completed.
- Show failure messages with retry path.

**Deliverables:**

- Status page.
- Status polling hook.

**Acceptance checks:**

- User gets clear feedback during analysis.
- Failed jobs show a readable error.
- Completed jobs link to dashboard.

## Workstream N: Reliability, Security, and Cost Controls

**Goal:** Make the MVP demoable without surprise crashes, runaway cost, or unsafe behavior.

**Can run in parallel with:** All implementation tracks.

**Tasks:**

- Add request-level validation for all API routes.
- Add repo analysis rate limiting if deployed publicly.
- Enforce max file count.
- Enforce max file size.
- Enforce max total prompt tokens or character budget.
- Sanitize rendered Markdown.
- Never execute or install code from analyzed repositories.
- Store API keys only in environment variables.
- Add graceful fallbacks for:
  - GitHub failures
  - LLM failures
  - Supabase failures
  - graph generation failures
- Add structured server logs for analysis stages.

**Deliverables:**

- Validation utilities.
- Rate-limit/cost-limit utilities.
- Error handling pattern.

**Acceptance checks:**

- Invalid input cannot start expensive analysis.
- LLM failure does not erase fetched repo data.
- UI remains usable when graph or summaries are incomplete.

## Workstream O: Tests + CI

**Goal:** Cover the riskiest logic and make the project credible for portfolio review.

**Can run in parallel with:** Feature implementation once module contracts exist.

**Tasks:**

- Add unit tests for:
  - GitHub URL parser
  - file filtering
  - import parser
  - graph generation
  - role classification
- Add integration tests for:
  - `POST /api/analyze` with mocked GitHub and AI
  - `GET /api/repos/:repoId/graph`
  - `POST /api/repos/:repoId/chat`
- Add at least one UI-level smoke test if tooling allows.
- Add GitHub Actions workflow for lint/test/build.

**Deliverables:**

- Test suite with at least 5 meaningful tests.
- CI workflow file.

**Acceptance checks:**

- Tests run locally.
- CI runs on pull requests.
- Mocked integrations avoid real GitHub/AI spend in tests.

## Workstream P: Docker, Deployment, and Documentation

**Goal:** Package the project so it is easy to run, deploy, and present.

**Can run in parallel with:** Feature implementation.

**Tasks:**

- Add Dockerfile.
- Add `.env.example`.
- Add setup instructions for Supabase.
- Add Vercel deployment instructions.
- Write README with:
  - project title and one-line pitch
  - live demo link placeholder
  - demo video link placeholder
  - screenshots placeholder
  - architecture diagram
  - tech stack
  - features
  - how it works
  - local setup
  - environment variables
  - testing instructions
  - known limitations
  - future improvements
- Add portfolio demo script.
- Add resume bullet.

**Deliverables:**

- Dockerfile.
- `.env.example`.
- README.
- Deployment notes.

**Acceptance checks:**

- A new developer can run the app from README instructions.
- Vercel deployment has documented environment variables.
- README clearly explains the architecture and MVP limits.

## Suggested Parallel Implementation Groups

These groups can work at the same time:

- **Group 1: App Shell + Homepage**
  - Workstreams A and B.
- **Group 2: Backend Data Foundation**
  - Workstreams C, D, and I.
- **Group 3: Analysis Intelligence**
  - Workstreams E, F, G, and H.
- **Group 4: Product UI**
  - Workstreams J, K, L, and M using mocked API data at first.
- **Group 5: Quality + Launch**
  - Workstreams N, O, and P.

## Key Interface Contracts

Agree on these early so parallel work does not block.

### Analyze API

```json
{
  "repoUrl": "https://github.com/owner/repo"
}
```

```json
{
  "repoId": "uuid",
  "jobId": "uuid",
  "status": "queued"
}
```

### Dashboard API

```json
{
  "repo": {
    "id": "uuid",
    "owner": "owner",
    "name": "repo",
    "url": "https://github.com/owner/repo",
    "description": "Repository description",
    "defaultBranch": "main",
    "primaryLanguage": "TypeScript",
    "stars": 1000,
    "forks": 100,
    "license": "MIT"
  },
  "summary": "Grounded repository summary.",
  "architectureOverview": "High-level architecture notes.",
  "techStack": ["Next.js", "TypeScript"],
  "importantFiles": [
    {
      "id": "uuid",
      "path": "app/page.tsx",
      "role": "component",
      "summary": "Main landing page."
    }
  ],
  "suggestedTasks": [
    {
      "title": "Improve README setup docs",
      "reason": "The README mentions setup but does not include environment variables.",
      "paths": ["README.md"]
    }
  ],
  "job": {
    "id": "uuid",
    "status": "completed",
    "errorMessage": null
  }
}
```

### Graph API

```json
{
  "nodes": [
    {
      "id": "node-id",
      "type": "source_file",
      "data": {
        "label": "app/page.tsx",
        "path": "app/page.tsx",
        "summary": "Main page component",
        "nodeType": "component"
      },
      "position": {
        "x": 0,
        "y": 0
      }
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "source": "source-node-id",
      "target": "target-node-id",
      "label": "imports"
    }
  ]
}
```

### Chat API

```json
{
  "message": "What file should I read first?"
}
```

```json
{
  "answer": "Start with README.md, then app/page.tsx because they introduce the project and primary entry point.",
  "citations": [
    {
      "path": "README.md",
      "reason": "Project overview and setup instructions"
    },
    {
      "path": "app/page.tsx",
      "reason": "Main application entry point"
    }
  ]
}
```

## MVP Milestones

Milestones describe integration readiness, not strict order.

### Milestone 1: Local App Skeleton

- Next.js app runs locally.
- Homepage exists.
- Basic routes exist.
- Tests and build scripts run.

### Milestone 2: Repository Metadata Analysis

- User submits repo URL.
- Backend validates repo and stores metadata.
- Status page shows progress.
- Dashboard can show stored repo metadata.

### Milestone 3: File Analysis Pipeline

- File tree is fetched.
- Important files are selected and stored.
- File roles and languages are classified.
- Limits prevent runaway analysis.

### Milestone 4: Knowledge Graph MVP

- Imports are parsed.
- Graph nodes and edges are generated.
- Graph API returns React Flow data.
- React Flow renders clickable nodes.

### Milestone 5: AI Onboarding Guide

- Repo summary is generated.
- File summaries are generated.
- Architecture overview and learning path appear on dashboard.
- Suggested beginner tasks appear on dashboard.

### Milestone 6: Repo Chat

- Chat messages are stored.
- User can ask a repo-specific question.
- Assistant answers using stored analysis context.
- Citations are shown.

### Milestone 7: Portfolio-Ready Demo

- Error states are polished.
- Basic accessibility checks pass.
- Tests and CI are in place.
- App is deployed.
- README, screenshots, architecture diagram, and demo script are complete.

## Stretch Backlog

These should only start after the MVP is stable:

- GitHub OAuth login.
- Private repo support.
- Export graph as PNG.
- Export onboarding guide as Markdown.
- Save analyzed repos to user accounts.
- Compare two repositories.
- Better route detection.
- Better database model/schema detection.
- Background job queue with Redis, BullMQ, or Celery.
- Embeddings-based retrieval for repo chat.
- GitHub issues integration for stronger beginner task suggestions.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| GitHub API rate limits | Use authenticated requests, cache analyses, and show rate-limit errors clearly. |
| LLM cost grows quickly | Limit selected files, file sizes, chunk sizes, and prompt budgets. |
| Graph becomes noisy | Filter by important files, node type, and connected neighborhood. |
| Import parsing is incomplete | Use transparent MVP heuristics and focus on useful approximations. |
| Large repos are slow | Add staged progress, strict limits, and partial-result storage. |
| AI hallucination | Ground every prompt in fetched files and return citations. |
| Demo breaks from missing env vars | Provide `.env.example`, setup docs, and friendly startup checks. |

## Recommended First Implementation Slice

For the fastest working vertical slice, build these pieces together:

1. Project foundation.
2. Homepage repo input.
3. GitHub URL parser.
4. GitHub metadata fetch.
5. Supabase `repos` and `analysis_jobs` tables.
6. `POST /api/analyze`.
7. Basic status page.
8. Basic dashboard showing repo metadata.

After that slice works, the graph, AI summaries, chat, and polish can proceed independently.
