# VALIDATION.md

Web-front edition (`saulpatinojr/HCW-MigrateOrchestrator_AddOn`, ADR-0028). Everything below distinguishes what was executed
from what was not. Engine, rule and UI validation lives upstream in `saulpatinojr/HCW-MigrateOrchestrator_App/VALIDATION.md`.

## The sample export on the HCW naming convention (2026-11-14, owner decision)

What changed: `samples/resources-csv/sample-resources.csv` (names and the subscription id only; byte for byte the App's
copy in [HCW-MigrateOrchestrator_App#126](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_App/pull/126)), `apps/lab-api/src/api.test.ts` (the stats privacy check looks for the new id and any
`hcw-sample`/`hcwsample` name instead of `vm-billing-01`), `tests/e2e/lab.spec.ts` (the storage account row is clicked by
`hcwsamplestbilling`), and the notes in `CHANGELOG.md` and `docs/whats-new-upstream.md`.

- **Executed (Linux sandbox, Node 26.13.1):** `npm ci`; `npm test` — 262 passed, 0 failed; `npm run e2e` (build, then
  `npx playwright test`) — **5 passed** on Chromium headless shell 156 (`npx playwright install chromium` fetched the
  browser first); `npm run typecheck` — passed.
- **Not executed:** the workflows themselves on GitHub (they run on the pull request); actionlint, zizmor and hadolint
  (no workflow or Dockerfile changed).

## The workflow runtime check is brought up to the website's round five, the last planned round (2026-11-14, HCW-HybridCloudWorks#1707)

What changed: `tests/security/workflow-runtime-setup.test.mjs` only. Its checking logic and test cases are copied
unchanged from the website's `scripts/workflow-runtime-setup.test.mjs` as merged in
[HCW-HybridCloudWorks#1726](https://github.com/saulpatinojr/HCW-HybridCloudWorks/pull/1726) (`5a7e7f4a`; single quotes
written as double quotes, `expect` written as `assert`): `ownShell` in `givenShell` and `shellChoices`, five new tests,
and the header's round-five paragraph, the owner's stop rule and the relabelled known-limits list. This copy's own parts
(the lists, the floors, the line reader, the paths) do not change: its `stepKeys` already reads a null, empty or
comment-only step `shell:` as '', and its reader already gives a job with a null `defaults.run.shell` the workflow's. No
workflow changed. ([HCW-HybridCloudWorks#1707](https://github.com/saulpatinojr/HCW-HybridCloudWorks/issues/1707))

- **Environment:** Linux cloud session, Node 26.13.1, from `main` at `a0ec540`.
- **Executed:** `npm ci`; `npm test` — **262 pass, 0 fail**, 105 of them in this file (100 before). Parsed with acorn and compared declaration by declaration with the website's merged copy (quote style ignored, `expect` read as `assert`): `ownShell`, `givenShell` and the round-five tests are identical, and the declarations that differ are the same 30 as before this change. Equivalence with the website's copy (read with its `yaml` library): the same answer on all 94,952 generated cases of round five and the rounds before it, made-up workflows run through each copy's own reader included: 0 disagreements (10,000 before this change). On the 386 workflow and composite-action files of every HCW clone and worktree in this session, the findings are the same as the website's copy's, file by file.
- **Not executed:** the `build-test` job on GitHub (the pull request's own run is the check); actionlint, zizmor and hadolint (no workflow or Dockerfile changed); `npm run e2e` and `npm run typecheck` (nothing here touches the pane, the API or typed code).

## The workflow runtime check gives a job with an empty shell the workflow's (2026-11-14, HCW-HybridCloudWorks#1707)

What changed: `tests/security/workflow-runtime-setup.test.mjs` only, in this copy's own parts. An independent review
after [#79](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/79) found that a job whose
`defaults: run: shell:` is null (`shell:`, `~`, `null`) under a workflow-level `defaults.run.shell` got the shell `""`
and `jobShell: true`, where the website's copy (`job.defaults.run.shell ?? defaults.run.shell`) falls back to the
workflow's shell. The line reader's `plain`, `scalar`, `flowMapping` and `mappingAt` now take an optional `nullAs`
(default `""`, so every other caller reads values exactly as before); `defaultShell` passes `null`, so a YAML null
(`shell:`, `~`, `null`, `Null`, `NULL`, a comment only), block or one-line, falls back to the workflow's shell, while a
quoted `''` or `""` stays the job's own empty shell (the runner's default), as the website's `??` keeps it (Copilot on
[#80](https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn/pull/80)). `scalar` also reads a value that is only a
comment (`shell: # x`) as null, as YAML does; before, it read the comment text as the value. One new test of this copy's
own. ([HCW-HybridCloudWorks#1707](https://github.com/saulpatinojr/HCW-HybridCloudWorks/issues/1707))

- **Environment:** Linux cloud session, Node 26.13.1.
- **Executed:** the new test fails on `main` (`jobShell` true for `shell:` under `sudo python3 {0}`) and on the pull
  request's first commit (`ab69a8b`, `jobShell` false for `shell: ''`), and passes with the change; `npm ci`;
  `npm test` — **257 pass, 0 fail**; `npm run typecheck` passes. Against the website's merged copy (`95b2aac5`, vitest
  taken out, read with its `yaml` library) on 51 made-up workflows: `main` gave a different answer on 15 (the null
  job shells, where it reported nothing), the first commit on 7 (the quoted empty ones), and this change on none; one
  form both copies refuse (a plain `${{ }}` inside a one-line mapping) is refused by both, with different messages. On
  the workflows and composite actions of every HCW clone and worktree in this session (25 folders, 233 files), the
  reader's output and the findings are identical before and after the change.
- **Not executed:** the `build-test` job on GitHub (the pull request's own run is the check); actionlint, zizmor and
  hadolint (no workflow or Dockerfile changed); `npm run e2e` (nothing here touches the pane or the API).

## The workflow runtime check is brought up to the website's round four (2026-11-14, HCW-HybridCloudWorks#1707)

What changed: `tests/security/workflow-runtime-setup.test.mjs` only. Its checking logic and test cases are copied
unchanged from the website's `scripts/workflow-runtime-setup.test.mjs` as merged in
[HCW-HybridCloudWorks#1725](https://github.com/saulpatinojr/HCW-HybridCloudWorks/pull/1725) (`95b2aac5`; single quotes written as double quotes, `expect` written as `assert`, `REPO` as `ROOT`).
This copy's own parts change in three places. The written-in Python floor moves from 3.15.0 to 3.15.2, and one of
its own tests changes its expected answer with it, as its Python twin did (`3.15.0` is now below the floor). The
line reader `readJobs`, which folds the workflow's `defaults.run.shell` into each job, now keeps whether a job's
shell is its own (`jobShell`, the Python copies' `job_shell` from
[HCW-NetworkEyes_App#403](https://github.com/saulpatinojr/HCW-NetworkEyes_App/pull/403)), and `shellChoices` reads it: the website's YAML library keeps the
two levels apart, so its `shellChoices` tells them apart without it, and GitHub fills a `${{ matrix.X }}` in only in
a job's own default. One new test of this copy's own checks that flag. No workflow changed.
([HCW-HybridCloudWorks#1707](https://github.com/saulpatinojr/HCW-HybridCloudWorks/issues/1707))

- **Environment:** Linux cloud session, Node 26.13.1.
- **Executed:** `npm ci`; `npm test` — **256 pass, 0 fail**, 99 of them in this file (89 before). Every function
  the change touches is the website's line for line (double quotes aside), except the one `jobShell` clause in
  `shellChoices`. Equivalence with the website's merged copy (`95b2aac5`, vitest taken out, read with its `yaml`
  library): the same answer on all 60,632 generated cases of round four and its review rounds, made-up workflows run
  through each copy's reader included: 0 disagreements. On the workflows of every HCW clone in this session
  (23 folders), the findings are the same as the website's copy's and the same as this copy's before round four.
  A workflow-level `defaults.run.shell` of `${{ matrix.shell }}` over a job whose matrix lists `shell: [bash]` is
  reported for Node.js and Python by the website's copy, the canonical Python copy and this one; with the
  `jobShell` clause taken out, this copy reported nothing for it.
- **Not executed:** the `build-test` job on GitHub (the pull request's own run is the check); actionlint, zizmor and
  hadolint (no workflow or Dockerfile changed); `npm run e2e` (nothing here touches the pane or the API).

## The workflow runtime check is brought up to the website's round three (2026-11-14, HCW-HybridCloudWorks#1707)

What changed: `tests/security/workflow-runtime-setup.test.mjs` only. Its checking logic and test cases are copied
unchanged from the website's `scripts/workflow-runtime-setup.test.mjs` as merged in
[HCW-HybridCloudWorks#1722](https://github.com/saulpatinojr/HCW-HybridCloudWorks/pull/1722) (`4be949fb`; single quotes
written as double quotes, `expect` written as `assert`). The line reader is ported again from the Python copies' round
three ([HCW-NetworkEyes_App#399](https://github.com/saulpatinojr/HCW-NetworkEyes_App/pull/399), `9b963961`): quoted
values decoded, comments dropped outside quotes, plain numbers in their shortest form, block values ended as YAML ends
them, `-   run:` steps, the step's and the default `shell:`, and the same refusals as the website's `readWorkflow`. This
repository's own parts stay: the written-in floors, the floor check on every workflow, its own tests and the lists, all
empty. One of its own tests changed its expected answer, as its Python twin did (a job-level `${{ env.OLD }}` is not
worked out by GitHub, so that set-up step's version is unreadable). No workflow changed.
([HCW-HybridCloudWorks#1707](https://github.com/saulpatinojr/HCW-HybridCloudWorks/issues/1707))

- **Environment:** Linux cloud session, Node 26.13.1 and npm 11.20.0.
- **Executed:** `npm ci`; `npm test` — **232 pass, 0 fail**, 75 of them in this file (at this pull request's first push;
  after the fixes below, 246 passed and 89 in this file). Equivalence with the website's
  merged copy (from its `origin/main`, vitest taken out, read with its `yaml` library): the same answer on every input of
  the 12,975, 348 and 66,583 case sets used for round three (72,356 distinct inputs, including 116 whole workflows run
  through each copy's reader), on 886 more recorded from the website's and this file's tests, and on all 100 workflow
  and composite-action files of the nine HCW repositories: 0 disagreements. Against the copy on `main`, no file of any
  of the nine repositories gains or loses a finding. The reader was also compared value by value with the `yaml`
  library on those 100 files (221 jobs, 1,360 steps): every value the check reads is the same, apart from the final
  line break of a block `run:` (which the check never reads), a matrix made of mappings and one matrix list given as
  a `${{ }}` expression (read as no entries by both).
- **Not executed:** the `build-test` job on GitHub (the pull request's own run is the check); actionlint, zizmor and
  hadolint (no workflow or Dockerfile changed); `npm run e2e` (nothing here touches the pane or the API).
- **Known:** CodeQL (in `security.yml`) may flag the test input `'sudo env PATH="${PATH}" python3 x'` as a template
  string written in an ordinary string, because this file defines a `PATH` constant. The `${PATH}` is shell text the
  test feeds to the check on purpose, so the line stays as it is; it was flagged the same way on the website.
- **After Copilot's review of the round-3 pull requests, a review of those fixes and Copilot's second round
  (2026-11-14):** the fixes the website made first (`9281f4e8` for a `sudo` inside a script `sudo` runs, `e5ac25e6` for
  five more, `ab74c787` for `env -u PATH`, `command -p` and free-threaded names, with a faster reading of long one-line
  `case` lines, `c2fdfc0d` and `1e85a206` for the second round; all merged in
  [HCW-HybridCloudWorks#1723](https://github.com/saulpatinojr/HCW-HybridCloudWorks/pull/1723)) are copied in. This
  copy's line reader `readJobs` applies the workflow-level rule (`workflowLevel`) where it folds the workflow's `env:`
  into each job's, and reads a one-line mapping by the Python copies' rules (`flowEnd`, `flowMapping`; it used to cut
  `defaults: {run: {shell: "python {0}"}}` at its first `}`). `npm test` — 246 passed, 0 failed, 89 of them in
  `tests/security/workflow-runtime-setup.test.mjs`; the new tests and changed cases, each added to the file as it was
  before them, fail 8 of 83 for the first six fixes, 4 of 86 for the review's (its longer timing test among them) and 6
  of 89 for Copilot's second round. Every function the change touches is the website's line for line (double quotes
  aside). The same answers as the website's copy on the 49,200 generated cases of these changes, the 4,844 nested-sudo
  cases and the 348 inputs of the round-three review: 0 disagreements, for this copy and the App's; of the 348, one
  answer moved with the pre-PR review's fix and moved back with Copilot's second round (`pipx run --python python3.15t
  x` is reported again). Before the reader change, this copy disagreed with the website on 11 of the 49,200 cases, every
  one a one-line `defaults:`; with the `readJobs` line for the workflow level taken out, 72 of the 19,584 generated
  cases of the first six fixes disagree. On the workflows of all nine HCW repositories the findings are the same before
  and after, and the same as the website's copy's.

## The workflow runtime check is brought up to the website's round two (2026-11-13, HCW-HybridCloudWorks#1707)

What changed: `tests/security/workflow-runtime-setup.test.mjs` only. Its checking logic and test cases are copied
unchanged from the website's `scripts/workflow-runtime-setup.test.mjs` as merged in HCW-HybridCloudWorks#1719 (single
quotes written as double quotes, `expect` written as `assert`). This repository's own parts stay: the written-in floors,
the line reader (now reading YAML null, block text with an indentation number, folded text and a block ending at a
comment line as YAML does, and refusing one-line steps), the floor check on every workflow, and the lists, all empty,
with the new `BELOW_FLOOR_ALLOWED`. No workflow changed.

- **Environment:** Linux cloud session, Node 26.13.1 (downloaded from nodejs.org, its sha256 matched `SHASUMS256.txt`)
  and npm 11.20.0.
- **Executed:** `npm ci`; `npm test` — **206 pass, 0 fail**, 49 of them in this file. Equivalence: the website's copy
  (from its `origin/main`, vitest and the tests taken out) and this port gave the same answer on 66,845 cases (the
  round-two case set plus every call the website's and both MigrateOrchestrator test files make) and on the 103 workflow
  and composite-action files of the nine HCW repositories and a folder of made-up workflows: 0 disagreements. On this
  repository's workflows the new copy reports nothing the copy on `main` did not. The reader was compared with the
  `yaml` library on the same 103 files (224 jobs, 1,361 steps): every value the check reads is the same, apart from a
  trailing YAML comment kept on five one-line `run:` values (the shell drops it too) and one matrix made of mappings,
  which the check never reads as a version. In a scratch copy, the reader without its comment-line rule failed the test
  written for it.
- **Not executed:** the `build-test` job on GitHub (the pull request's own run is the check); actionlint, zizmor and
  hadolint (no workflow or Dockerfile changed); `npm run e2e` (nothing here touches the pane or the API).
- **After review (2026-11-13):** the fixes for pipx's GitHub expressions, `pythonLocation`, resolved paths and `(a || b)
  && c` conditions, from the canonical Python copy (HCW-NetworkEyes_App commit `8ac31182`), were applied here and in the
  website's copy. `npm ci`; `npm test` — 211 passed, 0 failed, 54 of them in
  `tests/security/workflow-runtime-setup.test.mjs`. This copy, the website's and the Python copy gave the same answer on
  67,044 cases and on the 104 workflow and composite-action files of the nine HCW repositories and two folders of
  made-up workflows: 0 disagreements. On the real repositories nothing new is reported compared with `main`.
- **Limitation, on purpose:** the line reader refuses steps written on one line (`steps: [{...}]`, `- {...}`), which
  the website's YAML library reads; such a file fails the test rather than being read as having no steps.

## The workflow runtime check is ported from the website's finished copy (2026-11-13, HCW-HybridCloudWorks#1707)

What changed: `tests/security/workflow-runtime-setup.test.mjs` only. Its checking logic is copied unchanged from the
website's `scripts/workflow-runtime-setup.test.mjs` (merged as HCW-HybridCloudWorks#1716 at `ff5cbc29`), plus the empty
`PIPX_DEFAULT_PYTHON` fix the NetworkEyes App made after review (its commit `5a19ed0`), which the website is getting in
a follow-up. This repository's own parts stay: the written-in floors, the line reader, the set-up version checks, and the
empty `RUNNER_DEFAULT_ALLOWED`, `INDIRECT_RUNTIME` and `PIPX_ALLOWED` lists. No workflow changed.

- **Environment:** Linux cloud session, Node 26.13.1 and npm 11.20.0.
- **Executed:** `npm ci`; `npm test` — **183 pass, 0 fail** (157 plus the check's 26). The check alone under
  `node --test`: 26 pass. Every script a workflow step calls was read for a runtime it starts: `scripts/package-repository.sh`
  (zip, unzip only), `scripts/core-update-pin.mjs` and `scripts/check-release-version.mjs` (started with `node`, which the
  check sees; they start only git), so `INDIRECT_RUNTIME` is empty. Equivalence: the website's exported functions (taken
  from `origin/main`, vitest and the tests removed) and this port's were run on the shared case lists (172 `runsRuntime`
  rows; 365 rows of `runsRuntime`, `setupCovers` and `pipxWithoutPython`) and on the `run:` text of 733 real workflow
  steps from the website and the add-on and App repositories, in three saved snapshots (7,134 comparisons in all): no disagreement, with
  and without the empty-value fix applied to the website's copy. Of ten further `PIPX_DEFAULT_PYTHON` cases, five (each
  an empty value) differ from the website's `main`, exactly where the fix is meant to, and all ten match the website's
  copy with the fix applied. On copies of `ci.yml` held in memory, removing the
  setup-python step, removing the e2e job's setup-node step, or replacing the zizmor `python3 -m venv` with
  `pipx install zizmor` each made the check report the right step.
- **Not executed:** the `build-test` job on GitHub (the pull request's own run is the check); actionlint, zizmor and
  hadolint (no workflow or Dockerfile changed); `npm run e2e` (nothing here touches the pane or the API).

## The zizmor install runs on Python 3.15 (2026-11-12, HCW-HybridCloudWorks#1707)

What changed: one `actions/setup-python` step (Python `3.15`, no cache, `if: ${{ !cancelled() }}`) in the `build-test`
job of `.github/workflows/ci.yml`, before the step that makes zizmor's environment with `python3 -m venv`. Before it, that
environment used the runner's own Python (3.14 on `ubuntu-26.04`), below the program's floor of 3.15. A new test,
`tests/security/workflow-runtime-setup.test.mjs`, fails any workflow step that runs `node`, `npm`, `npx`, `python`,
`python3` or `pip` before its job has set the version up; it lists no exception here.

- **Environment:** Linux cloud session, Node 22.23.4 and its npm (not Node 26: the session has no Node 26, so `npm ci`
  warned `EBADENGINE`).
- **Executed:** a script over the parsed YAML of every workflow, listing each call of `node`, `npm`, `npx`, `python`,
  `python3` or `pip` as a command and whether a setup step chose the version first: the zizmor `python3 -m venv` was the
  only one on the runner's own version. actionlint 1.7.12 with shellcheck 0.11.0 and zizmor 1.31.1 `--offline`, the
  versions `ci.yml` pins: no findings. `npm ci`; `npm test` — 157 pass before the check existed. The check's own count
  grew as review added cases, so each total names its commit: **163 pass** at `948b477` (157 plus the check's 6),
  **167 pass** at `a2738cc` (its 10), **169 pass** at `6e63dfc` (its 12), and **170 pass, 0 fail** on the final head,
  the commit after `6e63dfc` (157 plus the check's 13; its new cases sit inside existing tests). The new check's workflow reader was compared with PyYAML (outside the test)
  on all 366 steps of the four add-ons' workflows: the same jobs, containers and step `name`, `uses` and `run` values.
  On a scratch worktree at `948b477` with the new setup-python step removed from `ci.yml`, the check failed (5 pass,
  1 fail), naming
  `ci.yml > build-test > Install actionlint, hadolint and zizmor (pinned, digests checked) > python`.
- **Not executed:** the `build-test` job on GitHub (the pull request's own run is the check); hadolint (no Dockerfile
  changed); `npm run e2e` (nothing here touches the pane or the API); the tests on Node 26.

## Release 0.3.4 prepared: rebuild for Debian's zlib fix (2026-11-09)

What changed: the version only (0.3.3 to 0.3.4 in the root and both workspace `package.json` files, `package-lock.json`
and `repository.manifest.json`), the `CHANGELOG.md` section for 0.3.4, and the release named in
`docs/deployment/lab-host.md`. This run publishes nothing. The release exists so a new `v0.3.4` tag rebuilds the lab
image with Debian's fixed `zlib` for CVE-2026-76844 and CVE-2026-85091, which Docker Scout found in the published
`v0.3.3` image (website issue saulpatinojr/HCW-HybridCloudWorks#1600).

- **Environment:** Linux authoring sandbox, Node 26.13.0, npm 11.20.0 run from its registry tarball (the npm of the runs
  below; the sandbox's own npm 10.9.9 rewrote the lock's `libc` fields, so it was not used).
- **Executed:** `npm version 0.3.4 --no-git-tag-version --workspaces --include-workspace-root` (the lock diff is the four
  project version lines and nothing else); `npm ci` — 0 vulnerabilities; `npm test` — **157 pass, 0 fail** (includes
  `tests/version-alignment.test.mjs` and `tests/contract/lab-image.test.mjs`); `npm run typecheck`; `npm run build`;
  `bash scripts/package-repository.sh` (190 files); `npx playwright test` — **5 pass** on Chromium headless shell 156;
  `node scripts/check-release-version.mjs --tag v0.3.4` and `--rehearse` — both print
  `release version consistent: 0.3.4, tag v0.3.4`.
- **Checked, read-only:** the Debian security tracker lists both CVEs as fixed for trixie in
  `zlib 1:1.3.dfsg+really1.3.1-1+deb13u1` (DSA-6613-1), and the `trixie-security` `Packages` index for amd64 and arm64
  carries `zlib1g` at that version. `infrastructure/docker/Dockerfile.lab`'s final stage runs
  `apt-get -o Acquire::Retries=0 update --error-on=any` and `apt-get -o Acquire::Retries=0 upgrade -y`, with
  `ARG PUBLISH_CACHE_BUST=` printed in the same `RUN`, and `publish-images.yml` passes a per-run value to both builds, so a
  publish run cannot reuse an older upgrade layer.
- **Not executed:** a local image build and a look at `zlib1g` inside it (no Docker daemon in this sandbox); Docker Scout;
  the `publish-images.yml` dry run on GitHub (after the merge, on the merge commit the tag will point at); actionlint,
  zizmor and hadolint (no workflow or Dockerfile changed; the `build-test` job runs them).

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
- **`publish-images.yml` dry run (2026-11-05):** a manual run builds, checks the edition boundary inside the image and
  scans, and never logs in, pushes or attests; `scripts/check-release-version.mjs` runs before the build in `--rehearse`
  mode (on a tag, `--tag`). `npm test` covers the guard (`tests/check-release-version.test.mjs`) and the workflow's shape
  (`tests/security/publish-images-dry-run.test.mjs`, which also runs the gate script with bash), all passing locally except
  the one known Windows-only case in `tests/security/core-update-apply.test.mjs` (it spawns bash, which resolves to WSL here);
  `actionlint` was not run locally (not installed) and is covered by the `Workflow Lint` job. The
  boundary check inside the image and the skipped push steps are proven only by a run on GitHub (the first dry run on
  `main` after the merge).
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
  add-on repositories, so check the other three; HCW-CloudCrawler_App and HCW-CloudAssessor_App, where the owner decided on 2026-11-04
  to install it too, hold a separate key as Dependabot secrets and are rotated on their own), then delete the old key on the settings page of the App.
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
