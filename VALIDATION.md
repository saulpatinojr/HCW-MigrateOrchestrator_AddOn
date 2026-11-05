# VALIDATION.md

Web-front edition (`saulpatinojr/HCW-MigrateOrchestrator_AddOn`, ADR-0028). Everything below distinguishes what was executed
from what was not. Engine, rule and UI validation lives upstream in `saulpatinojr/HCW-MigrateOrchestrator_App/VALIDATION.md`.

## core-update runs from main only, and auto-merge ignores the bump job's report (2026-10-31)

What changed: the first step of both jobs refuses a run whose `github.ref` is not `refs/heads/main`, the `pull-request`
job's `if:` also requires it, both checkouts take `github.sha`, and `create-pull-request` gets `base: main`. The
auto-merge step's condition is now `CORE_AUTOMERGE == 'true'`, not a probe, the apply step succeeded and a pull request
number exists; it no longer reads the untrusted outcome.

- **Executed:** `npm ci`; `npm test` — **116 pass, 0 fail**; `node --test tests/security/core-update-app-token.test.mjs`
  — 22 pass, with three new or rewritten tests (the refusal is the first step of each job, has no `if:`, reads the ref
  through `env` and names it in an `::error::`; the `bump` job has no job-level `if:` and the `pull-request` job's
  requires `main`; both checkouts use `github.sha` and the pull request step names `base: main`; the auto-merge
  condition has the variable, the apply step and `!inputs.probe` and nothing that reads the outcome, and only the pull
  request step and a token-free warning read it). `actionlint` 1.7.12 on `core-update.yml`: no findings (shellcheck
  integration off, not installed).
- **Mutation check:** six breakages, each made at least one test fail: the `bump` job's refusal step removed, the
  `pull-request` job's refusal step removed, the `main` condition removed from the job's `if:`, the refusal's `exit 1`
  replaced with `true`, `ref: github.sha` removed from a checkout, and `steps.apply.outputs.outcome == 'success'` added
  back to the auto-merge condition. The workflow was restored byte for byte afterwards.
- **Checked, read-only:** `gh api repos/saulpatinojr/HCW-MigrateOrchestrator_AddOn/rules/branches/main` shows the active
  "Protect main" ruleset (id 25825144) with a `required_status_checks` rule for `build-test`, `codeql`, `secret-scan`,
  `e2e` and `dependency-review`, which covers what the `bump` job's compatibility check runs (unit tests, build, e2e).
  `peter-evans/create-pull-request` at the pinned commit throws "When the repository is checked out on a commit instead
  of a branch, the 'base' input must be supplied." without `base` (`src/create-pull-request.ts`), hence `base: main`.
- **Not executed:** the workflow on GitHub (neither a scheduled run nor a refused run from a branch); the value of the
  `CORE_AUTOMERGE` variable could not be read from this session.
- **Known limitation:** a manual run takes the workflow file itself from the branch it was started on, so a branch that
  also edits `core-update.yml` can delete these guards. Closing that needs the App key moved to an environment whose
  deployment branches are `main` only (a settings change, not made here).

## core-update in two jobs (2026-10-31)

What changed: `core-update.yml` now has a `bump` job, which installs the new upstream release and runs the tests and e2e
against it with no secret, and a `pull-request` job, which runs none of that code and only then mints the GitHub App
token. The second job rebuilds the bump with `scripts/core-update-pin.mjs` (from the checkout of `main`) and a
lock-only npm install, and refuses the first job's artifact unless its `package.json` and `package-lock.json` are
byte-identical. This repository records ADRs upstream with shared numbering, so this decision is recorded here and in
the pull request rather than under a new ADR number.

