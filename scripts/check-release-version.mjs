#!/usr/bin/env node
// Checks that every place that names this edition's version agrees, before a tag can make a mistake permanent.
//
// Why this exists: a `v*` tag runs .github/workflows/publish-images.yml, which publishes the lab image to Docker Hub,
// and a published tag cannot be taken back. A tag that disagrees with the version in the code, or a release whose
// notes are still under `## Unreleased`, is therefore a permanent mistake. On 2026-11-04 a sister repository
// (HCW-CloudAssessor_App, pull request 88) burned a tag that way: its dry run was green because it never read the
// changelog, and the tag run refused the same commit. So this script runs the SAME checks on the dry run and on the
// tag (the Cloud Crawler add-on's scripts/check_release_version.py, carried to this Node repository). Three modes,
// node: built-ins only (no dependency, nothing from node_modules, no network):
//
//   node scripts/check-release-version.mjs
//       package.json, apps/lab-api/package.json, apps/lab-web/package.json, repository.manifest.json and the root
//       entry of package-lock.json must carry the same plain X.Y.Z. (tests/check-release-version.test.mjs runs this
//       on every `npm test`.)
//   node scripts/check-release-version.mjs --tag vX.Y.Z [--ancestor-of origin/main]
//       publish-images.yml on a tag: the same, plus the tag must be `v` + that version; CHANGELOG.md must have a
//       dated (a real calendar date, not in the future), non-empty `## X.Y.Z — YYYY-MM-DD: …` section (the bracketed
//       `## [X.Y.Z] - YYYY-MM-DD` form is accepted too), no duplicate version heading, and nothing under
//       `## Unreleased` except the placeholder "Nothing yet.", so the release notes are complete. With --ancestor-of,
//       the commit must already be reachable from that ref (only reviewed commits are released).
//   node scripts/check-release-version.mjs --rehearse [--ancestor-of origin/main]
//       publish-images.yml started by hand (the dry run before a tag): the tag is taken to be `v` + the package
//       version and every check of the --tag mode runs, so the dry run is red for every state this script would
//       refuse the tag for. Because there is no tag yet, it also fails when that tag already exists (a released or
//       burned version must move on).
//
// A release date that is valid but more than a week old only prints a warning (the release page would show it); the
// date is refused only when it does not exist or is in the future.
//
// Exit 0 when everything agrees, 1 with one line per problem otherwise (`::error::` annotations under Actions).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// Every file that carries the edition version. tests/version-alignment.test.mjs pins the first four to each other;
// the lock's root entry is what `npm ci` and the image build read.
export const SOURCES = ["package.json", "apps/lab-api/package.json", "apps/lab-web/package.json", "repository.manifest.json"];
export const LOCK_LABEL = "package-lock.json (root entry)";
export const UNRELEASED = "Unreleased";
// `## 0.3.3 — 2026-11-05: title`, `## [0.3.3] - 2026-11-05`, `## 0.3.1: title` (no date; refused for a release).
// The heading `## Unreleased — 0.3.0 (2026-10-10): …` of an older entry matches neither pattern and only ends a section.
const HEADING = /^##[ \t]+\[?(\d+\.\d+\.\d+)\]?(?:[ \t]+[-—–][ \t]+([^\s:]+))?(?::.*)?[ \t]*$/;
const UNRELEASED_HEADING = /^##[ \t]+\[?unreleased\]?[ \t]*$/i;
// The one line an empty Unreleased section may hold, so the heading is never left dangling.
const PLACEHOLDER = /^[-*_ \t]*nothing yet\.?[_ \t]*$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:[ \t]*\S+.*$/;
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const DAY = 24 * 60 * 60 * 1000;
// A release may be dated "today" in a time zone ahead of the runner's UTC clock, so one day ahead is tolerated.
const FUTURE_TOLERANCE_DAYS = 1;
// An old date is only advisory: the release page would show it, so say so, but do not refuse the release.
const STALE_AFTER_DAYS = 7;

export class ReleaseError extends Error {}

function readJson(root, relative) {
  return JSON.parse(readFileSync(`${root}/${relative}`, "utf8"));
}

// Returns { found: { label: version }, problems: [] } for every source that could be read.
export function readVersions(root) {
  const found = {};
  const problems = [];
  for (const relative of SOURCES) {
    try {
      const version = readJson(root, relative).version;
      if (typeof version === "string" && version) found[relative] = version;
      else problems.push(`no version found in ${relative}`);
    } catch (err) {
      problems.push(`cannot read ${relative}: ${err.message}`);
    }
  }
  try {
    const version = readJson(root, "package-lock.json").packages?.[""]?.version;
    if (typeof version === "string" && version) found[LOCK_LABEL] = version;
    else problems.push(`no version found in ${LOCK_LABEL}`);
  } catch (err) {
    problems.push(`cannot read package-lock.json: ${err.message}`);
  }
  return { found, problems };
}

