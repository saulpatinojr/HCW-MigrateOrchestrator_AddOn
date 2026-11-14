import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { noopLogger } from "@hybridcloudworks/migration-core/observability";
import { createDemoApi, verifyTurnstile, ADDON_VERSION } from "./app.js";

// Repository root from this file (apps/lab-api/dist/api.test.js); the rules now live inside the published core package.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sample = readFileSync(join(root, "samples", "resources-csv", "sample-resources.csv"), "utf8");
// A stand-in for the built pane (apps/lab-web/dist): index.html plus one hashed asset, so static tests need no vite build.
const staticDir = mkdtempSync(join(tmpdir(), "amo-static-"));
mkdirSync(join(staticDir, "assets"));
writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>Migration assessment</title><div id=root></div>");
writeFileSync(join(staticDir, "assets", "index-abc123.js"), "console.log(1)");
const dev = { logger: noopLogger, allowNoTurnstile: true } as const;
const { server } = createDemoApi({ ...dev, sampleCsvPath: join(root, "samples", "resources-csv", "sample-resources.csv"), staticDir });
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
after(() => server.close());

test("create → read → file → zip → delete lifecycle with owner isolation", async () => {
  const created = await fetch(`${base}/api/assessments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: sample, fileName: "resources.csv", intent: { destinationRegion: "westus3", sameTenant: true } }) });
  assert.equal(created.status, 201);
  const body = (await created.json()) as { assessmentId: string; ownerToken: string; summary: { resourceCount: number } };
  assert.ok(body.summary.resourceCount > 20);
  const noToken = await fetch(`${base}/api/assessments/${body.assessmentId}`);
  assert.equal(noToken.status, 404);
  const wrong = await fetch(`${base}/api/assessments/${body.assessmentId}`, { headers: { "x-owner-token": "nope" } });
  assert.equal(wrong.status, 404);
  const ok = await fetch(`${base}/api/assessments/${body.assessmentId}`, { headers: { "x-owner-token": body.ownerToken } });
  assert.equal(ok.status, 200);
  const file = await fetch(`${base}/api/assessments/${body.assessmentId}/files/DEMO-NOT-FOR-PRODUCTION.md`, { headers: { "x-owner-token": body.ownerToken } });
  assert.equal(file.status, 200);
  const zip = await fetch(`${base}/api/assessments/${body.assessmentId}/bundle.zip`, { headers: { "x-owner-token": body.ownerToken } });
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.equal((await zip.arrayBuffer()).byteLength > 1000, true);
  const del = await fetch(`${base}/api/assessments/${body.assessmentId}`, { method: "DELETE", headers: { "x-owner-token": body.ownerToken } });
  assert.equal(del.status, 200);
  assert.equal((await fetch(`${base}/api/assessments/${body.assessmentId}`, { headers: { "x-owner-token": body.ownerToken } })).status, 404);
});

test("rejects credentials in questionnaire, bad CSV, and oversize bodies; no execution surface", async () => {
  const cred = await fetch(`${base}/api/assessments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: sample, intent: { storageKey: "x" } }) });
  assert.equal(cred.status, 400);
  const bad = await fetch(`${base}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv" }, body: "NAME,LOCATION\na,b\n" });
  assert.equal(bad.status, 422);
  const big = await fetch(`${base}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv" }, body: "x".repeat(6 * 1024 * 1024) }).catch(() => null);
  assert.ok(big === null || big.status === 413);
  const exec = await fetch(`${base}/api/execute/anything`, { method: "POST" });
  assert.equal(exec.status, 403);
  const health = (await (await fetch(`${base}/api/health`)).json()) as { azureConnectivity: string };
  assert.equal(health.azureConnectivity, "disabled-by-design");
});