- **Environment:** Linux authoring sandbox, Node 22.23.4 (no Node 26 locally), npm 11.20.0 run from its registry tarball
  (sha256 `d1a92f40…a483`, which matches the registry's `sha512-dF3E…Ngw==`), the same npm that the `core-update` run of
  2026-10-27 used on Node 26.12.1 (run 40454829205, the one that opened pull request 54).
- **Executed:** `npm ci`; `npm test` — **114 pass, 0 fail**, including three new or rewritten files:
  `tests/security/core-update-app-token.test.mjs` (static checks of both jobs: no secret and a read-only token in
  `bump`; in `pull-request` no `npm`/`npx` command, `node` only for the pin script and the pinned npm, the lock command
  with every refusal flag, no package-manager cache, the same npm version and hash in both jobs, the token after the
  apply step); `tests/security/core-update-apply.test.mjs` (runs the workflow's own bump, collect and apply steps with a
  stand-in npm; 23 kinds of tampered artifact or regeneration, among them an extra dependency or an install script in
  `package.json`, a changed integrity or resolved URL in the lock, an extra file, a symbolic link and a bad or missing
  outcome, are each refused with the named error, nothing written to the step output and `git status` clean);
  `tests/security/core-update-pin.test.mjs` (the pin script on this repository's own files, hostile tags, and the lock
  check); `tests/security/core-update-tag-shape.test.mjs` unchanged and passing.
- **Mutation check:** 22 deliberate breakages of the workflow (for example `npm test`, `npm ci`, `npx` or the pinned
  npm's `ci` added to the `pull-request` job; `--ignore-scripts`, `--allow-git=none` or `--allow-remote=root` dropped;
  the package-manager cache turned back on; the byte comparison, the artifact listing, the outcome check, the tag check,
  the lock check or `git clean` removed; a token step placed before the apply step; a token given to the compatibility
  step; a different lock command in `bump`; the npm hash check made optional; auto-merge on the outcome alone) each
  made at least one test fail. The workflow was restored and compared byte for byte afterwards.
- **Dry run against a real release:** the tree as it was just before pull request 54 (`756dfb2^`, pinning `v0.4.0`) was
  bumped to `v0.4.1` with `scripts/core-update-pin.mjs` (its `package.json` equals `main`'s byte for byte) and re-locked
  with `npm-cli.js install --package-lock-only --ignore-scripts --allow-git=none --allow-remote=root --allow-file=none
  --allow-directory=root --no-audit --no-fund --no-update-notifier`, twice, in separate folders with separate npm caches.
  Both locks are byte-identical to each other and to `main`'s `package-lock.json` (the one the real workflow committed in
  pull request 54); npm left `package.json` untouched and created no `node_modules`. The two `v0.4.1` tarballs were
  downloaded again and their SHA-512 equals the lock's `integrity` entries (`sha512-hKnjvlbs…` core,
  `sha512-MQxLdcd2…` ui), so npm records the tarball's own hash. `check-lock` accepts `main`'s lock.
- **Experiment, the lock-only install runs no package code:** with the flags above, a dependency served from a local
  address with `preinstall`, `install`, `postinstall` and `prepare` scripts wrote none of their marker files and no
  `node_modules`; without `--ignore-scripts` the project's own `postinstall` ran (npm runs the root project's scripts
  even with `--package-lock-only`, `lib/commands/install.js`); a dependency that pulls a git dependency stopped with
  `EALLOWGIT` and one that pulls another URL with `EALLOWREMOTE`, before any fetch (npm's `pacote` checks these when
  it chooses a fetcher). `--allow-git=none` matters because preparing a git dependency runs `npm install` inside its
  clone (`pacote/lib/git.js`), which `--ignore-scripts` alone does not cover.
- **Checked:** `actionlint` 1.7.12 (release binary, checksum checked) on `core-update.yml`: no findings, with its
  shellcheck integration off because shellcheck is not installed here. The `upload-artifact` (v7.0.2) and
  `download-artifact` (v8.0.2) pins are the commits those tags point at (`git ls-remote`), the same pins the Cloud
  Assessor and NetworkEyes add-ons use; `setup-node` v7.1.0 has the `package-manager-cache` input (its `action.yml` at
  the pinned commit).
