# Integrating the migration AddOn into hybridcloudworks.com

The site frames this AddOn as a **sandboxed pane** at `/tools/migration` (HCW AddOn Integration Standard; upstream ADR-0030,
[`docs/adr/ADR-0030-web-front-edition-runs-as-a-site-pane.md`](../adr/ADR-0030-web-front-edition-runs-as-a-site-pane.md)). Nothing from this repository is installed into the site: the site holds one catalogue row, one status read and
one iframe. The AddOn serves its own pane app (`apps/lab-web`, built into `dist/`) and its API from one origin,
`https://migration.lab.hybridcloudworks.com`, hosted by the website repository's `addons` Ansible role on the lab host
(`docs/deployment/lab-host.md`).

| Fact | Value |
|---|---|
| Catalogue id | `migration` |
| Site route | `/tools/migration` (Tools menu label `Migration Hub`) |
| AddOn origin | `https://migration.lab.hybridcloudworks.com` (`panePath` `/`, `healthPath` `/api/health`) |
| Loopback port on the lab host | `127.0.0.1:18081` → container port `8080` |
| Image | `docker.io/hybridcloudworks/img-mo-lab-addon`, pinned by digest |
| Capabilities the row grants | `navigate`, `downloads` |

## 1. Catalogue row (`frontend/src/data/addons/catalogue.js`)

```js
{
  id: 'migration',
  title: 'Azure migration assessment',
  menuLabel: 'Migration Hub',
  summary:
    'Upload an exported inventory of your Azure estate and get a staged migration assessment, example automation and runbooks. Nothing you upload is kept beyond two hours.',
  origin: 'https://migration.lab.hybridcloudworks.com',
  panePath: '/',
  healthPath: '/api/health',
  providers: ['azure'],
  technology: ['azure-resource-mover', 'terraform'],
  status: 'available',
  capabilities: ['navigate', 'downloads'],
  docsUrl: 'https://github.com/saulpatinojr/HCW-MigrateOrchestrator_AddOn#readme',
  articleSlugs: [],
}
```

`downloads` is needed for the bundle zip and the sample CSV (`a.click()` on a blob URL inside a sandboxed frame needs
`allow-downloads`). `navigate` lets the enterprise CTA reach the site's `/contact` through the host instead of a link the
site's own `frame-ancestors 'none'` would block.

## 2. Status proxy (`GET /api/public/addons/migration/status`)

The site's Function App reads `https://migration.lab.hybridcloudworks.com/api/health` (5 s timeout, one-minute cache) and
projects exactly `{ configured, reachable, version, edition, capabilities, asOf }`; every other health field is ignored.
`configured` is whether the `ADDON_MIGRATION_URL` app setting is set; `reachable` is whether health answered 200 with
`ok: true`. The page mounts the frame only when both are true; otherwise it shows the one sentence
**"This tool isn't available right now."**

What this AddOn answers (flat envelope, `docs/api/openapi.yaml` `AddOnHealth`):

```json
{ "ok": true, "id": "migration", "version": "0.3.0", "edition": "demo",
  "capabilities": ["assessments", "sample-csv", "bundle-download"], "asOf": "2026-10-10T12:00:00.000Z",
  "siteOrigins": ["https://hybridcloudworks.com", "https://www.hybridcloudworks.com"],
  "turnstile": { "required": true, "siteKey": "0x4AAAAAAA…" },
  "rulesLoaded": true, "azureConnectivity": "disabled-by-design", "workspace": "disabled" }
```

`edition` stays `demo` (an upstream constant); the proxy treats it as opaque.

## 3. The frame

```jsx
<iframe src="https://migration.lab.hybridcloudworks.com/" title="Azure migration assessment"
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" allow="" />
```

- `allow-same-origin` is required: without it the frame is an opaque origin, its `fetch('/api/…')` arrives with
  `Origin: null`, exact-origin CORS refuses it, and the verification widget cannot bind to its hostname. The AddOn is always
  cross-origin to the site, so scripts plus same-origin cannot lift the sandbox.
- `allow-downloads` because the row has `downloads`; never `allow-top-navigation`, never `allow-modals`.
- Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`, `X-Addon-Id` and `X-Addon-Version` (the header set shared by every HCW AddOn).
- The AddOn answers every response with `Content-Security-Policy: … frame-ancestors 'self' https://hybridcloudworks.com https://www.hybridcloudworks.com …`
  (from `AMO_FRAME_ANCESTORS`) and no `X-Frame-Options`, so the browser lets the site frame it and nobody else.

Interim: the explorer's "Delete my data now" asks with `window.confirm`, which a sandbox without `allow-modals` ignores
(the browser logs `Ignored call to 'confirm()'` and answers `false`). When framed, the pane skips the question so the delete
proceeds; the UI package is asked to confirm without a modal (recorded in `VALIDATION.md`).

