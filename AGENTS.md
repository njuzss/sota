# SOTA V2 boundaries

- REQUIREMENTS.md in this repository is the authoritative V2 migration specification.
- The old njuzss/ai repository, local source reports and existing Scheduled Tasks remain read-only until the user confirms task cutover.
- Tasks only create/update data/reports/<channel>/PH_<CHANNEL>_YYYY-MM-DD.json in main. Directory, filename and JSON identity must match.
- Pages read only same-origin static publication JSON. No runtime LLM, collection, GitHub/Google API, server, SQLite or credentials.
- Reuse Schema v1, parsing, per-report snapshots, existing UI and market presentation.
- Raw reports are immutable historical source assets; derived SQLite/publication data is rebuildable and ignored. Isolate invalid reports without deleting valid history.
- Never publish fixtures as production reports, or copy credentials, personal/internal documents, caches or old binaries into this public repository.
- Local dev/preview binds to 127.0.0.1. No PostgreSQL, queues, cloud functions or AI pipeline.
