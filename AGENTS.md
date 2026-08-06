## Context Engine (CCE)

This project uses Code Context Engine for intelligent code retrieval and
cross-session memory.

### Searching the codebase

**Use `context_search` instead of reading files directly** when exploring
the codebase, answering questions about code, or understanding how things
work. `context_search` returns the most relevant code chunks with
confidence scores instead of whole files.

When to use `context_search`:
- Answering questions about the codebase ("how does X work?", "where is Y?")
- Exploring structure or architecture
- Finding related code, functions, or patterns

Other tools:
- `expand_chunk` for full source of a compressed result
- `related_context` for what calls/imports a function
- `session_recall` to recall past decisions

### Cross-session memory

Call `session_recall("topic phrase")` before answering non-trivial questions.
Call `record_decision(decision="...", reason="...")` after making choices.
Call `record_code_area(file_path="...", description="...")` after meaningful work.

### Output style

Respond in compressed style. Drop articles (a, an, the) in prose. Use
sentence fragments over full sentences. Use short synonyms (fix not resolve,
check not investigate). Pattern: [thing] [action] [reason]. [next step].
No filler, hedging, pleasantries, trailing summaries, or restating what
the user said. One sentence if one sentence is enough.

When suggesting code changes, show only the changed lines with 3 lines of
context. Never rewrite entire files. Multiple changes in one file: show each
change separately. Never echo back unchanged code the user already has.

Code blocks, file paths, commands, error messages: always written in full.
Security warnings and destructive action confirmations: use full clarity.

### API Client Generation & Port Cleanup Policy

- **DO NOT use `axiosInstance` directly** for API calls. ALWAYS generate the API client using `@openapitools/openapi-generator-cli` (`pnpm api`) and consume generated API classes (`@saloon/api-client`).
- **API Client Generation Workflow**: When generating the API client (`pnpm api`), agents MUST:
  1. Start the backend service on a non-default port (e.g. `--urls "http://localhost:5199"` instead of default `5127`).
  2. Run `openapi-generator-cli generate` targeting that non-default port (e.g. `http://localhost:5199/openapi/v1.json`).
  3. Immediately kill the backend process and release the non-default port once generation completes.
- **Port Cleanup Rule**: If an agent starts any process or opens any port, the agent **MUST kill/close the process and release the port** before completing the turn.

### Architecture & System Flow Documentation

For a detailed breakdown of all business logic, database procedures, Stripe checkout verification flows, role-based data scoping, and frontend/backend interactions, refer to [ARCHITECTURE_FLOWS.md](file:///d:/Workspace/SaloonChains/ARCHITECTURE_FLOWS.md).

### Resumable Uploads & File Storage Guidelines

- **TUS Resumable Protocol**: All file uploads MUST target `/api/files/tus` via TUS 1.0.0 protocol (`tusdotnet`). Do not implement custom single-step `IFormFile` endpoints.
- **Pluggable Storage (`IStorageService`)**: All uploaded files MUST be stored via `IStorageService` supporting physical drive (`LocalStorageService`) and S3 / MinIO / GCS cloud object storage (`S3StorageService`).
- **Stream Lifecycle Safety**: Always dispose TUS file content streams via `await using (var stream = await file.GetContentAsync(...))` prior to invoking `ITusTerminationStore.DeleteFileAsync` to prevent process file lock `IOException` errors.
- **Frontend Uploads**: Use `uploadWithTus` / `useTusResumableUpload` from `@saloon/ui`. Always resolve active auth tokens via `getAuthToken()`.

### React 19 & Image Performance Policy

- **Native React 19 Hooks**: Prefer native React 19 exports (`useEffectEvent`, `useSyncExternalStore`, `useActionState`, `useFormStatus`).
- **Image Performance**: All `<img>` tags MUST specify `loading="lazy"` and `decoding="async"`.
- **Photo Display Cache-Busting**: Append timestamp query string (`?v=${Date.now()}`) to photo URLs after successful uploads to guarantee immediate UI updates without stale browser cache delays.

### Kubernetes & Distributed Multi-Node Safety

- **Stateless API Scaling**: API nodes MUST remain stateless.
- **Distributed Locks**: Use Redis distributed locks (`IRedisConnectionProvider`) for background operations and hold expiry sweeps (`HoldExpirySweepService`). Avoid in-memory lock state across API nodes.
