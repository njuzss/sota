# Validation — 2026-10-14 Asia/Shanghai

## Formal specification and source protection

Current checkout `/Users/zss/sota` was cloned from `git@github.com:njuzss/sota.git`, initial main `1b7131525b36988e4391923a5f8c8e19a6331a27`. Its REQUIREMENTS.md contains the formal V2 GitHub-native specification and is preserved unchanged. The earlier prepared implementation was reused and adapted to that specification; provisional Drive sync and reports/ contract were removed.

Old `/Users/zss/ai/sota`, `njuzss/ai`, local raw sources and existing tasks were read-only throughout. The user explicitly requested the home-directory clone; it is outside the parent ai repository and cannot enter its index. Parent status shows no sota/github changes from this run.

## Automated verification

- Independent `npm ci`: passed; npm audit 0 vulnerabilities. Local Node v26.8.2; Actions specifies Node 24.
- `npm test`: **44 passed, 0 failed** (25 inherited V1 tests, 19 static/migration/V2 regressions).
- `npm run typecheck`: passed.
- `PAGES_BASE_PATH=/sota/ npm run build:demo`: 14 fixture reports, 5 days; isolated and explicitly marked demo.
- Empty production source: honest empty publication, no fixture fallback. Malformed-only source does not replace it.
- Production `npm run validate:reports`: 21 valid, 0 invalid.
- Production `npm run build`: 21 reports / 11 dates, latest 2026-10-14; revision `06460e9acd507278a615a07c`.
- HTTP against a plain loopback static server (without SPA rewrites): 18 HTML routes returned 200; all assets/favicon use /sota/. All 11 daily JSON resources loaded with matching dates and demo=false.
- Regressions cover directory/filename/body identity, unsupported version/date/JSON, partial bad-report isolation, all-bad release preservation, fixture rejection, empty/null/holiday/missing channels, per-day snapshots, same-day updates, stable anchors after backfill, source disappearance, FTS-compatible query membership, retries/abort, dry-run/idempotence, ambiguous source conflict refusal and nested/symlink output guards.
- Independent-channel regression submits frontier and market, then revises frontier; both remain in the final publication and the earlier day's snapshot is unchanged. Actual simultaneous GitHub task submissions and hosted deployment sequencing still require cloud validation.

## Historical migration and public scope review

Read-only source inventory found 21 ordinary reports, with one new Trending report since the previous run. Coverage 2026-10-04..14: frontier 7, trending 10, market 4; 11 dates, one complete date (2026-10-08).

Dry-run, staging apply and canonical-path apply succeeded with 0 errors or competing revisions. Original schema versions, UTF-8 BOM and raw bytes retained: **21/21 migrated files byte-identical to their originals**. Only formal PH_*.json files entered data/reports/<channel>; no .gdoc, reading versions, SQLite, private attachments or demo reports migrated. Manifest/hash diagnostics stay in ignored data/migration/.

Reviewed the report inventory and public-news/project/market subject matter. Scans found no credential/private key/token patterns, personal account/identity/contact markers, private Drive/local URLs, URL userinfo or signed credential-bearing links. Market text is public commentary/scenarios, not an imported personal portfolio or transaction record. This check applies only to the reviewed corpus; later task output must continue the public-only contract.

## Browser checks

Final local /sota/ production build verified with in-app browser (prior agent-browser screenshot CDP operation was unreliable).

- Desktop newspaper structure preserved.
- 390×844 mobile: viewport/document width both 390, no horizontal overflow.
- Real `Codex` search returned 44 results; result -> latest day -> stable item anchor -> refresh succeeded.
- Publication diagnostics show build time separately from source generation time, deployment completion as requiring Actions confirmation, per-channel latest (frontier 10/11, trending 10/14, market 10/13), 10 incomplete dates and 0 parser failures.
- 917 optional-field warnings are recorded (images/publication times/evidence/metrics etc.); they are not fabricated or treated as task success.
- Screenshots saved outside Git under /private/tmp/sota-qa/. Temporary viewport reset.

## Cloud and task cutover gates

This record confirms local code/data/browser checks. A GitHub Actions/Pages hosted deployment must be independently confirmed after push and Pages configuration; a successful local build or workflow file alone is not an online release.

CLI login was initially blocked by direct HTTPS; device authorization became available via the existing local Shadowsocks proxy (per-process, no global network changes). SSH clone/push does not require CLI OAuth. TASK_PROMPTS.md provides three complete prompts, but no live task prompt/schedule/cutover or old-system shutdown occurred.
