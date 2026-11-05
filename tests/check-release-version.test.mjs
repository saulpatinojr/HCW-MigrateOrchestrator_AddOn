import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { check, hasContent, main, parseChangelog, parseDate, releaseDateProblem, staleDateWarning, SOURCES } from "../scripts/check-release-version.mjs";

// scripts/check-release-version.mjs is the release guard publish-images.yml runs before it builds anything: on a tag
// with --tag, on a manual run (the dry run) with --rehearse. A v* tag publishes the image and cannot be taken back, so
// the dry run must refuse every state the tag run would refuse. These tests build small repositories in a temporary
// folder (versions, lock, changelog, and git for the tag and branch checks) and run the script's functions and its
// main() against them, and run the version check against this repository itself.

const TODAY = new Date(Date.UTC(2026, 10, 5));
const NOTES = "## Unreleased\n\nNothing yet.\n\n## 0.3.3 — 2026-11-05: a release\n\n- Something changed.\n\n## 0.3.2 — 2026-10-25: before\n\n- Older.\n";

function repo({ version = "0.3.3", versions = {}, changelog = NOTES, git = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "release-guard-"));
  mkdirSync(join(root, "apps", "lab-api"), { recursive: true });
  mkdirSync(join(root, "apps", "lab-web"), { recursive: true });
  for (const file of SOURCES) writeFileSync(join(root, file), JSON.stringify({ name: file, version: versions[file] ?? version }, null, 2));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ name: "x", version: versions.lock ?? version, lockfileVersion: 3, packages: { "": { version: versions.lock ?? version } } }, null, 2));
  if (changelog !== null) writeFileSync(join(root, "CHANGELOG.md"), changelog);
  if (git) {
    const run = (...args) => {
      const r = spawnSync("git", ["-c", "user.email=guard@example.invalid", "-c", "user.name=guard", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    run("init", "-q", "-b", "main");
    run("add", "-A");
    run("commit", "-q", "-m", "reviewed");
    return { root, run };
  }
  return { root };
}

const problems = (opts, argv, env = {}) => {
  const lines = [];
  const code = main(["--root", opts.root, ...argv], { env, log: (l) => lines.push(l), today: TODAY });
  return { code, lines };
};

test("this repository's versions agree (the check every npm test runs)", () => {
  const { lines, code } = problems({ root: "." }, []);
  assert.equal(code, 0, lines.join("\n"));
  assert.match(lines.at(-1), /^release version consistent: \d+\.\d+\.\d+$/);
});

test("a version that differs in one file is refused, naming every file", () => {
  const { root } = repo({ versions: { "apps/lab-api/package.json": "0.3.2" } });
  const { problems: found, version } = check(root);
  assert.equal(version, null);
  assert.ok(found[0].startsWith("the version differs between files (0.3.2, 0.3.3)"), found[0]);
  assert.ok(found.some((p) => p === "apps/lab-api/package.json says 0.3.2"));
  assert.ok(found.some((p) => p === "package-lock.json (root entry) says 0.3.3"));
  rmSync(root, { recursive: true, force: true });
});

test("a lock whose root entry lags the package is refused", () => {
  const { root } = repo({ versions: { lock: "0.3.2" } });
  assert.equal(check(root).version, null);
  rmSync(root, { recursive: true, force: true });
});

test("a pre-release version is refused even when every file agrees", () => {
  const { root } = repo({ version: "0.3.3-rc.1" });
  const { problems: found, version } = check(root);
  assert.equal(version, null);
  assert.match(found[0], /not a plain X\.Y\.Z/);
  rmSync(root, { recursive: true, force: true });
});

test("--tag passes on a tag that matches, with a dated, non-empty section and nothing under Unreleased", () => {
  const { root } = repo();
  for (const tag of ["v0.3.3", "refs/tags/v0.3.3"]) {
    const { code, lines } = problems({ root }, ["--tag", tag]);
    assert.equal(code, 0, lines.join("\n"));
    assert.equal(lines.at(-1), "release version consistent: 0.3.3, tag v0.3.3");
  }
  rmSync(root, { recursive: true, force: true });
});

for (const tag of ["v0.3.2", "v1.0", "0.3.3", "v0.3.3-rc.1", "v0.3.3\nx", "latest", "v9|;etouch${IFS}PWNED;#"]) {
  test(`--tag refuses a tag that is not v + the package version: ${JSON.stringify(tag)}`, () => {
    const { root } = repo();
    const { code, lines } = problems({ root }, ["--tag", tag], { GITHUB_ACTIONS: "true" });
    assert.equal(code, 1);
    assert.ok(lines.some((l) => l.startsWith("::error::tag ")), lines.join("\n"));
    rmSync(root, { recursive: true, force: true });
  });
}

const CASES = [
  ["no section for the version", "## Unreleased\n\nNothing yet.\n\n## 0.3.2 — 2026-10-25: before\n\n- Older.\n", /has no '## 0\.3\.3/],
  ["a section without a date", "## Unreleased\n\n## 0.3.3: a release\n\n- Something.\n", /has no release date/],
  ["a date that does not exist", "## Unreleased\n\n## 0.3.3 — 2026-02-30: x\n\n- Something.\n", /does not exist \(2026-02-30\)/],
  ["a date in the future", "## Unreleased\n\n## 0.3.3 — 2026-11-07: x\n\n- Something.\n", /in the future/],
  ["an empty section", "## Unreleased\n\n## 0.3.3 — 2026-11-05: x\n\n### Fixed\n\n<!-- later -->\n\n## 0.3.2 — 2026-10-25: y\n\n- Older.\n", /section for 0\.3\.3 is empty/],
  ["entries still under Unreleased", "## Unreleased\n\n- Not folded in yet.\n\n## 0.3.3 — 2026-11-05: x\n\n- Something.\n", /still has entries under Unreleased/],
  ["entries under [Unreleased] with brackets", "## [Unreleased]\n\n- Not folded in yet.\n\n## [0.3.3] - 2026-11-05\n\n- Something.\n", /still has entries under Unreleased/],
  ["the version heading twice", "## Unreleased\n\n## 0.3.3 — 2026-11-05: x\n\n- A.\n\n## 0.3.3 — 2026-11-05: again\n\n- B.\n", /more than once/],
];
for (const [what, changelog, expected] of CASES) {
  test(`--tag refuses ${what}`, () => {
    const { root } = repo({ changelog });
    const { code, lines } = problems({ root }, ["--tag", "v0.3.3"]);
    assert.equal(code, 1, lines.join("\n"));
    assert.ok(lines.some((l) => l.startsWith("error: ") && expected.test(l)), lines.join("\n"));
    rmSync(root, { recursive: true, force: true });
  });
}

test("--tag accepts the bracketed heading form, a dated section a day ahead, and Unreleased holding only the placeholder", () => {
  const { root } = repo({ changelog: "## [Unreleased]\n\n_Nothing yet._\n\n## [0.3.3] - 2026-11-06\n\n- Something.\n" });
  const { code, lines } = problems({ root }, ["--tag", "v0.3.3"]);
  assert.equal(code, 0, lines.join("\n"));
  rmSync(root, { recursive: true, force: true });
});

test("a valid date more than a week old is a warning, not a refusal", () => {
  const { root } = repo({ changelog: "## Unreleased\n\n## 0.3.3 — 2026-10-01: x\n\n- Something.\n" });
  const { code, lines } = problems({ root }, ["--tag", "v0.3.3"], { GITHUB_ACTIONS: "true" });
  assert.equal(code, 0, lines.join("\n"));
  assert.ok(lines.some((l) => l.startsWith("::warning::the CHANGELOG.md section for 0.3.3 is dated 2026-10-01, 35 days ago")), lines.join("\n"));
  assert.equal(staleDateWarning("2026-11-01", "0.3.3", TODAY), null);
  rmSync(root, { recursive: true, force: true });
});

test("a missing CHANGELOG.md is refused on a tag and ignored without one", () => {
  const { root } = repo({ changelog: null });
  assert.equal(problems({ root }, []).code, 0);
  const { code, lines } = problems({ root }, ["--tag", "v0.3.3"]);
  assert.equal(code, 1);
  assert.match(lines[0], /^error: cannot read CHANGELOG\.md/);
  rmSync(root, { recursive: true, force: true });
});

test("the changelog parser skips headings inside code fences and HTML comments, and older headings only end a section", () => {
  const text = [
    "## Unreleased",
    "",
    "```md",
    "## 9.9.9 — 2026-01-01: inside a fence",
    "```",
    "<!--",
    "## 8.8.8 — 2026-01-01: inside a comment",
    "-->",
    "",
    "## 0.3.3 — 2026-11-05: a release",
    "",
    "- Something changed.",
    "",
    "[0.3.3]: https://example.invalid/0.3.3",
    "",
    "## Unreleased — 0.3.0 (2026-10-10): an older entry in the repository's own history",
    "",
    "- Not a release section.",
    "",
    "## 0.3.1: before",
    "",
    "- Older.",
  ].join("\n");
  const { sections, duplicates } = parseChangelog(text);
  assert.deepEqual([...sections.keys()], ["Unreleased", "0.3.3", "0.3.1"]);
  assert.deepEqual(duplicates, []);
  assert.equal(sections.get("0.3.3").date, "2026-11-05");
  assert.equal(sections.get("0.3.3").body, "- Something changed.");
  assert.equal(sections.get("0.3.1").date, undefined);
  assert.equal(hasContent("<!--\n## 8.8.8 — 2026-01-01: inside a comment\n-->"), false, "a commented-out line is not a release note");
  assert.equal(hasContent(sections.get("Unreleased").body), true, "a code block under Unreleased is still an entry to fold in");
  assert.equal(hasContent("Nothing yet."), false);
  assert.equal(hasContent("- Nothing yet"), false);
  assert.equal(hasContent("- Nothing yet, except this."), true);
});

test("dates: real calendar dates only, one day of tolerance, and the reason names the version", () => {
  assert.equal(parseDate("2026-11-05").toISOString(), "2026-11-05T00:00:00.000Z");
  assert.equal(parseDate("2026-13-01"), null);
  assert.equal(parseDate("2026-2-3"), null);
  assert.equal(releaseDateProblem("2026-11-06", "0.3.3", TODAY), null);
  assert.match(releaseDateProblem("2026-11-07", "0.3.3", TODAY), /0\.3\.3 is dated 2026-11-07, which is in the future \(today is 2026-11-05\)/);
  assert.match(releaseDateProblem(undefined, "0.3.3", TODAY), /has no release date \(found null\)/);
});

test("--rehearse runs the tag checks against v + the package version and refuses an existing tag", () => {
  const { root, run } = repo({ git: true });
  let r = problems({ root }, ["--rehearse"]);
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.equal(r.lines.at(-1), "release version consistent: 0.3.3, tag v0.3.3");
  run("tag", "v0.3.3");
  r = problems({ root }, ["--rehearse"]);
  assert.equal(r.code, 1);
  assert.ok(r.lines.some((l) => l === "error: the tag v0.3.3 already exists: this version was released (or burned); raise the version everywhere first"), r.lines.join("\n"));
  rmSync(root, { recursive: true, force: true });
});

test("--rehearse is red for the same changelog states the tag is red for", () => {
  const { root } = repo({ git: true, changelog: "## Unreleased\n\n- Not folded in yet.\n\n## 0.3.3 — 2026-11-05: x\n\n- Something.\n" });
  const { code, lines } = problems({ root }, ["--rehearse"]);
  assert.equal(code, 1);
  assert.ok(lines.some((l) => /still has entries under Unreleased/.test(l)), lines.join("\n"));
  rmSync(root, { recursive: true, force: true });
});

test("--ancestor-of refuses a commit that has not reached the named branch, in both modes", () => {
  const { root, run } = repo({ git: true });
  for (const mode of [["--rehearse"], ["--tag", "v0.3.3"]]) {
    const ok = problems({ root }, [...mode, "--ancestor-of", "main"]);
    assert.equal(ok.code, 0, ok.lines.join("\n"));
  }
  run("checkout", "-q", "-b", "topic");
  run("commit", "-q", "--allow-empty", "-m", "unreviewed");
  const sha = run("rev-parse", "HEAD");
  for (const mode of [["--rehearse"], ["--tag", "v0.3.3"]]) {
    const r = problems({ root }, [...mode, "--ancestor-of", "main"]);
    assert.equal(r.code, 1);
    assert.ok(r.lines.some((l) => l === `error: commit ${sha.slice(0, 12)} is not on main: release only commits that reached the protected branch`), r.lines.join("\n"));
  }
  // GITHUB_SHA names the commit the run was started for, as it does under Actions
  const r = problems({ root }, ["--tag", "v0.3.3", "--ancestor-of", "main"], { GITHUB_SHA: run("rev-parse", "main") });
  assert.equal(r.code, 0, r.lines.join("\n"));
  rmSync(root, { recursive: true, force: true });
});

test("--tag and --rehearse exclude each other, and an unknown flag is refused", () => {
  for (const argv of [["--tag", "v0.3.3", "--rehearse"], ["--bogus"], ["--tag"]]) {
    const { code, lines } = problems({ root: "." }, argv, { GITHUB_ACTIONS: "true" });
    assert.equal(code, 1);
    assert.match(lines[0], /^::error::/);
  }
});

test("the script runs from the command line with no dependency and prints Actions annotations under GITHUB_ACTIONS", () => {
  const { root } = repo({ versions: { "repository.manifest.json": "0.0.1" } });
  const r = spawnSync(process.execPath, ["scripts/check-release-version.mjs", "--root", root], { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true" } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^::error::the version differs between files \(0\.0\.1, 0\.3\.3\)/m);
  rmSync(root, { recursive: true, force: true });
});
