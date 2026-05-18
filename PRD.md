# PRD: RepoRadar — AI Codebase Onboarding + Knowledge Graph

## 1. Product Summary

**RepoRadar** is a web application that helps software engineers quickly understand unfamiliar GitHub repositories. A user enters a public GitHub repository URL, and RepoRadar analyzes the codebase, generates an AI-powered onboarding guide, and visualizes the repository as an interactive knowledge graph.

The project is designed to demonstrate full-stack software engineering skills suitable for software engineering internship applications: API integration, backend processing, database design, AI integration, graph visualization, deployment, testing, and product thinking.

## 2. Problem Statement

Developers often spend hours understanding a new codebase before they can make meaningful contributions. Existing GitHub repository pages show files, commits, and issues, but they do not explain architecture, important modules, dependency relationships, or where a beginner should start.

RepoRadar reduces onboarding time by turning a repository into:

- A concise project summary
- An architecture overview
- A visual dependency graph
- Important file/module explanations
- Suggested beginner contribution tasks
- A chat interface for asking questions about the repo

## 3. Target Users

### Primary User

**CS students / junior developers** who want to understand open-source repositories quickly and contribute to them.

### Secondary Users

- New engineers onboarding to an internal codebase
- Hackathon participants joining an unfamiliar project
- Technical recruiters or interviewers reviewing a candidate's project
- Open-source maintainers who want to make their repos easier to understand

## 4. Goals

### Product Goals

1. Let a user analyze a public GitHub repository from a URL.
2. Generate a useful codebase summary and architecture overview.
3. Display an interactive knowledge graph of files/modules and dependencies.
4. Allow users to click graph nodes and view AI-generated explanations.
5. Provide suggested starter tasks or contribution areas.
6. Provide a polished deployed demo suitable for a resume or portfolio.

### Engineering Goals

1. Demonstrate full-stack development using a modern frontend and backend.
2. Integrate with the GitHub API.
3. Persist repository metadata, file summaries, and graph data in a database.
4. Use an LLM API to summarize source files and answer questions.
5. Implement asynchronous or staged repo analysis.
6. Include tests, Docker support, CI, and clean documentation.

## 5. Non-Goals

For the one-week MVP, RepoRadar will **not**:

- Support private repositories
- Perform perfect static analysis across all languages
- Execute code from repositories
- Clone extremely large monorepos fully
- Replace tools like Sourcegraph, GitHub Copilot, or IDE language servers
- Guarantee perfect call-graph accuracy
- Support every programming language equally

The MVP should prioritize useful approximations over perfect code intelligence.

## 6. Core User Flow

1. User lands on the homepage.
2. User enters a public GitHub repository URL.
3. App validates the URL and extracts `owner` and `repo`.
4. Backend fetches repository metadata and file tree from GitHub.
5. Backend selects important files for analysis.
6. Backend parses imports/dependencies and builds graph nodes/edges.
7. Backend sends selected file chunks to an LLM for summarization.
8. User sees a repository dashboard with:
   - Repo summary
   - Tech stack
   - Architecture overview
   - Interactive knowledge graph
   - Important files
   - Suggested contribution tasks
9. User clicks a graph node to view file/module details.
10. User asks questions in the repo chat interface.

## 7. MVP Feature Requirements

## 7.1 Repository URL Input

### Description

Users can paste a GitHub repository URL and start analysis.

### Requirements

- Accept URLs like:
  - `https://github.com/vercel/next.js`
  - `github.com/vercel/next.js`
  - `vercel/next.js`
- Validate that the repo exists and is public.
- Show loading state while analysis begins.
- Show useful error messages for invalid URLs, missing repos, API rate limits, and unsupported repos.

### Acceptance Criteria

- User can submit a valid public GitHub repo URL.
- Invalid input shows a clear error.
- Valid input redirects to a repo dashboard or analysis status page.

## 7.2 Repository Metadata Fetching

