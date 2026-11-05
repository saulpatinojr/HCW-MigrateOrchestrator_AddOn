# Infrastructure

| Path | What | Status |
|---|---|---|
| `docker/Dockerfile.lab` | AddOn image on `node:26-trixie-slim` (Debian 13, pinned by tag and digest together), built from this repository's root (`npm ci` fetches the pinned upstream release tarballs by URL and verifies their integrity hash in `package-lock.json`), the API (`tsc`) and the pane (`vite`) built before devDependencies are pruned, Debian security upgrades in the final stage (retries off, strict update, per-run cache bust from `publish-images.yml`; `tests/contract/lab-image.test.mjs` pins the shape), npm removed, non-root, health check, OCI labels. Published to `docker.io/hybridcloudworks/img-mo-lab-addon` by `publish-images.yml` after a Trivy scan, with provenance and SBOM, through the Docker OIDC connection | Supported build; the website pins the digest |
| `coder/template/` | Coder guided-lab workspace template (`amo-guided-lab`) running on the shared digest-pinned `docker.io/hybridcloudworks/hcw-lab` image via `tcp://coder-docker-proxy:2375` (`ADR-0032`, no credentials, no cloud access) | Validated in CI (`iac-validate`); pushed by `coder-template.yml` when `CODER_TEMPLATE_ENABLED=true` |
| `monitoring/README.md` | Logging, health and alerting notes | Notes only |

The deployment is the website repository's: its `lab-host/ansible/roles/addons` role runs this image as the container
`hcw-addon-migration` on `127.0.0.1:18081` behind the host's Caddy at `migration.lab.hybridcloudworks.com`, with the
environment and hardening in `docs/deployment/lab-host.md`. This repository ships the image and the env contract only.
