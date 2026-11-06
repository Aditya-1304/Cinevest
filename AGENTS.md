# AGENTS.md

Rules for any agent (human or AI) working in this repository. Read this first in every session.

## Workflow

- Read agent memory and the current chat context first. Then read only the files strictly necessary for the task; do not bulk-explore the repository.
- Execute one bounded step at a time. Keep each change reviewable in isolation.
- Any code change requires the user's explicit approval in advance, or an implementation request from the user counts as an equivalent authorization for that task only. Do not expand scope.
- When the task is context gathering or planning, that authorization does not extend to adjacent code changes or features.
- Keep code simple, concise, and deletable. Do not add unnecessary code, dependencies, abstractions, comment narration, or features.
- Preference (explicitly confirmed by user): implement with quick, minimal, simple code and sparse, useful comments.
- Write professional comments only where they explain a component's responsibility or its connection to other parts of the system. Assume the reader can read code.
- When presenting code in chat, explain what behavior changes, why, and what benefit the user gets.
- Do not stage, commit, or push anything unless the user explicitly requests it.
- `Cinevest_TECH_SPEC_AND_BUILD_PLAN.md` is the governing implementation plan. Treat it as the source for what to build next. Do not build adjacent plan features unless explicitly asked.

## Testing

- Do not write test files or test cases until the user manually and explicitly asks for tests in a dedicated request.
- Do not run existing test suites unless the user explicitly asks. Build, lint, and typecheck checks are always allowed and expected after changes.

## Orchestration

- User-defined roles: **GPT Sol**, **Terra**, and **Claude models** orchestrate the work. They independently review every change for code correctness, appropriate efficiency, DRY, and the absence of panic or crash paths, and resolve blockers on errors or failing checks.
- Delegated implementation work goes to OpenCode agents on **DeepSeek V4.1 Flash** or **GLM 5.3 Flash** (the latest GLM release).
- Honor any model the user has already assigned to a task. Fallback limits, in order: **GPT 6 Luna Medium**  , then **Antigravity Gemini 3.8 Flash High**. Discover live model IDs and options from the available model catalog before delegating; never guess IDs.

- If the preferred OpenCode models (DeepSeek V4.1 Flash or GLM 5.3 Flash) are unavailable, use other available free OpenCode models as the next fallback. Discover available models and verify their IDs and free-tier availability before delegation. Do not guess model IDs or use paid models without authorization.

- Use T3 `delegate_task` for cross-provider delegation. Retain task IDs; start a new delegated task for every correction or review round. Never spawn top-level threads for delegation.
- Orchestrators independently verify delegated work; do not take sub-agent reports at face value.
- Do not delegate if the user requests direct handling.
