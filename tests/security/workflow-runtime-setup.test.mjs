import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every workflow job that runs Node.js or Python chooses its version (saulpatinojr/HCW-HybridCloudWorks#1707).
//
// A job that runs `node`, `npm`, `npx`, `python3`, `pip`, `uv` or `uvx` without actions/setup-node or
// actions/setup-python gets whatever the runner image ships: on ubuntu-26.04 that was Node.js 24 and Python 3.14 in
// November 2026, both below the program's floors (Node.js 26, Python 3.15). Nothing else notices, because a job that
// names no version has nothing to read. This is a port of the website's check (scripts/workflow-runtime-setup.test.mjs
// in HCW-HybridCloudWorks); the three Python add-ons carry the same check as
// tests/security/test_workflow_runtime_setup.py. `uv` and `uvx` count as Python, as in the App repositories, because
// without setup-python uv picks the runner's own.
//
// A command counts when it is in command position on a line of a `run:` step: at the start, after `$(`, `<(`, a
// backtick, `(`, `{`, `|`, `&` or `;`, after leading `NAME=value` assignments, or after a word that runs the next one
// (`env`, `sudo`, `xargs`, `exec`, `time`, `!`, `if`, `then`, `do` and the like). It does not count inside a quoted
// string (unless a double-quoted string runs a command with `$(`, `<(` or a backtick) or as an argument (`docker run
// image python ...`). The set-up step must come before the first such step. Limits, on purpose: a job that runs in a
// `container:` uses that image's runtime and is not checked; and a script a step calls (a `.sh` file) is not read.
//
// A set-up step with its own `if:` may be skipped while a later command still runs on the runner's own interpreter
// (Copilot on HCW-NetworkEyes_AddOn#100), so it covers a later step only when that step's `if:` is the same condition,
// or is one of the terms the set-up's condition joins with a top-level `||` (whenever that step runs, so did the
// set-up). Conditions are compared without a surrounding `${{ }}`, with runs of spaces made one, and a term without
// one pair of parentheses around the whole of it. A set-up step with no `if:` covers every later step. A job's own
// `if:` does not matter here, because it decides whether every step of the job runs, alike.
//
// Each set-up step must also ask for the floor or newer (Copilot on HCW-CloudCrawler_App#81): `python-version` or
// `python-version-file`, `node-version` or `node-version-file`, read through `${{ env.X }}` (the step's, job's or
// workflow's `env:`), `${{ matrix.X }}` (every entry of the job's matrix list) and the named file. A value this test
// cannot work out fails it, naming the step, rather than passing unchecked.
//
// The workflows are read with a small line reader rather than a YAML library, because none is a dependency here. It
// relies on the layout every workflow in this repository has (a `jobs:` key at the top level, a `steps:` list, block
// `run: |` scripts, `with:` and `env:` written `{ ... }` or as indented `key: value` lines); a file it cannot read that
// way fails the test rather than being skipped.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

// Steps that use the runner's own interpreter on purpose, each with its reason, keyed by
// "file > job > step name > runtime". Keyed by step, not job, so a new step in the same job is still checked. A new
// entry needs a reason a reviewer can check, and a comment above the step in the workflow saying the same.
const RUNNER_DEFAULT_ALLOWED = {};

// Where a command may start: the line's start or an opening or joining character, then any `NAME=value` assignments
// and words that run the next word (`env FOO=1 node`, `sudo node`, `if node ...; then`).
const START = String.raw`(?:^|[$<]\(\s*|\`\s*|[({|;&]\s*)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+|(?:env|sudo|xargs|exec|time|nice|command|if|then|else|elif|do|while|until|!)\s+)*`;
const COMMAND = {
  node: new RegExp(`${START}(?:node|npm|npx)(?=\\s|$)`),
  python: new RegExp(`${START}(?:python(?:3(?:\\.\\d+)?)?|pip3?|uvx?)(?=\\s|$)`),
};
const SETUP = { node: /^actions\/setup-node@/, python: /^actions\/setup-python@/ };

// The lowest versions a set-up step may ask for. The program's floors are kept in scripts/version-floors.json in
// HCW-HybridCloudWorks; change them there first, then here.
const PYTHON_FLOOR = [3, 15];
const NODE_FLOOR = 26;
// The set-up step's inputs that name the version, directly or through a file in the repository.
const VERSION_INPUTS = {
  python: ["python-version", "python-version-file"],
  node: ["node-version", "node-version-file"],
};

// The line with the text of its quoted strings taken out, so words in a message (`echo "...; if pip named..."`) do not
// count. A double-quoted string that runs a command (`"$(node x)"`, or the older "`node x`") is kept. An escaped
// backtick (`\``, as in Markdown written to the step summary) is a plain character, so it is dropped first.
const withoutQuotedText = (line) =>
  line
    .replace(/\\`/g, "")
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, (q) => (/[$<]\(|`/.test(q) ? q : '""'));

