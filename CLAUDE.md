# CLAUDE.md — working agreement for Claude Code in this repository

This is `saulpatinojr/HCW-MigrateOrchestrator_AddOn`, the **downstream web-front edition** (ADR-0028): the CSV lab API, the
pane app the website frames (`apps/lab-web`), the browser e2e suite, the lab image and the website-integration docs. The engine, rules, CLI and UI
components live upstream in `saulpatinojr/HCW-MigrateOrchestrator_App` and arrive here as `@hybridcloudworks/migration-core`
and `@hybridcloudworks/migration-ui`. Nothing here may reach Azure; `tests/security/edition-boundary.test.mjs` enforces it.

- Dependency contract (ADR-0030): `package.json` pins both packages as the tarballs attached to the upstream GitHub
  Release of one `v*` tag, by URL; `package-lock.json` carries their integrity hash and `npm ci` verifies it. No sibling
  checkout, no registry. `core-update.yml` bumps both URLs and re-locks when a newer release exists; never edit the URLs
  by hand to `main` or to two different tags.
- **Read `docs/whats-new-upstream.md` before changing behaviour or bumping the upstream pin** (what changed upstream, whether
  it reaches this edition, what to run). Add an entry to it whenever an upstream change reaches this edition, including
  every `core-update` pull request you merge, and keep its "Current upstream state" table true.
- Do not change engine behaviour, rules or UI components here: change them upstream, release, and let `core-update` bring the
  release down. Only this edition's own code (lab API, harness, e2e, infra, docs) is edited here.
- Run `npm ci` then `npm test` and, for anything touching the
  explorer or the API, `npm run e2e` before claiming anything works. Never claim a check passed that you did not run.
- Never weaken: the lab's inability to construct an Azure provider, the unauthenticated confidence cap, owner-token isolation,
  the 5 MB / 5,000-row limits, exact-origin CORS, fail-closed human verification on uploads, the per-client rate limit and
  concurrency cap, `frame-ancestors` from env, the "not production" labels.
- The pane app is `apps/lab-web`; the site frames it at `/tools/migration`. Keep the pane protocol (`{ type: 'hcw-addon',
  id: 'migration', state }` posted to `/api/health.siteOrigins` on transitions only; states `loading|ready|working|unavailable`;
  `navigate`), the flat `/api/health` envelope and the `X-Addon-*` headers (`docs/website-integration/integration-guide.md`).
  No vendor names in anything a visitor can read in the pane.
- No secrets, tokens, customer inventories or real tenant/subscription IDs anywhere, including fixtures and tests.
- Owner-pasteable commands: no placeholders; bash and PowerShell both acceptable.
- A new credential (a token, key, password or certificate), or a workflow that reads one, is registered in the website repository
  in the same piece of work: a row in its credential register, which gives it a renewal reminder, and its rows in the two standards
  pages. The rule and the files are in that repository's `.claude/CLAUDE.md`, under "A new credential arrives with its register
  row, its test and its reminder". `CLAUDE_CODE_OAUTH_TOKEN`, which `.github/workflows/claude.yml` signs in with, is registered
  there as `gh-claude-code-oauth-token`; it expires a year after the owner makes it.
- ADRs are recorded upstream (shared numbering); copy edition-relevant ones into `docs/adr/`. Record limitations in `VALIDATION.md`.