test("static UI is served with security headers and path traversal is blocked", async () => {
  const idx = await fetch(`${base}/`);
  assert.equal(idx.status, 200);
  assert.ok(idx.headers.get("content-security-policy")?.includes("default-src 'self'"));
  assert.equal(idx.headers.get("cache-control"), "no-cache", "index.html revalidates on every load");
  assert.equal((await fetch(`${base}/assets/index-abc123.js`)).headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal((await fetch(`${base}/anything/deep`)).headers.get("cache-control"), "no-cache", "SPA fallback is index.html");
  const trav = await fetch(`${base}/../../package.json`);
  assert.ok(!(await trav.text()).includes('"workspaces"'));
});

test("CORS: allowed origin gets headers, others do not; preflight 204/403", async () => {
  const { server: s2 } = createDemoApi({ ...dev, allowedOrigins: ["https://hybridcloudworks.com"] });
  await new Promise<void>((r) => s2.listen(0, r));
  const b2 = `http://127.0.0.1:${(s2.address() as { port: number }).port}`;
  try {
    const ok = await fetch(`${b2}/api/health`, { headers: { origin: "https://hybridcloudworks.com" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://hybridcloudworks.com");
    const no = await fetch(`${b2}/api/health`, { headers: { origin: "https://evil.example" } });
    assert.equal(no.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(`${b2}/api/assessments`, { method: "OPTIONS", headers: { origin: "https://hybridcloudworks.com" } })).status, 204);
    assert.equal((await fetch(`${b2}/api/assessments`, { method: "OPTIONS", headers: { origin: "https://evil.example" } })).status, 403);
  } finally { s2.close(); }
});

test("Turnstile: enforced when a secret is configured, verified via siteverify", async () => {
  const seen: string[] = [];
  const fake = (async (url: string, init?: RequestInit) => { seen.push(String(init?.body)); return new Response(JSON.stringify({ success: String(init?.body).includes("response=good") }), { status: 200 }); }) as unknown as typeof fetch;
  const { server: s3 } = createDemoApi({ logger: noopLogger, turnstileSecret: "secret", turnstileSiteKey: "1x00000000000000000000AA", fetchImpl: fake });
  await new Promise<void>((r) => s3.listen(0, r));
  const b3 = `http://127.0.0.1:${(s3.address() as { port: number }).port}`;
  try {
    const missing = await fetch(`${b3}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv" }, body: sample });
    assert.equal(missing.status, 403);
    const bad = await fetch(`${b3}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv", "x-turnstile-token": "bad" }, body: sample });
    assert.equal(bad.status, 403);
    const good = await fetch(`${b3}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv", "x-turnstile-token": "good" }, body: sample });
    assert.equal(good.status, 201);
    assert.ok(seen.some((b) => b.includes("secret=secret")));
  } finally { s3.close(); }
});

test("workspace: disabled provider hides the feature; in-memory provider issues a one-time bundle token", async () => {
  const { InMemoryWorkspaceProvider } = await import("@hybridcloudworks/migration-core/workspace-provider");
  const { server: s4, store } = createDemoApi({ ...dev, workspaceProvider: new InMemoryWorkspaceProvider(), publicBaseUrl: "https://labs-api.example" });
  await new Promise<void>((r) => s4.listen(0, r));
  const b4 = `http://127.0.0.1:${(s4.address() as { port: number }).port}`;
  try {
    const created = (await (await fetch(`${b4}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv" }, body: sample })).json()) as { assessmentId: string; ownerToken: string };
    const ws = await fetch(`${b4}/api/assessments/${created.assessmentId}/workspace`, { method: "POST", headers: { "x-owner-token": created.ownerToken } });
    assert.equal(ws.status, 202);
    const body = (await ws.json()) as { launchUrl: string };
    assert.ok(body.launchUrl.startsWith("memory://"));
    // The one-time token is what the workspace uses; owner token is never shared with it.
    const token = store.issueBundleToken(created.assessmentId, created.ownerToken)!;
    const first = await fetch(`${b4}/api/assessments/${created.assessmentId}/bundle.zip`, { headers: { "x-bundle-token": token } });
    assert.equal(first.status, 200);
    const second = await fetch(`${b4}/api/assessments/${created.assessmentId}/bundle.zip`, { headers: { "x-bundle-token": token } });
    assert.equal(second.status, 404, "single use");
    assert.equal((await fetch(`${b4}/api/assessments/${created.assessmentId}`, { headers: { "x-bundle-token": token } })).status, 404, "bundle token never grants the assessment itself");
  } finally { s4.close(); }
  assert.equal((await fetch(`${base}/api/assessments/00000000-0000-4000-8000-000000000000/workspace`, { method: "POST" })).status, 404);
});

test("rules coverage is public; stats are opt-in and contain aggregates only", async () => {
  const cov = (await (await fetch(`${base}/api/rules/coverage`)).json()) as { count: number; types: Array<{ resourceType: string; support: object }> };
  assert.ok(cov.count >= 24 && cov.types[0].support);
  assert.equal((await fetch(`${base}/api/stats`)).status, 404);
  const { server: s5 } = createDemoApi({ ...dev, telemetry: true });
  await new Promise<void>((r) => s5.listen(0, r));
  const b5 = `http://127.0.0.1:${(s5.address() as { port: number }).port}`;
  try {
    await fetch(`${b5}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv" }, body: sample });
    const st = (await (await fetch(`${b5}/api/stats`)).json()) as { assessments: number; topResourceTypes: Array<{ key: string }>; typesWithoutRule: Array<{ key: string }> };
    assert.equal(st.assessments, 1);
    assert.ok(st.topResourceTypes.length > 5);
    assert.ok(st.typesWithoutRule.some((t) => t.key === "microsoft.quantum/workspaces"));
    assert.ok(!JSON.stringify(st).includes("00000000-0000-0000-0000-000000000001"), "no subscription IDs in stats");
    assert.ok(!/hcw-?sample/.test(JSON.stringify(st)), "no resource names in stats");
  } finally { s5.close(); }
});

const listen = async (o: Parameters<typeof createDemoApi>[0]) => { const api = createDemoApi(o); await new Promise<void>((r) => api.server.listen(0, r)); return { ...api, url: `http://127.0.0.1:${(api.server.address() as { port: number }).port}` }; };
const post = (b: string, headers: Record<string, string> = {}) => fetch(`${b}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv", ...headers }, body: sample });

test("framing: default frame-ancestors 'none' sends DENY; a configured list drops x-frame-options and lands in the CSP", async () => {
  const idx = await fetch(`${base}/api/health`);
  assert.ok(idx.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
  assert.equal(idx.headers.get("x-frame-options"), "DENY");
  assert.ok(idx.headers.get("content-security-policy")?.includes("base-uri 'none'; form-action 'self'"));
  const devDirectives = cspDirectives(idx.headers.get("content-security-policy"));
  assert.equal(devDirectives.get("script-src"), "'self'", "no widget origin in script-src without a site key");
  assert.equal(devDirectives.has("frame-src"), false, "no frame-src without a site key");
  const s = await listen({ ...dev, frameAncestors: ["'self'", "https://hybridcloudworks.com", "https://www.hybridcloudworks.com"], turnstileSecret: "s", turnstileSiteKey: "1x00000000000000000000AA" });
  try {
    const r = await fetch(`${s.url}/api/health`);
    const csp = r.headers.get("content-security-policy") ?? "";
    assert.ok(csp.includes("frame-ancestors 'self' https://hybridcloudworks.com https://www.hybridcloudworks.com"), csp);
    assert.equal(r.headers.get("x-frame-options"), null);
    const directives = cspDirectives(csp);
    assert.equal(directives.get("script-src"), "'self' https://challenges.cloudflare.com", csp);
    assert.equal(directives.get("frame-src"), "https://challenges.cloudflare.com", csp);
  } finally { s.server.close(); }
});

test("health is the flat AddOn envelope and x-addon-* headers ride on JSON, static and error responses", async () => {
  const s = await listen({ ...dev, siteOrigins: ["https://hybridcloudworks.com/", "https://www.hybridcloudworks.com"], sampleCsvPath: join(root, "samples", "resources-csv", "sample-resources.csv"), staticDir, version: "9.9.9" });
  try {
    const r = await fetch(`${s.url}/api/health`);
    const h = (await r.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(h).sort(), ["asOf", "azureConnectivity", "capabilities", "edition", "id", "ok", "rulesLoaded", "siteOrigins", "turnstile", "version", "workspace"]);
    assert.equal(h.ok, true); assert.equal(h.id, "migration"); assert.equal(h.version, "9.9.9"); assert.equal(h.edition, "demo");
    assert.deepEqual(h.capabilities, ["assessments", "sample-csv", "bundle-download"]);
    assert.deepEqual(h.siteOrigins, ["https://hybridcloudworks.com", "https://www.hybridcloudworks.com"]);
    assert.deepEqual(h.turnstile, { required: false, siteKey: null });
    assert.ok(!Number.isNaN(Date.parse(String(h.asOf))));
    for (const r2 of [r, await fetch(`${s.url}/`), await fetch(`${s.url}/api/nope`), await fetch(`${s.url}/api/assessments/00000000-0000-4000-8000-000000000000`)]) {
      assert.equal(r2.headers.get("x-addon-id"), "migration");
      assert.equal(r2.headers.get("x-addon-version"), "9.9.9");
      assert.equal(r2.headers.get("x-content-type-options"), "nosniff");
      assert.equal(r2.headers.get("referrer-policy"), "no-referrer");
      assert.equal(r2.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
      assert.equal(r2.headers.get("cross-origin-opener-policy"), "same-origin");
    }
  } finally { s.server.close(); }
  const real = (await (await fetch(`${base}/api/health`)).json()) as { version: string; turnstile: { required: boolean; siteKey: string | null } };
  assert.equal(real.version, ADDON_VERSION);
  assert.match(ADDON_VERSION, /^\d+\.\d+\.\d+/);
  const { InMemoryWorkspaceProvider } = await import("@hybridcloudworks/migration-core/workspace-provider");
  const ws = await listen({ ...dev, workspaceProvider: new InMemoryWorkspaceProvider(), turnstileSecret: "s", turnstileSiteKey: "1x00000000000000000000AA" });
  try {
    const h = (await (await fetch(`${ws.url}/api/health`)).json()) as { capabilities: string[]; turnstile: { required: boolean; siteKey: string } };
    assert.ok(h.capabilities.includes("workspace"));
    assert.deepEqual(h.turnstile, { required: true, siteKey: "1x00000000000000000000AA" });
  } finally { ws.server.close(); }
});

test("rate limit: the bucket empties after the configured posts and 429 carries Retry-After; workspace POSTs share it", async () => {
  const s = await listen({ ...dev, rateLimit: { postsPerWindow: 3, windowMs: 10 * 60000 } });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await post(s.url)).status, 201, `post ${i + 1}`);
    const limited = await post(s.url);
    assert.equal(limited.status, 429);
    assert.match(limited.headers.get("retry-after") ?? "", /^\d+$/);
    assert.equal(((await limited.json()) as { error: { code: string } }).error.code, "rate_limited");
    const ws = await fetch(`${s.url}/api/assessments/00000000-0000-4000-8000-000000000000/workspace`, { method: "POST" });
    assert.equal(ws.status, 429, "the workspace route draws from the same bucket");
    assert.equal((await fetch(`${s.url}/api/health`)).status, 200, "reads are never limited");
  } finally { s.server.close(); }
});

test("overload: with the programmatic maxConcurrent 0 (the env floor is 1) the first POST answers 503 overloaded with Retry-After 5", async () => {
  const s = await listen({ ...dev, maxConcurrent: 0 });
  try {
    const r = await post(s.url);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("retry-after"), "5");
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, "overloaded");
  } finally { s.server.close(); }
});

test("Turnstile fails closed: no secret → 503 turnstile_not_configured unless explicitly allowed; a secret without a site key always refuses to start", async () => {
  const closed = await listen({ logger: noopLogger });
  try {
    const r = await post(closed.url);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("connection"), "close");
    assert.equal(((await r.json()) as { error: { code: string } }).error.code, "turnstile_not_configured");
    // An oversized upload against the misconfigured route is answered or cut at once, never buffered: the body is not read.
    const t0 = Date.now();
    const big = await fetch(`${closed.url}/api/assessments`, { method: "POST", headers: { "content-type": "text/csv" }, body: "x".repeat(6 * 1024 * 1024) }).catch(() => null);
    assert.ok(big === null || big.status === 503, `oversized body: ${big?.status ?? "connection closed"}`);
    assert.ok(Date.now() - t0 < 5000, "no hang");
    assert.equal((await fetch(`${closed.url}/api/health`)).status, 200, "health still answers");
  } finally { closed.server.close(); }
  assert.equal((await post(base)).status, 201, "allowNoTurnstile lets local development through");
  assert.throws(() => createDemoApi({ logger: noopLogger, turnstileSecret: "s" }), /AMO_TURNSTILE_SITE_KEY/);
  assert.throws(() => createDemoApi({ logger: noopLogger, turnstileSecret: "s", allowNoTurnstile: true }), /AMO_TURNSTILE_SITE_KEY/, "the bypass never covers a secret without its site key");
});

test("siteverify is bounded: a stalled verification endpoint yields 403 siteverify-timeout and counts against the concurrency bound", async () => {
  const stall = ((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))) as unknown as typeof fetch;
  const ignoresSignal = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
  const s = await listen({ logger: noopLogger, turnstileSecret: "secret", turnstileSiteKey: "1x00000000000000000000AA", fetchImpl: stall, siteverifyTimeoutMs: 300, maxConcurrent: 1 });
  try {
    const t0 = Date.now();
    const [first, second] = await Promise.all([post(s.url, { "x-turnstile-token": "t" }), new Promise<Response>((r) => setTimeout(() => r(post(s.url, { "x-turnstile-token": "t" })), 50))]);
    assert.equal(first.status, 403);
    assert.deepEqual(((await first.json()) as { error: { details: { codes: string[] } } }).error.details.codes, ["siteverify-timeout"]);
    assert.equal(second.status, 503, "the request stalled in verification holds the one slot; the next is refused, not queued");
    assert.equal(second.headers.get("retry-after"), "5");
    assert.ok(Date.now() - t0 < 3000, "bounded by the siteverify timeout, not by the request");
    assert.equal((await post(s.url, { "x-turnstile-token": "t" })).status, 403, "the slot is released after the timeout");
  } finally { s.server.close(); }
  const direct = await verifyTurnstile("secret", "t", undefined, ignoresSignal, "http://siteverify.test/verify", 100);
  assert.deepEqual(direct, { ok: false, codes: ["siteverify-timeout"] }, "a fetch that ignores the signal still times out");
});

test("client address: socket peer by default; first x-forwarded-for value only with trustProxy", async () => {
  const seen: string[] = [];
  const fake = (async (_url: string, init?: RequestInit) => { seen.push(String(init?.body)); return new Response(JSON.stringify({ success: true }), { status: 200 }); }) as unknown as typeof fetch;
  const base_ = { logger: noopLogger, turnstileSecret: "secret", turnstileSiteKey: "1x00000000000000000000AA", fetchImpl: fake, siteverifyUrl: "http://siteverify.test/verify" };
  const socketOnly = await listen(base_);
  const proxied = await listen({ ...base_, trustProxy: true });
  try {
    const spoof = { "x-turnstile-token": "t", "x-forwarded-for": "203.0.113.9, 10.0.0.1", "cf-connecting-ip": "198.51.100.1" };
    assert.equal((await post(socketOnly.url, spoof)).status, 201);
    assert.ok(seen[0].includes("remoteip=127.0.0.1"), `socket address expected: ${seen[0]}`);
    assert.equal((await post(proxied.url, spoof)).status, 201);
    assert.ok(seen[1].includes("remoteip=203.0.113.9"), `first x-forwarded-for expected: ${seen[1]}`);
    assert.ok(!seen.some((b) => b.includes("198.51.100.1")), "cf-connecting-ip is never read");
  } finally { socketOnly.server.close(); proxied.server.close(); }
});

/** The CSP header as a directive map, so tests compare whole directive values rather than substrings. */
function cspDirectives(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) out.set(name, rest.join(" "));
  }
  return out;
}

test("coder template: enforces ADR-0032 / LAB-5 sandbox boundary and hcw-boot dispatcher", () => {
  const tf = readFileSync(join(root, "infrastructure", "coder", "template", "main.tf"), "utf8");
  const code = tf.split("\n").map((l) => l.split("#")[0]).join("\n");
  assert.match(code, /host\s*=\s*"tcp:\/\/coder-docker-proxy:2375"/);
  assert.match(code, /uid\s*=\s*"65534:65534"/);
  assert.match(code, /home\s*=\s*"\/tmp\/home"/);
  assert.match(code, /assessment_dir\s*=\s*"\/tmp\/home\/assessment"/);
  assert.match(code, /subdomain\s*=\s*true/);
  assert.doesNotMatch(code, /subdomain\s*=\s*false/);
  assert.match(code, /privileged\s*=\s*false/);
  assert.match(code, /security_opts\s*=\s*\["no-new-privileges:true"\]/);
  assert.match(code, /drop\s*=\s*\["ALL"\]/);
  assert.doesNotMatch(code, /host_path/);
  assert.doesNotMatch(code, /docker\.sock/);
  assert.match(code, /\/usr\/local\/libexec\/hcw-boot\/hcw-boot migration-assessment/);
  assert.match(code, /python3 -m zipfile -e/);
});