// Maps each release heading to { date, body } and lists the headings that appear more than once. Headings inside
// code fences (backticks or tildes, closed the way CommonMark closes them) and inside HTML comments are ignored.
// Trailing link reference definitions (`[0.1.0]: https://…`) are not part of the last section's body. The first of
// two equal headings is kept; the duplicate is reported, never silently preferred.
export function parseChangelog(text) {
  const sections = new Map();
  const duplicates = new Set();
  let current = null;
  let fence = null;
  let inComment = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (inComment) {
      inComment = !line.includes("-->");
      current?.push(line);
      continue;
    }
    const opened = FENCE.exec(line);
    if (fence) {
      if (opened && opened[1][0] === fence.mark && opened[1].length >= fence.length && !opened[2].trim()) fence = null;
      current?.push(line);
      continue;
    }
    if (opened && !(opened[1][0] === "`" && opened[2].includes("`"))) {
      fence = { mark: opened[1][0], length: opened[1].length };
      current?.push(line);
      continue;
    }
    const open = line.lastIndexOf("<!--");
    if (open >= 0 && !line.slice(open).includes("-->")) inComment = true;
    const match = HEADING.exec(line);
    const name = match ? match[1] : UNRELEASED_HEADING.test(line) ? UNRELEASED : null;
    if (name) {
      if (sections.has(name)) {
        duplicates.add(name);
        current = null;
      } else {
        current = [];
        sections.set(name, { date: match ? match[2] : undefined, body: current });
      }
    } else if (line.startsWith("## ")) {
      current = null;
    } else {
      current?.push(line);
    }
  }
  for (const section of sections.values()) section.body = trim(section.body);
  return { sections, duplicates: [...duplicates].sort() };
}

// The section text without the blank lines around it and without trailing link reference definitions.
function trim(lines) {
  const body = [...lines];
  while (body.length && (!body[body.length - 1].trim() || LINK_DEFINITION.test(body[body.length - 1]))) body.pop();
  return body.join("\n").replace(/^\n+/, "");
}

// True when a section holds more than empty sub-headings, the "Nothing yet." placeholder, HTML comments and link
// reference definitions: none of those is a release note.
export function hasContent(body) {
  return body
    .replace(HTML_COMMENT, "")
    .split("\n")
    .some((line) => line.trim() && !line.startsWith("#") && !LINK_DEFINITION.test(line) && !PLACEHOLDER.test(line));
}

// The UTC calendar date `YYYY-MM-DD` names, or null when the text is not a real date.
export function parseDate(text) {
  const match = DATE.exec(text ?? "");
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date : null;
}

export function utcToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Null when `date` is a real calendar date that is not in the future, otherwise the reason it is refused.
export function releaseDateProblem(date, version, today) {
  if (!date || !DATE.test(date)) return `the CHANGELOG.md section for ${version} has no release date (found ${JSON.stringify(date ?? null)})`;
  const released = parseDate(date);
  if (!released) return `the CHANGELOG.md section for ${version} has a date that does not exist (${date})`;
  if (released.getTime() > today.getTime() + FUTURE_TOLERANCE_DAYS * DAY) {
    return `the CHANGELOG.md section for ${version} is dated ${date}, which is in the future (today is ${today.toISOString().slice(0, 10)})`;
  }
  return null;
}

// A sentence when the release date is valid but more than STALE_AFTER_DAYS old, otherwise null.
export function staleDateWarning(date, version, today) {
  const released = parseDate(date);
  if (!released) return null;
  const age = Math.floor((today.getTime() - released.getTime()) / DAY);
  if (age <= STALE_AFTER_DAYS) return null;
  return `the CHANGELOG.md section for ${version} is dated ${date}, ${age} days ago: the release page will show that date. Change it to the day you tag, or leave it if it is right`;
}

// Everything in CHANGELOG.md that would make the release notes for `version` wrong or incomplete.
export function changelogProblems(root, version, today) {
  let parsed;
  try {
    parsed = parseChangelog(readFileSync(`${root}/CHANGELOG.md`, "utf8"));
  } catch (err) {
    return [`cannot read CHANGELOG.md: ${err.message}`];
  }
  const { sections, duplicates } = parsed;
  const problems = duplicates.map((name) => `CHANGELOG.md has the heading '## ${name}' more than once: which one is the release?`);
  const section = sections.get(version);
  const dateProblem = section && releaseDateProblem(section.date, version, today);
  if (!section) problems.push(`CHANGELOG.md has no '## ${version} — YYYY-MM-DD: …' section`);
  else if (dateProblem) problems.push(dateProblem);
  else if (!hasContent(section.body)) problems.push(`the CHANGELOG.md section for ${version} is empty`);
  const unreleased = sections.get(UNRELEASED);
  if (unreleased && hasContent(unreleased.body)) problems.push("CHANGELOG.md still has entries under Unreleased: fold them into the release section");
  return problems;
}