### Description

The backend fetches high-level repository information from GitHub.

### Requirements

Fetch and store:

- Repository name
- Owner
- Description
- Stars
- Forks
- Default branch
- Primary language
- License, if available
- README content, if available
- File tree

### Acceptance Criteria

- Repo metadata appears on the dashboard.
- README content is used in the generated summary when available.

## 7.3 File Selection and Parsing

### Description

The system selects important files for summarization and graph generation.

### Requirements

Prioritize files such as:

- README files
- Package/config files
- API routes
- Source files
- Components
- Database/schema files
- Entry points
- Test files

Ignore files such as:

- `node_modules/`
- `.git/`
- Build artifacts
- Lock files, unless used only for package metadata
- Images/videos/fonts
- Very large files

### Acceptance Criteria

- App identifies important files without analyzing the entire repo blindly.
- Large repos remain usable by limiting file count and file size.

## 7.4 Knowledge Graph

### Description

The app displays an interactive graph showing how important files/modules relate to one another.

### Node Types

- Directory
- Source file
- Component
- API route
- Config file
- Database/schema file
- External dependency

### Edge Types

- `imports`
- `depends_on`
- `defines_route`
- `reads_from_db`
- `writes_to_db`
- `configured_by`
- `contains`

### MVP Graph Generation Strategy

1. Build initial nodes from the repository file tree.
2. Parse source files for import statements.
3. Resolve relative imports when possible.
4. Add edges between files based on imports.
5. Use heuristics to classify file roles.
6. Optionally use the LLM to label high-level modules.

### Frontend Requirements

Use **React Flow** for graph rendering.

Graph should support:

- Pan and zoom
- Clickable nodes
- Node detail panel
- Search by filename
- Filter by node type
- Highlight connected nodes
- Basic color or shape differences by node type

### Acceptance Criteria

- User can see a graph for an analyzed repo.
- User can click a node and view a summary.
- User can search for a file or module in the graph.
- Edges visually show dependency relationships.

## 7.5 AI Repository Summary

### Description

The app generates a concise overview of the repository.

### Requirements

Summary should include:

- What the project does
- Main technologies
- High-level architecture
- Main directories/modules
- Important entry points
- Suggested learning path through the repo

### Acceptance Criteria

- Summary is visible on repo dashboard.
- Summary references real files from the repo.
- Summary is generated only from fetched repository content, not hallucinated assumptions.

## 7.6 File and Module Summaries

### Description

Each important file or module gets a short explanation.

### Requirements

For each selected file, generate:

- Purpose
- Key exports/classes/functions, when detectable
- Dependencies
- Related files
- Why it matters

### Acceptance Criteria

- Clicking a graph node opens a detail panel.
- Detail panel includes an AI-generated explanation and file path.

## 7.7 Suggested Beginner Contribution Tasks

### Description

RepoRadar suggests beginner-friendly areas where a new contributor could start.

### Requirements

Suggestions may include:

- Documentation improvements
- Test coverage gaps
- Small refactors
- TODO comments found in code
- Simple UI improvements
- Good first issues, if available from GitHub issues

### Acceptance Criteria

- Dashboard shows 3–5 suggested contribution tasks.
- Suggestions are grounded in repository files, README, TODOs, or issues.

## 7.8 Repo Chat

### Description

Users can ask questions about the analyzed repository.

### Example Questions

- “Where is authentication handled?”
- “How does the API layer work?”
- “What file should I read first?”
- “How do I add a new route?”
- “What does this component depend on?”

### Requirements

- Store chat messages per repo analysis.
- Use selected file summaries and relevant chunks as context.
- Include file references in answers when possible.

### Acceptance Criteria

- User can ask a repo-specific question.
- App responds with a useful answer based on stored repo analysis.

## 8. Stretch Features

These are optional if MVP is finished early.