## 4. Pane protocol

The pane posts one message shape to each origin in `/api/health.siteOrigins` (never `*`), only on state **transitions**:

```json
{ "type": "hcw-addon", "id": "migration", "state": "ready" }
{ "type": "hcw-addon", "id": "migration", "state": "ready", "navigate": "/contact" }
```

| State | When |
|---|---|
| `loading` | First thing on mount, before health is read (queued until `siteOrigins` is known, then posted). |
| `ready` | The explorer is on screen; again after every assessment run. |
| `working` | While a `POST /api/assessments` (or a workspace request) is in flight. |
| `unavailable` | Health failed; the pane shows the one sentence itself. (No origin is known then, so the site's 30-second watchdog is what shows its own sentence.) |

The site accepts a message only when `event.origin === addon.origin`, `event.source === frame.contentWindow`,
`data.type === 'hcw-addon'`, `data.id === 'migration'` and `data.state` is a known state; `navigate` is read only because the
row has `navigate` and must be one of the site's navigation targets (`/contact` here). The site sends nothing to the pane.
`tests/e2e/host-page.html` is a faithful stand-in and `tests/e2e/lab.spec.ts` asserts exactly
`loading → ready → working → ready` for one run.

## 5. Human verification

The pane owns the widget entirely: it injects the widget script only when health says `turnstile.required`, renders it with
the published `siteKey`, and sends the token as `x-turnstile-token` on the upload. The server verifies it with the secret from
the host vault (`vault_addon_migration_turnstile_secret`), with a 5-second bound on the verification call (a timeout is a
failed verdict, `siteverify-timeout`). Without a secret the upload route answers `503 turnstile_not_configured` at once and
closes the connection without reading the body (fail closed). The rate limit and the concurrency bound both apply before
verification, so a stalled verification endpoint holds at most `AMO_MAX_CONCURRENT` requests. The widget is a separate one bound to `migration.lab.hybridcloudworks.com`, not
the site's. Visitor copy says "human verification"; no vendor name appears in the pane.

## 6. Environment the host renders into the container

| Variable | Lab host value | Purpose |
|---|---|---|
| `PORT` | `8080` | Container port; published as `127.0.0.1:18081:8080` |
| `AMO_FRAME_ANCESTORS` | `'self' https://hybridcloudworks.com https://www.hybridcloudworks.com` (= `caddy_frame_ancestors`) | CSP `frame-ancestors` |
| `AMO_SITE_ORIGINS` | `https://hybridcloudworks.com https://www.hybridcloudworks.com` (frame-ancestors minus `'self'`) | `postMessage` targets, published in health |
| `AMO_TRUST_PROXY` | `1` | First `X-Forwarded-For` value (set by the host's Caddy) is the client address |
| `AMO_TURNSTILE_SITE_KEY` | the widget's site key (public) | Published in health; pane renders the widget |
| `TURNSTILE_SECRET` | from vault `vault_addon_migration_turnstile_secret` | Server-side verification |
| `AMO_RATE_LIMIT_POSTS` / `AMO_RATE_LIMIT_WINDOW_MINUTES` | `10` / `10` | Token bucket per client on uploads |
| `AMO_MAX_CONCURRENT` | `2` | Assessments running at once; beyond it `503 overloaded`, `Retry-After: 5` |
| `AMO_ASSESSMENT_TTL_MINUTES` | `120` | In-memory TTL |
| `AMO_ALLOWED_ORIGINS` | empty | The pane is same-origin with its API |
| `AMO_PUBLIC_BASE_URL` | `https://migration.lab.hybridcloudworks.com` | Only used by the (disabled) guided-lab hand-off |
| `AMO_ALLOW_NO_TURNSTILE` | never set on the host | Local development and e2e only; covers only the no-secret case (a secret without its site key always refuses to start) |

## 7. What the site needs from a release

A `v*` tag here runs `publish-images.yml`, which scans and pushes `docker.io/hybridcloudworks/img-mo-lab-addon` (a manual
run of the same workflow is a dry run: it builds, checks and scans, and pushes nothing) and
prints `image@sha256:…` in the run summary. The website pins that digest (`addons[].image_digest`) and the version
(`addons[].image_tag`, also what `/api/health.version` and `X-Addon-Version` report) in `lab-host/ansible/group_vars/all.yml`.
Nothing else crosses the boundary: no package, no secret, no site credential.

## 8. Checks on the site before merge

`npm run code:quality && npm run build && npm run test` in `frontend/`; `csp.test.js` must list
`https://migration.lab.hybridcloudworks.com` in `frame-src`; the route inventory and the pre-render list include
`/tools/migration`; the Integrations card shows the AddOn through the status route.
