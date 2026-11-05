import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The shape of the lab image (infrastructure/docker/Dockerfile.lab) and of the publish workflow that builds it.
// Why these lines are pinned: on 2026-11-05 the website's Docker Scout check refused the published v0.3.2 image on
// CVE-2026-109518 in Debian 12's apt 2.6.1 (website issue saulpatinojr/HCW-HybridCloudWorks#1562). The remedy has two
// parts, and a reviewed change is needed to drop either: the base is a current Debian (node:26-trixie-slim), pinned by
// tag and digest together so Dependabot keeps moving it; and the final stage applies Debian's security updates itself
// with download retries off (the apt doing the upgrade is still the base's, and that advisory needs a retry to slip an
// unverified package in), `--error-on=any` on the update (a missing security index fails the build instead of leaving
// the base unupgraded), and a per-run PUBLISH_CACHE_BUST that the publish workflow passes, so no publish run reuses an
// older upgrade layer. These are static checks of the two files; a local build proves the apt version inside.

const dockerfile = readFileSync("infrastructure/docker/Dockerfile.lab", "utf8").replace(/\r\n/g, "\n");
const workflow = readFileSync(".github/workflows/publish-images.yml", "utf8").replace(/\r\n/g, "\n");

// Instructions with their continuation lines joined, comment lines dropped.
const instructions = dockerfile
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n")
  .replace(/\\\n\s*/g, " ")
  .split("\n")
  .filter((l) => l.trim() !== "");
const stages = instructions.reduce((acc, line) => {
  if (/^FROM\s/.test(line)) acc.push([]);
  if (acc.length) acc[acc.length - 1].push(line);
  return acc;
}, []);
const finalStage = stages[stages.length - 1];

test("the base image is a current Debian Node image, pinned by tag and digest together", () => {
  const arg = instructions.find((l) => /^ARG NODE_IMAGE=/.test(l));
  assert.ok(arg, "ARG NODE_IMAGE is the single place the base is named");
  assert.match(arg, /^ARG NODE_IMAGE=node:26-trixie-slim@sha256:[0-9a-f]{64}$/, "tag and digest move together; Debian 13 (trixie) or newer");
  const froms = instructions.filter((l) => /^FROM\s/.test(l));
  assert.equal(froms.length, 2, "a build stage and a final stage");
  for (const from of froms) assert.match(from, /^FROM \$\{NODE_IMAGE\}( AS build)?$/, `every FROM takes the pinned base: ${from}`);
});

test("the final stage applies Debian's security updates with retries off, a strict update and a per-run cache bust", () => {
  const argIndex = finalStage.findIndex((l) => l === "ARG PUBLISH_CACHE_BUST=");
  assert.ok(argIndex > 0, "the final stage declares ARG PUBLISH_CACHE_BUST= (empty default: a local build caches as usual)");
  const run = finalStage.find((l) => /^RUN\s.*apt-get/.test(l));
  assert.ok(run, "the final stage has one RUN that drives apt-get");
  assert.ok(finalStage.indexOf(run) > argIndex, "the ARG is declared before the RUN that names it");
  const steps = run.replace(/^RUN\s+/, "").split(/\s*&&\s*/);
  assert.deepEqual(steps, [
    `printf 'upgrade run: %s\\n' "\${PUBLISH_CACHE_BUST}"`,
    "apt-get -o Acquire::Retries=0 update --error-on=any",
    "apt-get -o Acquire::Retries=0 upgrade -y --no-install-recommends",
    "apt-get clean",
    "rm -rf /var/lib/apt/lists/*",
  ]);
  const copyIndex = finalStage.findIndex((l) => /^COPY --from=build/.test(l));
  assert.ok(finalStage.indexOf(run) < copyIndex, "the upgrade runs before the application files are copied in");
  const aptRuns = instructions.filter((l) => /^RUN\s.*apt-get/.test(l));
  assert.equal(aptRuns.length, 1, "no other RUN uses apt-get (an install elsewhere would need the same retries-off shape)");
});

test("publish-images.yml passes a per-run PUBLISH_CACHE_BUST to every build of the image", () => {
  const builds = workflow.split(/^ {6}- /m).filter((s) => /^\s*uses:\s*docker\/build-push-action@/m.test(s));
  assert.equal(builds.length, 2, "the scan build and the push build");
  for (const step of builds) {
    const args = step.match(/^ {10}build-args: \|\n((?:(?: {12}.*)?\n)*)/m);
    assert.ok(args, "build-args is a block, one argument per line");
    const lines = args[1].split("\n").map((l) => l.trim()).filter(Boolean);
    assert.ok(lines.includes("PUBLISH_CACHE_BUST=${{ github.run_id }}-${{ github.run_attempt }}"), `a per-run value: ${lines.join(", ")}`);
    assert.ok(lines.some((l) => /^ADDON_VERSION=\$\{\{ steps\.version\.outputs\.version \}\}$/.test(l)), "the version argument stays");
  }
});