1. GitHub OAuth login
2. Private repo support
3. Export graph as PNG
4. Export repo onboarding guide as Markdown
5. Save analyzed repos to user account
6. Compare two repositories
7. Detect API routes automatically
8. Detect database models and schema relationships
9. Support background job queue with Redis/BullMQ/Celery
10. Add embeddings for better repo chat retrieval

## 9. Technical Architecture

## 9.1 Recommended Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- React Flow

### Backend

Option A: Next.js API routes for faster one-week build  
Option B: FastAPI for stronger backend separation

Recommended MVP: **Next.js full-stack app** for speed.

### Database

- Supabase Postgres

### AI

- OpenAI, Anthropic, or Gemini API

### External APIs

- GitHub REST API
- GitHub raw file content URLs

### Deployment

- Vercel for frontend/backend
- Supabase for database

### DevOps

- GitHub Actions for lint/test CI
- Dockerfile for local backend/app environment

## 9.2 High-Level System Diagram

```text
User
  |
  v
Next.js Frontend
  |
  v
API Route: /api/analyze
  |
  +--> GitHub API
  |      |
  |      v
  |   Repo metadata + file tree + file contents
  |
  +--> Repo Parser
  |      |
  |      v
  |   Important files + imports + graph edges
  |
  +--> LLM Summarizer
  |      |
  |      v
  |   Repo summary + file summaries + contribution ideas
  |
  v
Supabase Postgres
  |
  v
Repo Dashboard + Knowledge Graph + Chat
```

## 10. Data Model

## 10.1 `repos`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| owner | text | GitHub owner/org |
| name | text | Repo name |
| url | text | GitHub URL |
| description | text | GitHub description |
| default_branch | text | Usually `main` or `master` |
| primary_language | text | From GitHub |
| stars | integer | GitHub stars |
| forks | integer | GitHub forks |
| readme | text | README content |
| created_at | timestamp | App timestamp |
| updated_at | timestamp | App timestamp |

## 10.2 `analysis_jobs`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| repo_id | uuid | FK to repos |
| status | text | `queued`, `running`, `completed`, `failed` |
| error_message | text | Nullable |
| created_at | timestamp | Created time |
| completed_at | timestamp | Nullable |

## 10.3 `files`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| repo_id | uuid | FK to repos |
| path | text | File path |
| language | text | Detected language |
| size_bytes | integer | File size |
| content_hash | text | For caching |
| summary | text | AI-generated file summary |
| role | text | `component`, `api`, `config`, `schema`, etc. |
| created_at | timestamp | Created time |

## 10.4 `graph_nodes`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| repo_id | uuid | FK to repos |
| file_id | uuid | Nullable FK to files |
| label | text | Display label |
| path | text | File or directory path |
| type | text | Node type |
| summary | text | Short explanation |
| metadata | jsonb | Extra graph data |

## 10.5 `graph_edges`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| repo_id | uuid | FK to repos |
| source_node_id | uuid | FK to graph_nodes |
| target_node_id | uuid | FK to graph_nodes |
| type | text | Edge type |
| confidence | numeric | 0–1 confidence score |
| metadata | jsonb | Extra data |

## 10.6 `chat_messages`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| repo_id | uuid | FK to repos |
| role | text | `user` or `assistant` |
| content | text | Message text |
| citations | jsonb | Referenced files/chunks |
| created_at | timestamp | Created time |

## 11. API Routes

## 11.1 `POST /api/analyze`

Starts analysis for a GitHub repo.

### Request

```json
{
  "repoUrl": "https://github.com/owner/repo"
}
```

### Response

```json
{
  "repoId": "uuid",
  "jobId": "uuid",
  "status": "queued"
}
```

## 11.2 `GET /api/repos/:repoId`

Fetches repo dashboard data.

### Response

```json
{
  "repo": {},
  "summary": "string",
  "importantFiles": [],
  "suggestedTasks": []
}
```

## 11.3 `GET /api/repos/:repoId/graph`