- **Not executed:** the two-job workflow on GitHub (it has not run yet, so it has not opened a bump pull request); the
  run on Node 26 (the dry run used Node 22 with the same npm); shellcheck and zizmor (installing them from PyPI was
  refused by this session's safety check); `npm run e2e` (nothing here touches the pane or the API).
- **Known limitation:** the two jobs ask the npm registry separately, minutes apart. If a new upstream release adds a
  dependency and the registry publishes a newer matching version between the two jobs, the locks differ and the
  `pull-request` job refuses; the run fails and a rerun fixes it. That is the safe direction.

## Pane model, 0.3.0 (2026-10-10)

- **Environment:** Linux authoring sandbox, Node 26.11.1 (a local `node@26` on PATH, never system-wide), npm 10.9.4, the sibling
  upstream at `APP_REF` v0.2.1 built and assembled; no Docker daemon.
- **Executed:** `npm run typecheck` (API project and the pane's `tsc -p apps/lab-web/tsconfig.json`); `npm test` — **23 pass,
  0 fail** (13 API tests including framing default vs configured, the flat health envelope, `x-addon-*` on JSON/static/error
  responses, rate limit 429 with `Retry-After` shared by the workspace route, overload 503 with `maxConcurrent: 0`,
  fail-closed verification 503 and the allow flag, start-up refusal without a site key, trust-proxy address selection,
  cache-control per path; 3 two-way OpenAPI contract tests; 4 edition-boundary tests; manifest; no-secrets); `npm run build`
  (API + pane, `apps/lab-web/dist`); **`npm run e2e` — 5 pass** on Chromium 153 (`npx playwright install chromium` succeeded
  here): the journey through the pane, the exact message sequence `loading → ready → working → ready` on a host page with
  the site's sandbox (four messages, none on re-render) plus delete through the sandbox, headers (`frame-ancestors` from env,
  no `x-frame-options`, `x-addon-*`), 403 without a verification token with the explorer's alert, no password inputs, no
  partner or vendor names; a smoke run of `apps/lab-api/dist/server.js` with `AMO_STATIC_DIR=apps/lab-web/dist
  AMO_ALLOW_NO_TURNSTILE=1 AMO_FRAME_ANCESTORS="'self' https://hybridcloudworks.com"`: health answers the flat envelope,
  `/` is `no-cache` with the configured `frame-ancestors` and no `x-frame-options`, `/assets/*` is immutable, the start-up
  warning names the allow flag; all workflow files parse; the `node:26-bookworm-slim` index digest was resolved from Docker
  Hub (`sha256:86f07bc9…`) and is the pin in `Dockerfile.lab` (marked [VERIFY] for the first production publish).
- **Review round 1 (Copilot, PR #4, 2026-10-10), same environment:** `npm run typecheck`; `npm test` — **26 pass, 0 fail**
  (the 23 above plus: the fail-closed 503 is answered before the body is read, with `connection: close`, and a 6 MB upload
  against it is cut or answered within the bound; a secret without a site key refuses to start even with the bypass flag;
  a stalled verification endpoint yields `403 siteverify-timeout` within the bound, holds one of the `maxConcurrent`
  slots so a second request gets `503 overloaded`, and a fetch that ignores the abort signal still times out — in
  `api.test.ts`; `config.test.ts` covers the environment mapping and the refusal of `0`, negative, fractional and
  non-numeric `AMO_RATE_LIMIT_POSTS`, `AMO_RATE_LIMIT_WINDOW_MINUTES`, `AMO_MAX_CONCURRENT` and TTL values; the contract test
  checks that every documented response carries the four AddOn header components); `npm run e2e` — **5 pass**;
  `docs/api/openapi.yaml` parses as YAML (PyYAML) with the shared `addon_headers` anchor resolving on all 26 responses.
- **Not executed locally (CI only):** `docker build` of `Dockerfile.lab` and the Trivy scan (no daemon); `publish-images.yml`
  against Docker Hub (the OIDC connection and the `DOCKERHUB_*` variables are owner steps); the website's `addons` role,
  Caddy route and status proxy (Phase 6, website repository); verification against the real siteverify endpoint.
- **Adopted with upstream v0.3.0** (2026-10-11): `partners={false}` replaces the CSS rule that hid the partner panel and
  `contactPath` + `onNavigate` replace the capture-phase click handler that turned the in-frame `/contact` link into a
  `navigate` request. **Still shims:** the pane derives `working`/`ready` from a `fetchImpl` wrapper around the explorer's
  POSTs rather than from `onStageChange` (one signal, already covered by e2e), and bypasses `window.confirm` when
  framed: the site's sandbox has no `allow-modals`, so the browser ignores the explorer's `confirm()` (`Ignored call to
  'confirm()'. The document is sandboxed, and the 'allow-modals' keyword is not set.`, observed in e2e) and "Delete my data
  now" would otherwise do nothing. The UI package should confirm deletion without a modal.
- **Known limitation:** `unavailable` cannot be posted when health itself fails, because the site origins come from health;
  the site's 30-second watchdog shows its own sentence, and the pane shows the same sentence in-frame.

## Flip to the downstream edition (2026-10-04)

- **Environment:** Windows 11, Node 26.5, npm 11.17, Docker Desktop 29.8 (CI targets Node 22 — this run is not evidence for Node 22).
- **Executed:** tree rebuilt from the post-split repositories with imports rewritten to the published packages; `.npmrc` `install-links=true` so the `file:` links are packed and installed like registry packages (their own dependencies included); `npm install` (new lockfile) and `npm ci` clean; `npm test` — **15 pass, 0 fail** (lab API, OpenAPI contract, manifest, no-secrets, rewritten `edition-boundary` against the installed core); harness `vite build` — chunk hashes identical to the pre-flip harness build; `docker build` of `Dockerfile.lab` from the two-tree context → nothing from the upstream tree at runtime, rules found inside `migration-core`, health 200, sample served, no `npm`, containerised Trivy (HIGH/CRITICAL, fixed only) exit 0; all 8 workflow files parse and every action is SHA-pinned; `terraform fmt -check` clean; PowerShell packaging 139 files, no leak.
- **Not executed locally:** Playwright e2e (CI job `e2e`; the first CI attempt failed because npm does not install a symlinked package's dependencies — fixed by `install-links`); `core-update.yml` end to end (no newer upstream release exists yet; trigger it manually with `workflow_dispatch` to rehearse).

## Node 26 runtime floor (2026-10-04, ADR-0029)

- **Executed (Node 26.5 locally):** `npm install` against the upstream packages declaring `engines.node >=26`; `npm test` — 15 pass; harness `vite build`; `docker build` of `Dockerfile.lab` on `node:26-bookworm-slim` → Node 26 at runtime, health 200, containerised Trivy (HIGH/CRITICAL, fixed only) exit 0; workflows parse with `setup-node 26`.
- **Not executed locally:** GitHub-hosted runners on Node 26 and the Playwright e2e (CI); the devcontainer image pull.

## Standing limitations

- Dependency contract (ADR-0030, 2026-10-11): the upstream packages are release tarballs pinned by URL and integrity hash.
  The pin and the lock move together through `core-update.yml`; a hand-edited URL without a re-lock fails `npm ci` on
  purpose. The pin moved `v0.3.0` to `v0.3.1`; both tags and their release assets exist and the lock carries the integrity
  entries. On 2026-10-24 the two `v0.3.1` tarballs were downloaded and their SHA-512 values equal the lock's entries (see
  `docs/whats-new-upstream.md`, which also lists what upstream changed since).
- `core-update` pull requests are opened with a GitHub App token (the HCW Main Admin App: its client ID is the repository variable
  `HCW_MAIN_ADMIN_CLIENT_ID`, its private key the repository secret `HCW_MAIN_ADMIN_PRIVATE_KEY`), not
  `GITHUB_TOKEN`, so the required checks (`ci`, `security`) run on the pull request itself; the `core-update` run linked in
  the PR body still gives the compatibility evidence (it decides the `compatible` / `needs-adaptation` label). The token step
  is covered by `tests/security/core-update-app-token.test.mjs` (static) and was linted with actionlint and zizmor in the
  earlier one-job layout, which opened the `v0.4.1` bump (pull request 54). The two-job layout of 2026-10-31 (section
  above) has not run on GitHub yet. To prove the credential without a release to adopt:
  `gh workflow run core-update.yml -R saulpatinojr/HCW-MigrateOrchestrator_AddOn --ref main -f probe=true`.
  The App key lives only as the repository secret `HCW_MAIN_ADMIN_PRIVATE_KEY` and is never printed. To rotate it,
  generate a new private key on the settings page of the App (https://github.com/settings/apps), replace the secret in every repository that holds the key (this one:
  https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/settings/secrets/actions; the App is installed on the four
  add-on repositories, so check the other three; HCW-CloudCrawler_App and HCW-CloudAssessor_App, where it is also
  installed since 2026-11-04, hold a separate key as Dependabot secrets and are rotated on their own), then delete the old key on the settings page of the App.
  The settings page can hold several keys, so a separate key per repository lets you revoke one without
  touching the others.
- Auto-merge of a bump (any bump since pull request 58; it then waits for the required checks) needs the repository
  setting "Allow auto-merge". It was off on 2026-10-26 (UTC), when
  the run that opened the first bump pull request ended with "Auto merge is not allowed for this repository". It has since been turned on (checked on 2026-10-26 UTC). If it is ever off again, `core-update` warns and leaves the pull request for a person to merge.
- Playwright e2e ran locally on 2026-10-10 (Chromium downloaded) and on GitHub-hosted runners; earlier sandboxes blocked the download.
- The standalone lab Terraform (`infrastructure/terraform/lab-hostinger`, `lab-cloudflare`), the tunnel edge notes
  (`infrastructure/reverse-proxy`) and `docs/deployment/vps.md` were retired on 2026-10-10 and deleted; `iac-validate`
  covers the Coder template only. ADR-0019 stays as the record of the retired edge.
- Human verification against the real siteverify endpoint, the website's `addons` role on the live host, Coder workspace
  creation against a live deployment and the workspace image build were not executed.
