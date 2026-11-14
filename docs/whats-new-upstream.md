# What's new upstream

The upstream product is [`HCW-MigrateOrchestrator_App`](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App). This
edition adopts its release tarballs (`@hybridcloudworks/migration-core` and `@hybridcloudworks/migration-ui`) and nothing else.

## How to use this file

Read it before you change behaviour, bump the upstream pin or review a `core-update` pull request: it says what changed
upstream, whether it reaches this edition, and what to run. Add an entry when a change lands upstream that reaches this
edition (the upstream `CLAUDE.md` asks for the same), newest first, and keep the table below true.

## Current upstream state (checked 2026-10-27)

| Question | Answer |
|---|---|
| Upstream `main` | `b9fc763` (merge of upstream pull request #100, the `v0.4.1` release preparation); it is the `v0.4.1` tag commit. Upstream pull request #101, which changes only documents and one Terraform comment (none of it in the tarballs), was open when this was written |
| Latest upstream release | `v0.4.1`, published 2026-10-27, tag commit `b9fc763` (annotated tag) |
| What this edition pins | `v0.4.1` (adopted by [pull request 54](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/54), merged 2026-10-27): `migration-core` and `migration-ui` as release tarballs, by URL in `package.json` and by integrity hash in `package-lock.json` |
| Drift between pin and latest release | None |
| Do the pinned hashes match the published assets? | Yes. The two `v0.4.1` tarballs were downloaded on 2026-10-27 and their SHA-512 values equal the `integrity` entries in `package-lock.json` (`sha512-hKnjvlbs…` for core, `sha512-MQxLdcd2…` for ui) |
| Unreleased upstream changes that touch the tarballs | None. Upstream `main` is the `v0.4.1` tag commit |
| Tags | Upstream has an active ruleset, "Protect release tags", on `v*` tags. It blocks creating, updating and deleting them except for a repository role that can bypass it (the owner's `v0.4.1` tag push reported "Bypassed rule violations"). Before 2026-10-24 the `v0.3.1` tag had been moved once; that release is no longer pinned. The `integrity` hashes in `package-lock.json` would catch a changed file under a pinned tag |

Dates in this file are in US Central time; GitHub shows UTC, so a release can appear a day later there.

How "nothing changed" was checked: `git diff v0.4.0 v0.4.1 -- packages rules scripts/assemble-packages.mjs` upstream lists
only the rule-diff report files `rules/reports/learn-diff.json` and `rules/reports/learn-diff.md`. The core tarball ships only
`rules/azure`, `rules/organization`, `rules/schemas` and `rules/snapshots` (`scripts/assemble-packages.mjs`), and none of those changed.
The extracted `v0.4.0` and `v0.4.1` tarballs differ only in the `version` of both `package.json` files and, in `migration-ui`, the exact `migration-core` version it depends on (107 files in core and 30 in ui, in both releases). Upstream CI on `main` at `b9fc763` passed (the `ci`, `security` and `scanners` runs).

## Entries (newest first)

### 2026-11-14: the workflow runtime check is refreshed to the website's round three (a shared test, not an upstream release)

- `tests/security/workflow-runtime-setup.test.mjs`, the test that fails a workflow step that runs Node.js or Python
  before its job has chosen the version, is shared with the upstream App. Both copies come from the website's
  `scripts/workflow-runtime-setup.test.mjs`, which changed a third time in
  [HCW-HybridCloudWorks#1722](https://github.com/saulpatinojr/HCW-HybridCloudWorks/pull/1722); the line reader both
  copies use comes from the Python copies' third round
  ([HCW-NetworkEyes_App#399](https://github.com/saulpatinojr/HCW-NetworkEyes_App/pull/399)). This edition's copy was
  brought up to that round in its own pull request, and the App (`HCW-MigrateOrchestrator_App`) gets the same change in
  its own pull request: the logic, the reader and the test cases are the same in both, and only the lists of allowed
  exceptions and each repository's own tests differ.
- **Reaches this edition? Yes, as a test only.** No package, pin, lab behaviour or workflow changes; every workflow here
  passes the stricter check as it is. See the `CHANGELOG.md` entry for what the check now catches.
- Copilot's review of these pull requests found six more ways past the check, and a review of those fixes one more (a
  `sudo` inside a script `sudo` runs, a PATH replaced or removed for one command, the runner's interpreter named
  directly, one-line `case` clauses, `${{ matrix.* }}` in the workflow-level `env:`, pipx under a step's `shell:`, and
  free-threaded Python names such as `python3.14t`); the website fixed them first, and both copies carry the fixes in
  their own pull requests, the line reader's part included.
- **Action here:** done in that pull request. When either copy changes again, change the other the same way: keep the
  logic identical to the website's and keep only the lists different.

### 2026-11-13: the workflow runtime check is refreshed to the website's round two (a shared test, not an upstream release)

- `tests/security/workflow-runtime-setup.test.mjs`, the test that fails a workflow step that runs Node.js or Python
  before its job has chosen the version, is shared with the upstream App. Both copies come from the website's
  `scripts/workflow-runtime-setup.test.mjs`, which changed a second time in
  [HCW-HybridCloudWorks#1719](https://github.com/saulpatinojr/HCW-HybridCloudWorks/pull/1719). This edition's copy was
  brought up to that round in its own pull request, and the App (`HCW-MigrateOrchestrator_App`) gets the same change in
  its own pull request: the logic and the test cases are the same in both, and only the lists of allowed exceptions
  differ (the App's names its `release-cli.yml` build step and reads its composite action, `self-merging-pr`).
- **Reaches this edition? Yes, as a test only.** No package, pin, lab behaviour or workflow changes; every workflow here
  passes the stricter check as it is. See the `CHANGELOG.md` entry for what the check now catches.
- **Action here:** done in that pull request. When either copy changes again, change the other the same way: keep the
  logic identical to the website's and keep only the lists different.

### 2026-11-05: the HCW Main Admin App is also used by two App repositories (credential notes only)

- On 2026-11-04 the lockfile workflow in two other App repositories, `HCW-CloudCrawler_App` and `HCW-CloudAssessor_App` (not this edition's
  upstream) were changed to push Dependabot's regenerated
  lockfile exports with the HCW Main Admin GitHub App, the App this repository's `core-update.yml` uses ([HCW-CloudCrawler_App#71](https://github.com/saulpatinojr/HCW-CloudCrawler_App/pull/71), [HCW-CloudAssessor_App#87](https://github.com/saulpatinojr/HCW-CloudAssessor_App/pull/87); owner decision on [HCW-CloudCrawler_App#70](https://github.com/saulpatinojr/HCW-CloudCrawler_App/issues/70)). Once the owner installs it there, the App is on six repositories, not four.
- **Reaches this edition? Only the notes.** No engine, pin, workflow behaviour or test changes here. Those two
  repositories hold a separate private key as Dependabot secrets, so rotating this repository's key is unchanged. The
  `core-update.yml` comment and `VALIDATION.md` now say where the App is installed.

### 2026-10-27: upstream release `v0.4.1` (the appliance is fixed; the tarballs' contents do not change)

- Upstream release [`v0.4.1`](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/releases/tag/v0.4.1) fixes the **appliance** API, which in `v0.4.0` cannot start against an Azure database (the database library discarded the sign-in token provider), and the appliance's Terraform. Pull requests [98](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/98) (Terraform names and the zone setting) and [99](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/99) (the API's database connection). Pull request [100](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/100) raises the version and adds one more API fix (a repeated option in `DATABASE_URL` is refused). Also in this range, none of it reaching this edition: [95](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/95) (the image-publish workflow), [96](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/96) (a rules report) and [97](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/97) (a Terraform database-subnet setting).
- **Reaches this edition? Only version numbers.** The appliance API (`apps/appliance-api`) and the Terraform are not in the two tarballs, and this edition cannot construct an Azure credential. The extracted `v0.4.0` and `v0.4.1` tarballs differ in nothing but the `version` in both tarballs' `package.json` and, in `migration-ui`, the exact version of `migration-core` it depends on (107 files in core and 30 in ui, in both releases); the file names carry the version too.
- **Action here:** done. The `core-update` [pull request 54](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/54) moved both pins from `v0.4.0` to `v0.4.1` and merged after its required checks passed. The downloaded tarballs' hashes were compared with the lock file (see the table).

### 2026-10-25: upstream release `v0.4.0` (adopted here on 2026-10-26; this entry was added late, on 2026-10-27)

- Upstream release [`v0.4.0`](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/releases/tag/v0.4.0), tagged 2026-10-25. Upstream commits since `v0.3.1` in `packages/`, `rules/` or the assembly script (from `git log v0.3.1..v0.4.0 -- packages rules scripts/assemble-packages.mjs`), split by whether they reach the two tarballs. **They do:** log redaction (JWTs and PEM private keys are hidden, upstream pull request [81](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/81); values are redacted by structure, pull request [90](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/90), a wider security hardening change), the per-cell length cap and the expression and escaping fixes ([88](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/88)), the UI dependency ranges (Radix UI and react-dom, pull requests [29](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/29), [33](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/33), [37](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/37) and [38](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/38)) and the new repository address that the assembly script writes into the tarballs' `package.json` ([68](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/68)). **They do not:** the Entra `nbf` check ([67](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/67)), more refused credential variables ([64](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/64)) and a comment that follows this edition's new name ([70](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/70)), which are in `azure-auth` and `azure-arm`, two packages that are never published (`NEVER_PUBLISHED` in `scripts/assemble-packages.mjs`).
- **Reaches this edition? Yes.** The two behaviours announced in the next two entries (redaction of tokens and private keys in logs; the 65,536-character cell limit and the expression fixes) arrived with this release. It was adopted by [pull request 49](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/49), merged on 2026-10-26 after its `ci` run passed.
- **Action here:** none now. This entry only closes the follow-up the next two entries asked for ("add that release to this file").

### 2026-10-25: the next core release limits one CSV cell to 65,536 characters and fixes slow expressions (upstream pull request 88)

- **Update 2026-10-27:** this arrived with upstream `v0.4.0` (adopted by [pull request 49](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/49) on 2026-10-26); see the `v0.4.0` entry above.
- Upstream [pull request 88](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/88) (ticket [77](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/77)) changes three published modules. (1) `csv-ingestion`: `ingestResourcesCsv()` now skips a row that has a cell longer than 65,536 characters, with a warning that names the row and column, and refuses a file whose header cell is that long. Until now the only limits were the whole upload (5 MB) and the row count (5,000), so one cell could be 5 MB. (2) `terraform-generator`: the function that turns a resource name into a Terraform identifier no longer has a regular expression that a long run of underscores could make very slow. (3) `report-engine`: a backslash in a name or note is now doubled in the Markdown reports so it cannot cancel the escape of a `|` and split a table row.
- **Reaches this edition? Yes; it arrived with `v0.4.0`.** (Written while `v0.3.1` was pinned, which still has the old behaviour.) This edition's upload path (`apps/lab-api/src/app.ts`) passes only `maxRows` and `maxBytes`, so it gets the new cell limit as the default without a code change. The limits this edition must never weaken (5 MB, 5,000 rows) are untouched. Visible effect for a visitor: a CSV with a 65,537-character cell loses that one row and sees the warning; a normal export is not affected (the longest real value, the tags cell, is about 40,000 characters at most).
- **Action here (as written on 2026-10-25; done, see the update above):** none now. When the `core-update` pull request for the release that carries it arrives, run `npm ci`, `npm test` and `npm run e2e`, and add that release to this file.

### 2026-10-25: the next core release hides sign-in tokens and private keys in logs (upstream pull request 81)

- **Update 2026-10-27:** this arrived with upstream `v0.4.0` (adopted by [pull request 49](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/49) on 2026-10-26); see the `v0.4.0` entry above.
- Upstream [pull request 81](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/81) fixes `redact()` in `@hybridcloudworks/migration-core/observability`, the function that hides secrets before a log line is written. Before, a JWT (a sign-in token that starts `eyJ`) and a PEM private key block were not hidden: the old code kept everything before the first `=` or `:` of the match, and those two have neither, so the token or key stayed in the log with `=[REDACTED]` added after it. Now both are replaced whole with `[REDACTED]`, values such as `password=...` still keep their key name, and the patterns cannot be slowed down by a very long line. The ticket is [upstream issue 77](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/77).
- **Reaches this edition? Yes; it arrived with `v0.4.0`.** (Written while `v0.3.1` was pinned, which still has the old function.) The lab API builds its logger with `createLogger` from that module (`apps/lab-api/src/app.ts`), and `createLogger` runs every message and every text attribute through `redact()`. This edition's own log lines carry request ids, counts and error messages, never a request body or a CSV row, so no leak is known here; the change closes the gap for any token or key that does reach a message (an error message, for example).
- **Action here (as written on 2026-10-25; done, see the update above):** none now. When the `core-update` pull request for the release that carries it arrives, run `npm ci`, `npm test` and `npm run e2e`, and add that release to this file. Nothing in this edition's code needs to change.

### 2026-10-25: this edition's lab image was renamed (now `img-mo-lab-addon`)

- The lab image is now `docker.io/hybridcloudworks/img-mo-lab-addon` (owner naming convention `img-<short name>-<job>-<type>`), and its tag is the full release tag (`v0.3.1`, not `0.3.1`). The container name on the lab host is unchanged.
- **Reaches this edition? Only the image name.** The release tarball pins, hashes and the `core-update` workflow are unchanged. The Docker OIDC connection must allow this repository to push to the new Docker Hub repository before the next `v*` tag; see `CHANGELOG.md` and `docs/deployment/lab-host.md`.

### 2026-10-24: the upstream repository was renamed (now `HCW-MigrateOrchestrator_App`)

- The upstream product `saulpatinojr/HCW-AzMigrateOrchestrator_App` is now `saulpatinojr/HCW-MigrateOrchestrator_App`
  (upstream pull request [68](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/68) updates its own references).
  GitHub redirects the old address, including release downloads, so nothing broke at the moment of the rename.
- **Reaches this edition? Yes, and it is a change here.** `package.json` and `package-lock.json` now name the new address in the two
  `v0.3.1` tarball URLs. The release tag is the same and the `integrity` hashes were not touched, because the files are the
  same files; only the address in front of them changed. `core-update.yml` now looks for releases at the new name
  (`UPSTREAM`); the way it reads the pinned tag and rewrites it does not depend on the repository name. The rest are links
  and descriptions in the documents.
- This edition was renamed on 2026-10-24 from `HCW-AzMigrateOrchestrator_Addon` to `HCW-MigrateOrchestrator_AddOn`, to match the upstream App and the other add-ons. GitHub redirects the old address.
- Left as written on purpose: the older changelog entry that records what happened at the time, and the ADR copies, which say
  where they were copied from.
- From upstream `v0.4.0` on (update 2026-10-27), the tarballs' `package.json` files name the new repository address (the upstream assembly script was updated).
  That is metadata only. Nothing to run beyond the usual `core-update` check.
- The old address keeps redirecting only while nobody creates a repository with the old name. Do not reuse it.

### 2026-10-24: documentation, repository protection and CI upstream

| Upstream change | Reaches this edition? | Action here |
|---|---|---|
| [#62](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/62): README, plan, validation record and manifest label brought up to date; adds the rule that asks for entries in this file | No code. Docs only | None. This file exists because of it |
| [#61](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/61): `appliance-image` is a required check on upstream `main` | No. It guards the appliance image, which this edition does not build or ship | None |
| [#60](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/60): the appliance's Terraform `image_ref` has no `:latest` default and must be an exact `@sha256:` digest | **No.** The Terraform root `infrastructure/terraform/appliance-azure` is upstream-only. This edition deploys its own image, `docker.io/hybridcloudworks/img-mo-lab-addon`, by digest through the website's `addons` Ansible role (`docs/deployment/lab-host.md`), and that path is unchanged | None |
| [#59](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/59): pull requests upstream now build, lint (hadolint), scan (Trivy) and start the appliance image | No. Same reason as #61 | None |
| [#58](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/58): documentation drift after the repository split fixed upstream; the ledger and matrix now mark `apps/lab-api`, `apps/lab-web`, `apps/ui-harness`, `docs/demo/*` and `infrastructure/coder` as owned by this edition | Docs only; confirms what this edition owns | None |
| [#57](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/57): a manual administration workflow applies upstream rulesets for `main` and for `v*` tags | **Yes, in effect.** Release tags upstream can no longer be deleted, updated or created by anyone without the ruleset's bypass role (see the Tags row), so the release URLs and integrity hashes pinned here stay valid | Keep pinning by exact tag. Never point the pin at `main` or at a tag that is not a published release |
| [#41](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/41) and [#56](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/56): plain-language rules for talking to the owner in upstream `CLAUDE.md` | No | None |

Published but not changed: the appliance image upstream was **not** published for `v0.3.0` or `v0.3.1` (the `publish-images`
job is skipped while `DOCKERHUB_ENABLED` is not set; upstream ticket [#42](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/42)).
That affects only the enterprise appliance. This edition's own image publishes from this repository.

### 2026-10-18 and 2026-10-19: dependency updates upstream (merged Dependabot pull requests)

| Upstream change | Reaches this edition? | Action here |
|---|---|---|
| [#29](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/29) and [#38](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/38) `@radix-ui/react-dialog` to 1.3.1, [#33](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/33) `@radix-ui/react-tabs` to ^1.2.1, [#37](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/37) `react-dom` to 19.3.1 | **Yes; arrived with upstream `v0.4.0` (update 2026-10-27).** `packages/ui/package.json` now declares `@radix-ui/react-dialog` ^1.3.1, `@radix-ui/react-tabs` ^1.2.1 and a `react-dom` peer of ^19.3.1 (they were ^1.1.6, ^1.1.3 and ^19.0.0 in `v0.3.1`). This edition's lock held dialog 1.1.23 and tabs 1.1.21 before the `v0.4.0` re-lock; it now holds dialog 1.3.1 and tabs 1.2.1. Its `react-dom` is already 19.3.1, which satisfies the new peer | Done when [pull request 49](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/49) adopted `v0.4.0` (2026-10-26). The two places the explorer uses them are the decision-detail dialog (`DecisionDetail`) and the generated-files tabs (`GeneratedFiles`) |
| [#36](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/36) `@azure/msal-browser`, [#35](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/35) dev group, GitHub Actions updates ([#26](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/26), [#27](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/27), [#28](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/28), [#31](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/31), [#40](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/40)) | No. Appliance web app, upstream dev tooling and upstream workflows only | None |
| [#34](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/34): a refreshed Microsoft Learn move-support diff report | No. It is a report under `rules/reports/`, outside the shipped rule corpus; the rules and snapshot (35 rules, 1.0.35) are unchanged | None |

### 2026-10-11: build tooling upstream

| Upstream change | Reaches this edition? | Action here |
|---|---|---|
| [#23](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/23): upstream builds with TypeScript 7, Vite 8 and `@vitejs/plugin-react` 6 | **Yes; arrived with upstream `v0.4.0` (update 2026-10-27).** The published `dist/` and type declarations are compiled by the release workflow, and the upstream root `package.json` moved from TypeScript ^5.6.3 (`v0.3.1`) to ^7.0.2 (`v0.4.0`). `v0.3.1` was built before this change | Done when [pull request 49](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/49) adopted `v0.4.0` (2026-10-26). This edition's code consumes the published `.d.ts` files, so `npm run typecheck` is the check that matters here |
| [#24](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/24) and [#25](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/25): upstream workflow credentials and README | No | None |

### 2026-10-11: release `v0.3.1` (adopted here then; since replaced by `v0.4.0` and `v0.4.1`)

`v0.3.1`: the questionnaire keeps focus, destination region is a select, and portal exports without a RESOURCE ID column derive ids from RESOURCE LINK
(upstream `CHANGELOG.md`, section 0.3.1). This edition adopted it (`package.json` pin and `package-lock.json` integrity at the time).

## Upstream decisions that affected this edition (all closed as of 2026-10-27)

All five are closed upstream (#42 on 2026-10-26, #44, #46 and #52 on 2026-10-25, #53 on 2026-10-26; UTC dates from the tickets). None of them blocked this edition.

| Upstream ticket | What it decides | Why it matters here |
|---|---|---|
| [#42](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/42) | Whether and when the enterprise appliance image is published to Docker Hub | None for the pane. Closed: the appliance image is published from a `v*` tag; `v0.4.0` and `v0.4.1` have one, `v0.3.x` has none |
| [#52](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/52) | Release hygiene: per-job permissions, one job creating the release, an SBOM, a post-release check of the tarballs | Closed. The tag half is done (see #57 above). Two SBOM files (`amo-cli-<version>.cdx.json` and `hybridcloudworks-migration-packages-<version>.cdx.json`) are now published next to the tarballs on `v0.4.0` and `v0.4.1`; the URLs this edition pins did not change |
| [#44](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/44) | Whether the appliance API gets an origin allow-list or is documented as same-origin only | None. This edition has its own exact-origin CORS and must not copy any wildcard |
| [#46](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/46) | Role model for the appliance's Entra sign-in | None. This edition has no sign-in by design |
| [#53](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/issues/53) | Appliance Terraform hardening (subnet firewalls, backup, private endpoint) | None. Upstream infrastructure only |

## Known documentation errors outside this repository

- The GitHub Release notes for this edition's `v0.3.1` say it adopts "`@amo/migration-core` and `@amo/report-templates`". The
  packages are `@hybridcloudworks/migration-core` and `@hybridcloudworks/migration-ui`. Release notes are published text, so this
  was not edited; an owner can correct it on the [release page](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/releases/tag/v0.3.1).