Fetches graph data for React Flow.

### Response

```json
{
  "nodes": [
    {
      "id": "node-id",
      "type": "source_file",
      "data": {
        "label": "app/page.tsx",
        "summary": "Main landing page component"
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

## 11.4 `POST /api/repos/:repoId/chat`

Asks a question about a repo.

### Request

```json
{
  "message": "Where is authentication handled?"
}
```

### Response

```json
{
  "answer": "Authentication appears to be handled in...",
  "citations": [
    {
      "path": "src/auth/index.ts",
      "reason": "Defines auth middleware"
    }
  ]
}
```

## 12. Graph Parsing Heuristics

## 12.1 JavaScript/TypeScript Imports

Detect patterns:

```ts
import x from './module'
import { y } from '../utils/y'
const x = require('./module')
```

## 12.2 Python Imports

Detect patterns:

```py
import module
from package import thing
from .local_module import helper
```

## 12.3 Route Detection

Detect common route patterns:

- Next.js `app/api/**/route.ts`
- Express `app.get`, `app.post`, `router.get`, `router.post`
- FastAPI decorators like `@app.get`, `@router.post`

## 12.4 Database Detection

Detect common database files:

- `schema.prisma`
- `models.py`
- `schema.sql`
- `migrations/`
- `drizzle.config.ts`
- `supabase/`

## 12.5 Config Detection

Detect files like:

- `package.json`
- `next.config.js`
- `vite.config.ts`
- `tsconfig.json`
- `Dockerfile`
- `.github/workflows/*`
- `requirements.txt`
- `pyproject.toml`

## 13. UI Requirements

## 13.1 Homepage

Sections:

- Hero title: “Understand any GitHub repo in minutes”
- Repo URL input
- Example repos to try
- Feature preview cards

## 13.2 Analysis Status Page

Sections:

- Repo name
- Progress status
- Steps completed:
  - Fetching metadata
  - Reading file tree
  - Parsing dependencies
  - Generating summaries
  - Building graph

## 13.3 Repo Dashboard

Sections:

- Repo metadata card
- AI summary card
- Tech stack card
- Architecture overview
- Knowledge graph
- Important files list
- Suggested contribution tasks
- Chat panel

## 13.4 Graph Panel

Requirements:

- Large central graph canvas
- Left or top filter controls
- Right-side node detail drawer
- Search input
- Legend explaining node/edge types

## 14. Non-Functional Requirements

## 14.1 Performance

- Initial repo metadata should load within 3 seconds when GitHub API is responsive.
- Full analysis for small/medium repos should complete within 1–2 minutes.
- Graph should remain usable for at least 100 nodes and 300 edges.

## 14.2 Reliability

- Handle GitHub API failures gracefully.
- Handle LLM API failures gracefully.
- Store partial analysis results when possible.
- Do not crash the UI if graph generation fails.

## 14.3 Security

- Do not execute repository code.
- Only fetch and parse text files.
- Store API keys in environment variables.
- Sanitize rendered Markdown.
- Rate-limit repo analysis requests if deployed publicly.

## 14.4 Cost Control

- Limit number of files summarized per repo.
- Limit maximum file size.
- Cache previously analyzed repos.
- Use concise LLM prompts.
- Summarize files before using them in chat context.

## 14.5 Accessibility

- Keyboard-navigable UI controls
- Sufficient color contrast
- Text labels for graph controls
- Loading and error states readable by screen readers

## 15. Success Metrics

For the portfolio version, success is measured by demo quality and engineering completeness.

### Product Metrics

- User can analyze at least 3 public repos successfully.
- Generated summaries are useful and grounded.
- Graph makes architecture easier to understand.

### Engineering Metrics

- Deployed live app works from a public URL.
- README includes architecture diagram and setup instructions.
- At least 5 meaningful tests exist.
- CI runs lint/tests on pull requests.
- App has error handling for invalid repos and API failures.

## 16. Testing Plan

## 16.1 Unit Tests

Test:

- GitHub URL parser
- File filtering logic
- Import parser
- Node/edge generation
- Repo role classification heuristics

## 16.2 Integration Tests

Test:

- Analyze API with mocked GitHub responses
- Graph API returns valid React Flow format
- Chat API returns answer and citations

## 16.3 Manual Demo Tests

Analyze these example repos:

- A small Next.js app
- A small FastAPI app
- A medium-sized open-source repo

For each repo, verify:

- Metadata is correct
- Summary is reasonable
- Graph nodes appear
- Clicking a node shows details
- Chat answers repo-specific questions

## 17. One-Week Build Plan

## Day 1 — Foundation

- Create Next.js TypeScript app
- Add Tailwind CSS
- Create homepage with repo URL input
- Implement GitHub URL parser
- Set up Supabase project and schema
- Add repo metadata fetching

## Day 2 — GitHub File Fetching

- Fetch repo tree from GitHub
- Filter important files
- Fetch selected file contents
- Store file metadata
- Add analysis status UI

## Day 3 — Graph MVP

- Parse imports for JavaScript/TypeScript
- Create graph nodes and edges
- Store graph in database
- Render graph with React Flow
- Add node click detail drawer

## Day 4 — AI Summaries

- Add LLM integration
- Generate repo summary
- Generate file summaries
- Display dashboard summary cards
- Add prompt templates

## Day 5 — Repo Chat + Suggestions

- Implement repo chat endpoint
- Use file summaries as context
- Add suggested contribution tasks
- Add citations to files where possible

## Day 6 — Polish + Reliability

- Add loading, error, and empty states
- Add graph search/filter controls
- Add tests for parsing and graph generation
- Add Dockerfile
- Add GitHub Actions CI

## Day 7 — Deploy + Portfolio Packaging

- Deploy to Vercel
- Confirm Supabase production env vars
- Record 2-minute demo video
- Write strong README
- Add screenshots and architecture diagram
- Add resume bullet

## 18. README Requirements

The repository README should include:

1. Project title and one-line pitch
2. Live demo link
3. Demo video link
4. Screenshots
5. Architecture diagram
6. Tech stack
7. Features
8. How it works
9. Local setup instructions
10. Environment variables
11. Testing instructions
12. Known limitations
13. Future improvements

## 19. Resume Bullet

```text
Built RepoRadar, an AI-powered codebase onboarding platform that analyzes GitHub repositories, generates architecture summaries, and visualizes file/module dependencies through an interactive knowledge graph using Next.js, TypeScript, Supabase Postgres, React Flow, GitHub API, and LLM-based summarization.
```

## 20. Demo Script

1. Open the live app.
2. Paste a public GitHub repo URL.
3. Show repo metadata and generated summary.
4. Open the knowledge graph.
5. Search for an API route or important component.
6. Click a node and explain the file summary.
7. Ask chat: “What file should I read first?”
8. Show suggested contribution tasks.
9. Briefly explain architecture and tradeoffs.

## 21. Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| GitHub API rate limits | Use authenticated API token and caching |
| LLM cost grows too quickly | Limit file count, chunk size, and summarize selectively |
| Graph is too noisy | Filter by important files and node type |
| Import parsing is incomplete | Be transparent that MVP uses heuristics |
| Large repos are slow | Add file limits and progress states |
| AI hallucination | Ground prompts in actual file paths/content and show citations |

## 22. Definition of Done

The MVP is complete when:

- A user can submit a public GitHub repo URL.
- The app fetches repo metadata and important files.
- The app generates a useful repo summary.
- The app renders an interactive knowledge graph.
- The user can click graph nodes and see file/module summaries.
- The user can ask repo-specific chat questions.
- The project is deployed publicly.
- The README includes screenshots, architecture, setup, and demo instructions.
- The codebase includes basic tests and CI.
