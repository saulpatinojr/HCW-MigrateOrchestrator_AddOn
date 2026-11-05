import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// publish-images.yml runs on v* tags and by hand. A manual run is a dry run: it must run the release guard, build, check
// the edition boundary and scan, and never log in, push or attest, because a tag that publishes an image cannot be taken
// back and the dry run is what proves the commit before it is tagged (website CLAUDE.md, "A tag that publishes an image
// cannot be taken back"; website issue saulpatinojr/HCW-HybridCloudWorks#1562). Until 2026-11-05 the same job ran on both
// triggers with push: true, so a manual run on main would have published a sha- tagged image. These tests pin the shape:
// the guard before the first build, every step that can reach Docker Hub conditioned on the gate AND on a v* tag ref,
// and the gate script itself, run with bash, printing the dry-run notice for anything that is not a tag.

const text = readFileSync(".github/workflows/publish-images.yml", "utf8").replace(/\r\n/g, "\n");
const [header, job] = text.split("\njobs:\n");
const steps = job.split(/^ {6}- /m).slice(1);
// A step's own keys sit at 8 spaces (the first one at 0, after the split); the keys under with: at 10.
const field = (step, key) => step.match(new RegExp(`^(?: {8}| {10})?${key}:[ \\t]*(.*)$`, "m"))?.[1]?.trim();
const uses = (step) => field(step, "uses") ?? "";
const script = (step) =>
  step
    .split("run: |\n")[1]
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
const index = (predicate) => steps.findIndex(predicate);
// Three locks: the gate's verdict, the push event (a manual run started on an existing tag ref must not re-push it) and the ref.
const PUBLISH_IF = "steps.gate.outputs.push == 'true' && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')";

const guard = index((s) => s.includes("scripts/check-release-version.mjs"));
const gate = index((s) => /^id:\s*gate\s*$/m.test(s));
const scanBuild = index((s) => uses(s).startsWith("docker/build-push-action@") && field(s, "push") === "false");
const boundary = index((s) => (field(s, "name") ?? "").startsWith("Edition boundary inside the image"));
const trivy = index((s) => uses(s).startsWith("aquasecurity/trivy-action@"));
const login = index((s) => uses(s).startsWith("docker/login-action@"));
const pushBuild = index((s) => uses(s).startsWith("docker/build-push-action@") && field(s, "push") === "true");
const attest = index((s) => uses(s).startsWith("actions/attest-build-provenance@"));
const digest = index((s) => (field(s, "name") ?? "").startsWith("Record the immutable digest"));

