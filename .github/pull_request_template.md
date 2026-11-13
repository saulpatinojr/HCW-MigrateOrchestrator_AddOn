## Summary

<!-- What changes and why, in plain words. Link the issue or decision. -->

## Upstream (if the change comes from, or reaches, HCW-MigrateOrchestrator_App)

- [ ] `docs/whats-new-upstream.md` has an entry for this change — or not applicable
- [ ] The upstream packages are still pinned to one release tag, by URL and integrity hash (no hand edits to `main` or two tags) — or not applicable

## Verification

- [ ] `npm ci` then `npm test` — result:
- [ ] `npm run e2e` (anything touching the explorer pane or the lab API) — result, or not applicable:
- [ ] `npm run typecheck` — result:
- [ ] Checks not run and why:

## Infrastructure (if `infrastructure/**` or `docker-compose.yml` changed)

- [ ] `terraform fmt -check` / `validate` output, or the workflow run link
- [ ] No privileged containers, Docker socket exposure or secrets introduced

## Security and data review

- [ ] The lab still cannot construct an Azure provider (`tests/security/edition-boundary.test.mjs` passes)
- [ ] No secrets, tokens, customer inventories or real tenant/subscription ids, fixtures and tests included
- [ ] No vendor names in anything a visitor can read in the pane
- [ ] The limits, CORS, human verification, rate limit and "not production" labels are unchanged — or the change is explained above

## Documentation

- [ ] `CHANGELOG.md` updated
- [ ] `VALIDATION.md` records what ran and what did not — or not applicable

## AI provenance

- [ ] Code created or changed by an AI coding partner (GitHub Copilot / Claude / Codex) — reviewer applies `.github/skills/coordinate-ai-code-handoff`