/** True when a run script calls the runtime in command position on a line that is not a comment. */
export function runsRuntime(run, kind) {
  return String(run ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .some((line) => COMMAND[kind].test(withoutQuotedText(line)));
}

const indentOf = (line) => line.length - line.trimStart().length;
const meaningful = (line) => line.trim() !== "" && !line.trimStart().startsWith("#");
const unquote = (value) => {
  const v = value.trim();
  return v.length >= 2 && v[0] === v.at(-1) && `'"`.includes(v[0]) ? v.slice(1, -1) : v;
};
// The common leading spaces of the non-blank lines removed, as Python's textwrap.dedent does.
const dedent = (lines) => {
  const width = Math.min(...lines.filter((l) => l.trim()).map(indentOf));
  return lines.map((l) => (l.trim() ? l.slice(width) : "")).join("\n");
};

const withoutComment = (text) => text.replace(/\s+#.*$/, "");

/** A one-line `{ key: value, ... }` mapping, split on the commas outside quotes and `${{ }}`. */
function flowMapping(text) {
  const inner = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
  const parts = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  const mapping = {};
  for (const part of parts.filter((p) => p.trim())) {
    const colon = part.indexOf(":");
    mapping[part.slice(0, colon).trim()] = unquote(part.slice(colon + 1));
  }
  return mapping;
}

/** The lines under the key on line `at` (at `indent` spaces), up to the next line at that indent or less. */
function blockUnder(lines, at, indent) {
  const block = [];
  for (const line of lines.slice(at + 1)) {
    if (meaningful(line) && indentOf(line) <= indent) break;
    block.push(line);
  }
  return block;
}

/** The mapping under the key on line `at`: a `{ ... }` on the same line, or the `key: value` lines below it. */
function mappingAt(lines, at, indent) {
  const rest = withoutComment(lines[at].slice(lines[at].indexOf(":") + 1)).trim();
  if (rest.startsWith("{")) return flowMapping(rest);
  const block = blockUnder(lines, at, indent);
  const keyed = block.filter(meaningful);
  const inner = keyed.length ? Math.min(...keyed.map(indentOf)) : indent + 2;
  const mapping = {};
  for (const line of block) {
    const m = line.match(new RegExp(`^ {${inner}}([A-Za-z0-9_.-]+):[ \\t]*(.*)$`));
    if (m) mapping[m[1]] = unquote(withoutComment(m[2]));
  }
  return mapping;
}

/** The lists of a job's `strategy: matrix:`, each written `[a, b]` or as `- a` lines; {} when it has none. */
function matrixOf(job, keyIndent) {
  const strategy = job.findIndex((line) => new RegExp(`^ {${keyIndent}}strategy:\\s*(?:#.*)?$`).test(line));
  if (strategy === -1) return {};
  const block = blockUnder(job, strategy, keyIndent);
  const at = block.findIndex((line) => /^\s+matrix:\s*(?:#.*)?$/.test(line));
  if (at === -1) return {};
  const lines = blockUnder(block, at, indentOf(block[at]));
  const keyed = lines.filter(meaningful);
  const inner = keyed.length ? Math.min(...keyed.map(indentOf)) : 0;
  const found = {};
  lines.forEach((line, i) => {
    const m = line.match(new RegExp(`^ {${inner}}([A-Za-z0-9_-]+):[ \\t]*(.*)$`));
    if (!m) return;
    const rest = withoutComment(m[2]).trim();
    found[m[1]] = rest.startsWith("[")
      ? rest
          .replace(/^\[|\]$/g, "")
          .split(",")
          .filter((v) => v.trim())
          .map(unquote)
      : blockUnder(lines, i, inner)
          .filter((item) => item.trim().startsWith("- "))
          .map((item) => unquote(item.trim().slice(2)));
  });
  return found;
}

/**
 * Every key of one step, among them `name`, `uses`, `run`, `if`, and `with` and `env` as mappings (its first line's
 * `- ` already turned into spaces).
 */
function stepKeys(lines, keyIndent) {
  const keys = {};
  const keyLine = new RegExp(`^ {${keyIndent}}([A-Za-z_-]+):[ \\t]*(.*)$`);
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(keyLine);
    i += 1;
    if (!match) continue;
    const [, key, rest] = match;
    if (key === "with" || key === "env") {
      keys[key] = mappingAt(lines, i - 1, keyIndent);
      i += blockUnder(lines, i - 1, keyIndent).length;
    } else if (/^[|>][+-]?\d?\s*(?:#.*)?$/.test(rest)) {
      const block = [];
      while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > keyIndent)) block.push(lines[i++]);
      keys[key] = block.some((l) => l.trim()) ? dedent(block).replace(/^\n+|\n+$/g, "") : "";
    } else if (key === "uses") {
      keys[key] = rest.split(/\s+/)[0] ?? "";
    } else {
      keys[key] = unquote(key === "run" ? rest : withoutComment(rest));
    }
  }
  return keys;
}

/**
 * Every job of a workflow: {name: {container, env, matrix, steps: [{name, uses, run, if, with, env}, ...]}}. A job's
 * `env` holds the workflow's `env:` with the job's own on top.
 */
export function readJobs(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const topEnv = lines.findIndex((line) => /^env:\s*(?:#.*)?$|^env:\s*\{/.test(line));
  const workflowEnv = topEnv === -1 ? {} : mappingAt(lines, topEnv, 0);
  const starts = lines.flatMap((line, i) => (/^jobs:\s*(?:#.*)?$/.test(line) ? [i] : []));
  assert.equal(starts.length, 1, "expected one top-level jobs: key");
  const body = [];
  for (const line of lines.slice(starts[0] + 1)) {
    if (meaningful(line) && indentOf(line) === 0) break;
    body.push(line);
  }
  const jobIndent = Math.min(...body.filter(meaningful).map(indentOf));
  const heads = body.flatMap((line, i) => (meaningful(line) && indentOf(line) === jobIndent ? [i] : []));
  const jobs = {};
  heads.forEach((head, n) => {
    const match = body[head].match(new RegExp(`^ {${jobIndent}}([A-Za-z0-9_-]+):\\s*(?:#.*)?$`));
    assert.ok(match, `cannot read the job line ${JSON.stringify(body[head])}`);
    const job = body.slice(head + 1, n + 1 < heads.length ? heads[n + 1] : body.length);
    const keyLines = job.filter(meaningful);
    const keyIndent = keyLines.length ? Math.min(...keyLines.map(indentOf)) : jobIndent + 2;
    const container = job.some((line) => new RegExp(`^ {${keyIndent}}container:`).test(line));
    const envAt = job.findIndex((line) => new RegExp(`^ {${keyIndent}}env:`).test(line));
    const env = { ...workflowEnv, ...(envAt === -1 ? {} : mappingAt(job, envAt, keyIndent)) };
    const stepsAt = job.findIndex((line) => new RegExp(`^ {${keyIndent}}steps:\\s*(?:#.*)?$`).test(line));
    const steps = [];
    if (stepsAt !== -1) {
      const rest = job.slice(stepsAt + 1);
      const first = rest.find(meaningful);
      assert.ok(first?.trimStart().startsWith("- "), `job ${match[1]}: steps: is not a list`);
      const dash = indentOf(first);
      let current = null;
      for (const line of rest) {
        if (meaningful(line) && (indentOf(line) < dash || (indentOf(line) === dash && !line.trimStart().startsWith("- ")))) break;
        if (meaningful(line) && indentOf(line) === dash) {
          if (current) steps.push(stepKeys(current, dash + 2));
          current = [" ".repeat(dash + 2) + line.slice(dash + 2)];
        } else if (current) {
          current.push(line);
        }
      }
      if (current) steps.push(stepKeys(current, dash + 2));
    }
    jobs[match[1]] = { container, env, matrix: matrixOf(job, keyIndent), steps };
  });
  return jobs;
}

/** An `if:` expression without a surrounding `${{ }}` and with runs of spaces made one. */
const normalized = (expression) =>
  expression
    .trim()
    .replace(/^\$\{\{([\s\S]*)\}\}$/, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** The term without one pair of parentheses, when that pair encloses the whole of it. */
function withoutOuterParentheses(term) {
  if (!(term.startsWith("(") && term.endsWith(")"))) return term;
  let depth = 0;
  for (let i = 0; i < term.length; i += 1) {
    if (term[i] === "(") depth += 1;
    if (term[i] === ")") depth -= 1;
    if (depth === 0 && i < term.length - 1) return term;
  }
  return term.slice(1, -1).trim();
}

/** The terms an expression joins with `||` outside parentheses and quotes; one item when there is no such `||`. */
function topLevelOrTerms(expression) {
  const terms = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (depth === 0 && expression.startsWith("||", i)) {
      terms.push(expression.slice(start, i));
      start = i + 2;
      i += 1;
    }
  }
  terms.push(expression.slice(start));
  return terms.map((term) => withoutOuterParentheses(term.trim()));
}

/** A step's `if:` as one comparable expression ("" when it has none). */
export const condition = (step) => normalized(String(step?.if ?? ""));

/**
 * True when a set-up step runs whenever the later step does: it has no `if:`, the same `if:`, or an `if:` whose
 * top-level `||` terms include the later step's.
 */
export function covers(setup, step) {
  const wanted = condition(step);
  const given = condition(setup);
  return given === "" || given === wanted || topLevelOrTerms(given).includes(wanted);
}

/**
 * The steps of one workflow that run a runtime before (or without) setting it up: "file > job > step > kind". A step
 * needs an earlier set-up step that covers it (see `covers`).
 */
export function unsetSteps(file, jobs) {
  const found = [];
  for (const [name, job] of Object.entries(jobs)) {
    if (job.container) continue;
    for (const kind of Object.keys(COMMAND)) {
      job.steps.forEach((step, i) => {
        if (!runsRuntime(step.run, kind)) return;
        const covered = job.steps
          .slice(0, i)
          .some((earlier) => SETUP[kind].test(earlier.uses ?? "") && covers(earlier, step));
        if (!covered) found.push(`${file} > ${name} > ${step.name || `step ${i + 1}`} > ${kind}`);
      });
    }
  }
  return found;
}

/**
 * The plain values an input stands for: itself, or what `${{ env.X }}` (the step's, job's or workflow's `env:`) or
 * `${{ matrix.X }}` (every entry of the job's matrix list) holds. null when it cannot be worked out here.
 */
function resolved(value, step, job, depth = 0) {
  const found = String(value)
    .trim()
    .match(/^\$\{\{\s*(env|matrix)\.([A-Za-z0-9_-]+)\s*\}\}$/);
  if (!found) return String(value).includes("${{") ? null : [String(value).trim()];
  const [, source, name] = found;
  if (source === "env") {
    const env = { ...(job.env ?? {}), ...(step.env ?? {}) };
    return name in env && depth < 5 ? resolved(env[name], step, job, depth + 1) : null;
  }
  return job.matrix?.[name]?.length ? job.matrix[name] : null;
}

/** The versions a set-up step asks for, read through `env`, `matrix` and a version file; null when unreadable. */
export function requestedVersions(step, job, root = ROOT) {
  const [direct, fromFile] = VERSION_INPUTS[SETUP.python.test(step.uses ?? "") ? "python" : "node"];
  const given = step.with ?? {};
  if (direct in given) return resolved(given[direct], step, job);
  if (!(fromFile in given)) return null;
  const paths = resolved(given[fromFile], step, job) ?? [];
  if (paths.length !== 1 || !existsSync(join(root, paths[0]))) return null;
  const lines = readFileSync(join(root, paths[0]), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return lines.length ? lines : null;
}

/** true when the version is under the floor, false when at or above it, null when it is not a version number. */
function belowFloor(version, kind) {
  if (kind === "python") {
    const found = version.match(/^(\d+)\.(\d+)(?!\d)/);
    if (!found) return null;
    const [major, minor] = [Number(found[1]), Number(found[2])];
    return major < PYTHON_FLOOR[0] || (major === PYTHON_FLOOR[0] && minor < PYTHON_FLOOR[1]);
  }
  const found = version.match(/^v?(\d+)(?!\d)/);
  return found ? Number(found[1]) < NODE_FLOOR : null;
}

/** Every set-up step that asks for a version below the floor, or one this test cannot read, with the reason. */
export function floorProblems(file, jobs, root = ROOT) {
  const problems = [];
  for (const [name, job] of Object.entries(jobs)) {
    job.steps.forEach((step, i) => {
      for (const kind of Object.keys(COMMAND)) {
        if (!SETUP[kind].test(step.uses ?? "")) continue;
        const label = `${file} > ${name} > ${step.name || `step ${i + 1}`} > ${kind}`;
        const versions = requestedVersions(step, job, root);
        if (!versions) problems.push(`${label}: cannot work out the version it asks for`);
        for (const version of versions ?? []) {
          const below = belowFloor(version, kind);
          if (below === null) problems.push(`${label}: '${version}' is not a version number this test can compare`);
          else if (below) problems.push(`${label}: asks for ${version}, below the floor`);
        }
      }
    });
  }
  return problems;
}

test("runsRuntime finds node and python in command position", () => {
  const node = [
    'token="$(node scripts/github-app-token.mjs)"',
    "npm ci --no-audit",
    "FOO=1 node x",
    "env FOO=1 node x",
    "sudo node x",
    "xargs node x",
    "diff a <(node x)",
    "(node x)",
    "if node x; then",
    "! node x",
    "time node x",
    "exec node x",
    "cd y && npm ci",
    'echo "`node --version`"',
  ];
  for (const line of node) assert.equal(runsRuntime(line, "node"), true, line);
  const python = [
    "cat x | python3 -I check.py",
    "python3.15 -I x.py",
    'compare_out="$(python3 -I scripts/follow_website_base.py --check)"',
    "python -m pip install uv",
    "python3 -m venv zizmor-env",
    "version=`python3 scripts/check.py`",
    'echo "`python3 --version`"',
    "uv sync --frozen",
    "uvx zizmor .github",
  ];
  for (const line of python) assert.equal(runsRuntime(line, "python"), true, line);
});

test("runsRuntime does not count words that are not commands", () => {
  const cases = [
    ['echo "run \\`node scripts/x.mjs\\` by hand"', "node"],
    ['docker run --rm img python -c "import azure"', "python"],
    ["/opt/az/bin/python3 -Im pip check", "python"],
    ["# node is not run here", "node"],
    ['for node in items["nodes"]:', "node"],
    ['echo "$NODE_VERSION"', "node"],
    ["nodes=3 nodejs-check", "node"],
    ['echo "the stage is wrong; if pip named the file differently, look"', "python"],
    ["zizmor-env/bin/python -m pip install zizmor", "python"],
    ["echo 'literal `python3` text'", "python"],
    ["uvicorn app:main", "python"],
  ];
  for (const [line, kind] of cases) assert.equal(runsRuntime(line, kind), false, line);
});

test("a job that sets the runtime up late or never is flagged", () => {
  const text = [
    "name: x",
    "on: push",
    "jobs:",
    "  late:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - name: Early",
    "        run: node a.mjs",
    "      - uses: actions/setup-node@abc # v7",
    "  none:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - run: python3 b.py",
    "  other-setup:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: astral-sh/setup-uv@abc",
    "      # A comment between steps does not end the list.",
    "      - name: Run",
    "        run: |",
    "          set -e",
    "          python3 c.py",
    "  good:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-node@abc",
    "      - run: node a.mjs",
    "  boxed:",
    "    runs-on: ubuntu-26.04",
    "    container: node:26",
    "    steps:",
    "      - run: node a.mjs",
    "",
  ].join("\n");
  assert.deepEqual(unsetSteps("x.yml", readJobs(text)), [
    "x.yml > late > Early > node",
    "x.yml > none > step 1 > python",
    "x.yml > other-setup > Run > python",
  ]);
});

test("a set-up step with its own condition covers only steps it always runs before", () => {
  const text = [
    "name: x",
    "on: push",
    "jobs:",
    "  skipped:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-python@abc",
    "        if: false",
    "      - name: Run",
    "        run: python3 a.py",
    "  same-condition:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-python@abc",
    "        if: ${{ !cancelled() }}",
    "      - name: Run",
    '        if: "!cancelled()"',
    "        run: python3 a.py",
    "  unconditional-setup:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-python@abc",
    "      - name: Run",
    "        if: failure()",
    "        run: python3 a.py",
    "  other-condition:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-python@abc",
    "        if: github.event_name == 'push'",
    "      - name: Run",
    "        if: failure()",
    "        run: python3 a.py",
    "  or-term:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-node@abc",
    "        if: matrix.relevant == 'true' || (matrix.name == 'scripts (operations)')",
    "      - name: Run",
    "        if: matrix.name == 'scripts (operations)'",
    "        run: node a.mjs",
    "  and-term:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-node@abc",
    "        if: matrix.relevant == 'true' && matrix.name == 'scripts'",
    "      - name: Run",
    "        if: matrix.name == 'scripts'",
    "        run: node a.mjs",
    "  job-condition:",
    "    if: github.event_name == 'push'",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-node@abc",
    "      - run: node a.mjs",
    "",
  ].join("\n");
  assert.deepEqual(unsetSteps("x.yml", readJobs(text)), [
    "x.yml > skipped > Run > python",
    "x.yml > other-condition > Run > python",
    "x.yml > and-term > Run > node",
  ]);
});

test("covers compares normalised conditions and top-level || terms", () => {
  const cases = [
    ["${{  a &&   b }}", "a && b", true],
    ["a || b", "b", true],
    ["(a) || (b && c)", "b && c", true],
    ["x == 'p || q' || r", "x == 'p", false],
    ["(a || b) && c", "a", false],
    ["a || b", "a || c", false],
    ["", "anything", true],
  ];
  for (const [setup, step, covered] of cases) assert.equal(covers({ if: setup }, { if: step }), covered, setup);
});

test("a set-up step must ask for the floor or newer", () => {
  const root = mkdtempSync(join(tmpdir(), "condfix-1707-floor-"));
  writeFileSync(join(root, ".python-version"), "# the line uv and setup-python read\n3.15\n");
  writeFileSync(join(root, ".old-version"), "3.14\n");
  const text = [
    "name: x",
    "on: push",
    "env:",
    '  PYTHON_VERSION: "3.15"',
    '  OLD: "3.14"',
    "jobs:",
    "  old:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-python@abc",
    '        with: { python-version: "3.14" }',
    "  new:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-python@abc # v6",
    "        with:",
    '          python-version: "3.15"',
    "      - uses: actions/setup-python@abc",
    "        with: { python-version-file: .python-version }",
    "      - uses: actions/setup-python@abc",
    '        with: { python-version: "${{ env.PYTHON_VERSION }}" }',
    "      - uses: actions/setup-node@abc",
    "        with: { node-version: 26, package-manager-cache: false }",
    "  old-node:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - name: Node",
    "        uses: actions/setup-node@abc",
    '        with: { node-version: "24" }',
    "  through-env:",
    "    runs-on: ubuntu-26.04",
    "    env:",
    "      PYTHON_VERSION: ${{ env.OLD }}",
    "    steps:",
    "      - uses: actions/setup-python@abc",
    '        with: { python-version: "${{ env.PYTHON_VERSION }}" }',
    "      - uses: actions/setup-python@abc",
    "        with: { python-version-file: .old-version }",
    "  matrix:",
    "    runs-on: ubuntu-26.04",
    "    strategy:",
    "      matrix:",
    '        python-version: ["3.15", "3.14"]',
    "    steps:",
    "      - uses: actions/setup-python@abc",
    '        with: { python-version: "${{ matrix.python-version }}" }',
    "  unreadable:",
    "    runs-on: ubuntu-26.04",
    "    steps:",
    "      - uses: actions/setup-python@abc",
    "      - uses: actions/setup-node@abc",
    '        with: { node-version: "${{ inputs.node }}" }',
    "      - uses: actions/setup-node@abc",
    "        with: { node-version: lts/* }",
    "",
  ].join("\n");
  assert.deepEqual(floorProblems("x.yml", readJobs(text), root), [
    "x.yml > old > step 1 > python: asks for 3.14, below the floor",
    "x.yml > old-node > Node > node: asks for 24, below the floor",
    "x.yml > through-env > step 1 > python: asks for 3.14, below the floor",
    "x.yml > through-env > step 2 > python: asks for 3.14, below the floor",
    "x.yml > matrix > step 1 > python: asks for 3.14, below the floor",
    "x.yml > unreadable > step 1 > python: cannot work out the version it asks for",
    "x.yml > unreadable > step 2 > node: cannot work out the version it asks for",
    "x.yml > unreadable > step 3 > node: 'lts/*' is not a version number this test can compare",
  ]);
  rmSync(root, { recursive: true, force: true });
});

const files = readdirSync(WORKFLOWS)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();
const texts = Object.fromEntries(files.map((file) => [file, readFileSync(join(WORKFLOWS, file), "utf8")]));
const unset = files.flatMap((file) => unsetSteps(file, readJobs(texts[file])));

test("the reader finds every job and every steps: list", () => {
  for (const file of files) {
    const jobs = readJobs(texts[file]);
    const runners = (texts[file].match(/^\s+runs-on:/gm) ?? []).length;
    assert.ok(Object.keys(jobs).length >= runners, `${file}: read fewer jobs than the file has runs-on lines`);
    const stepLists = (texts[file].match(/^\s+steps:\s*$/gm) ?? []).length;
    assert.equal(Object.values(jobs).filter((job) => job.steps.length).length, stepLists, file);
  }
});

test("every set-up step asks for the floor or newer", () => {
  assert.deepEqual(
    files.flatMap((file) => floorProblems(file, readJobs(texts[file]))),
    [],
  );
});

test("every step that runs Node.js or Python comes after its version is set up", () => {
  assert.deepEqual(
    unset.filter((entry) => !(entry in RUNNER_DEFAULT_ALLOWED)),
    [],
  );
});

test("every allowed exception still exists and says why, so the list cannot hide a step that has since changed", () => {
  for (const [entry, reason] of Object.entries(RUNNER_DEFAULT_ALLOWED)) {
    assert.ok(typeof reason === "string" && reason.trim(), `${entry}: an exception needs a reason`);
    assert.ok(unset.includes(entry), entry);
  }
});