test("the workflow runs on v* tags and by hand, and the header says a manual run is a dry run", () => {
  assert.match(text, /^on:\n  push:\n    tags: \["v\*"\]\n  workflow_dispatch:\n/m);
  assert.match(header, /A manual run \(workflow_dispatch\) is a dry run/);
  assert.match(header, /never logs in,\n# pushes or attests/);
  assert.match(header, /scripts\/check-release-version\.mjs/);
});

test("the job itself is not gated on DOCKERHUB_ENABLED, so a dry run always runs", () => {
  assert.doesNotMatch(job, /^    if:/m, "a job-level if: would skip the dry run until the owner enables publishing");
  assert.match(job, /^jobs:\n|^  build-scan-publish:\n/m);
});

test("the release guard runs before anything is built, in --tag mode on a tag and --rehearse mode otherwise, against origin/main", () => {
  assert.ok(guard >= 0, "a step runs scripts/check-release-version.mjs");
  assert.ok(scanBuild >= 0, "a local build step exists");
  assert.ok(guard < scanBuild, "the guard comes before the first build");
  const lines = script(steps[guard]);
  assert.match(lines, /if \[ "\$REF_TYPE" = "tag" \]; then mode=\(--tag "\$REF_NAME"\); else mode=\(--rehearse\); fi/);
  assert.match(lines, /node scripts\/check-release-version\.mjs "\$\{mode\[@\]\}" --ancestor-of origin\/main/);
  assert.equal(field(steps[guard], "env"), '{ REF_TYPE: "${{ github.ref_type }}", REF_NAME: "${{ github.ref_name }}" }');
  const checkout = index((s) => uses(s).startsWith("actions/checkout@"));
  assert.ok(checkout >= 0 && checkout < guard);
  assert.match(steps[checkout], /fetch-depth: 0/, "the guard needs every tag and origin/main");
  assert.match(steps[checkout], /persist-credentials: false/);
  const node = index((s) => uses(s).startsWith("actions/setup-node@"));
  assert.ok(node >= 0 && node < guard, "node is set up before the guard runs");
  assert.ok(steps.every((s) => !/npm (ci|install)/.test(s.split("run:")[1] ?? "")), "the guard is node: built-ins only; no step installs node_modules");
});

test("build, boundary check and scan run unconditionally, in that order, before the login", () => {
  for (const [name, i] of Object.entries({ scanBuild, boundary, trivy })) {
    assert.ok(i >= 0, `${name} step exists`);
    assert.equal(field(steps[i], "if"), undefined, `${name} runs on every trigger`);
  }
  assert.ok(gate < scanBuild && scanBuild < boundary && boundary < trivy && trivy < login, "gate -> build -> boundary -> scan -> login");
  assert.equal(field(steps[scanBuild], "load"), "true");
  assert.match(steps[boundary], /@azure/);
  assert.match(steps[boundary], /api\/health/);
  assert.match(steps[boundary], /--read-only --tmpfs \/tmp --cap-drop ALL --security-opt no-new-privileges/);
  assert.equal(field(steps[trivy], "with"), '{ image-ref: "${{ env.IMAGE }}:scan", exit-code: "1", severity: "HIGH,CRITICAL", ignore-unfixed: true }');
});

test("every step that can reach Docker Hub is conditioned on the gate and on a v* tag ref", () => {
  for (const [name, i] of Object.entries({ login, pushBuild, attest, digest })) {
    assert.ok(i >= 0, `${name} step exists`);
    assert.equal(field(steps[i], "if"), PUBLISH_IF, `${name} is a tag-only step`);
  }
  const pushing = steps.filter((s) => field(s, "push") === "true" || /push-to-registry: true/.test(s) || uses(s).startsWith("docker/login-action@"));
  assert.equal(pushing.length, 3, "login, the pushing build and the attestation are the only steps that write to the registry");
  for (const s of pushing) assert.equal(field(s, "if"), PUBLISH_IF);
  assert.ok(login < pushBuild && pushBuild < attest && attest < digest);
  assert.ok(!/password:/.test(job), "the login is the OIDC connection, never a token");
});

// The gate script, run with bash as the workflow runs it. GITHUB_OUTPUT is a file, as under Actions.
function runGate({ ref, event = "push", enabled, connection }) {
  const dir = mkdtempSync(join(tmpdir(), "publish-gate-"));
  const output = join(dir, "output");
  writeFileSync(output, "");
  const env = { PATH: process.env.PATH, GITHUB_REF: ref, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: output };
  if (enabled !== undefined) env.ENABLED = enabled;
  else env.ENABLED = "";
  env.CONNECTION = connection ?? "";
  const r = spawnSync("bash", ["-c", script(steps[gate])], { env, encoding: "utf8" });
  const out = readFileSync(output, "utf8");
  rmSync(dir, { recursive: true, force: true });
  return { ...r, output: out };
}

test("the gate refuses to push on anything that is not a pushed v* tag and says so with a notice", () => {
  const cases = [
    ["refs/heads/main", "workflow_dispatch"],
    ["refs/heads/ci/publish-dry-run", "workflow_dispatch"],
    ["refs/tags/release-1", "push"],
    ["refs/pull/64/merge", "pull_request"],
    // a manual run started on an existing tag ref: the ref looks like a release, the event says it is not one
    ["refs/tags/v0.3.3", "workflow_dispatch"],
    ["refs/tags/v0.3.2", "workflow_dispatch"],
  ];
  for (const [ref, event] of cases) {
    const r = runGate({ ref, event, enabled: "true", connection: "12345678-1234-1234-1234-123456789abc" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.output, "push=false\n", `${event} on ${ref}`);
    // A plain substring check: building a regular expression from the ref would need every metacharacter escaped
    // (CodeQL flagged the partial escape), and nothing here needs a pattern.
    const notice = `::notice::${event} on ${ref} is not a v* tag: built and scanned, not pushed`;
    assert.ok(
      r.stdout.split("\n").some((line) => line.startsWith(notice)),
      `expected a line starting "${notice}" in:\n${r.stdout}`,
    );
  }
});

test("the gate pushes on a v* tag only when publishing is enabled with a UUID connection, and fails fast on a bad one", () => {
  const good = runGate({ ref: "refs/tags/v0.3.3", enabled: "true", connection: "12345678-1234-1234-1234-123456789abc" });
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.equal(good.output, "push=true\n");
  const off = runGate({ ref: "refs/tags/v0.3.3" });
  assert.equal(off.status, 0);
  assert.equal(off.output, "push=false\n");
  assert.match(off.stdout, /^::notice::DOCKERHUB_ENABLED is not 'true': built and scanned, not pushed/m);
  for (const connection of ["", "not-a-uuid", "12345678-1234-1234-1234-123456789abc\n", "12345678123412341234123456789abc"]) {
    const bad = runGate({ ref: "refs/tags/v0.3.3", enabled: "true", connection });
    assert.equal(bad.status, 1, `connection ${JSON.stringify(connection)} must fail the run`);
    assert.match(bad.stdout, /^::error::DOCKERHUB_ENABLED is true, but the repository variable DOCKERHUB_CONNECTION is not an OIDC connection ID/m);
    assert.equal(bad.output, "");
  }
});