function git(root, ...args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

// Null when `sha` is reachable from `ref`, otherwise the reason it is not.
export function onBranch(sha, ref, root) {
  const result = git(root, "merge-base", "--is-ancestor", sha, ref);
  if (result.status === 0) return null;
  if (result.status === 1) return `commit ${sha.slice(0, 12)} is not on ${ref}: release only commits that reached the protected branch`;
  return `could not compare ${sha.slice(0, 12)} with ${ref}: ${(result.stderr || "").trim() || "git failed"}`;
}

// Null when no tag of that name exists in the checkout, otherwise the reason the rehearsal must stop.
export function tagExists(tag, root) {
  const result = git(root, "rev-parse", "--quiet", "--verify", `refs/tags/${tag}`);
  if (result.status === 0) return `the tag ${tag} already exists: this version was released (or burned); raise the version everywhere first`;
  if (result.status === 1) return null;
  return `could not look up the tag ${tag}: ${(result.stderr || "").trim() || "git failed"}`;
}

// Returns { problems, version }. `version` is null when the sources disagree so much that none can be trusted.
export function check(root, tag = null, today = utcToday()) {
  const { found, problems } = readVersions(root);
  const distinct = [...new Set(Object.values(found))].sort();
  if (distinct.length > 1) {
    problems.unshift(`the version differs between files (${distinct.join(", ")})`);
    for (const [label, version] of Object.entries(found)) problems.push(`${label} says ${version}`);
  }
  let version = distinct.length === 1 ? distinct[0] : null;
  if (version !== null && !VERSION.test(version)) {
    problems.push(`version '${version}' is not a plain X.Y.Z (pre-release tags are not supported here)`);
    version = null;
  }
  if (tag !== null) {
    const bare = tag.startsWith("refs/tags/") ? tag.slice("refs/tags/".length) : tag;
    if (!TAG.test(bare)) problems.push(`tag '${bare}' is not v followed by X.Y.Z`);
    else if (version !== null && bare !== `v${version}`) problems.push(`tag ${bare} does not match the package version ${version}`);
    if (version !== null) problems.push(...changelogProblems(root, version, today));
  }
  return { problems, version };
}

function parseArgs(argv) {
  const opts = { tag: null, rehearse: false, ancestorOf: null, root: "." };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new ReleaseError(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--tag") opts.tag = value();
    else if (arg === "--rehearse") opts.rehearse = true;
    else if (arg === "--ancestor-of") opts.ancestorOf = value();
    else if (arg === "--root") opts.root = value();
    else throw new ReleaseError(`usage: check-release-version.mjs [--tag vX.Y.Z | --rehearse] [--ancestor-of REF] [--root DIR] (got ${arg})`);
  }
  if (opts.tag !== null && opts.rehearse) throw new ReleaseError("--tag and --rehearse exclude each other");
  return opts;
}

// `env` and `log` are parameters so the tests can run this without GitHub's own GITHUB_SHA and without a process.
export function main(argv, { env = process.env, log = console.log, today = utcToday() } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (!(err instanceof ReleaseError)) throw err;
    log(`::error::${err.message}`);
    return 1;
  }
  const github = env.GITHUB_ACTIONS === "true";
  const say = (level, text) => log(github ? `::${level}::${text}` : `${level}: ${text}`);
  let tag = opts.tag;
  if (opts.rehearse) {
    const probe = check(opts.root).version;
    tag = probe ? `v${probe}` : null;
  }
  const { problems, version } = check(opts.root, tag, today);
  if (opts.rehearse && version) {
    const reason = tagExists(`v${version}`, opts.root);
    if (reason) problems.push(reason);
  }
  if (tag && opts.ancestorOf && version) {
    const sha = env.GITHUB_SHA || (git(opts.root, "rev-parse", "HEAD").stdout || "").trim();
    const reason = sha ? onBranch(sha, opts.ancestorOf, opts.root) : "could not read the commit to check (no GITHUB_SHA and git rev-parse HEAD printed nothing)";
    if (reason) problems.push(reason);
  }
  if (tag && version && problems.length === 0) {
    let date;
    try {
      date = parseChangelog(readFileSync(`${opts.root}/CHANGELOG.md`, "utf8")).sections.get(version)?.date;
    } catch {
      date = undefined;
    }
    const stale = staleDateWarning(date, version, today);
    if (stale) say("warning", stale);
  }
  for (const problem of problems) say("error", problem);
  if (problems.length) return 1;
  const bare = tag ? tag.replace(/^refs\/tags\//, "") : null;
  log(`release version consistent: ${version}${bare ? `, tag ${bare}` : ""}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
