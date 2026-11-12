import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every workflow job that runs Node.js or Python chooses its version (saulpatinojr/HCW-HybridCloudWorks#1707).
//
// A job that runs `node`, `npm`, `npx`, `python3` or `pip` without actions/setup-node or actions/setup-python gets
// whatever the runner image ships: on ubuntu-26.04 that was Node.js 24 and Python 3.14 in November 2026, both below
// the program's floors (Node.js 26, Python 3.15). Nothing else notices, because a job that names no version has
// nothing to read. This is a port of the website's check (scripts/workflow-runtime-setup.test.mjs in
// HCW-HybridCloudWorks); the three Python add-ons carry the same check as tests/security/test_workflow_runtime_setup.py.
//
// A command counts when it is in command position on a line of a `run:` step: at the start, after `$(`, `<(`, `(`,
// `{`, `|`, `&` or `;`, after leading `NAME=value` assignments, or after a word that runs the next one (`env`, `sudo`,
// `xargs`, `exec`, `time`, `!`, `if`, `then`, `do` and the like). It does not count inside a quoted string or as an
// argument (`docker run image python ...`). The set-up step must come before the first such step. Limits, on purpose:
// a job that runs in a `container:` uses that image's runtime and is not checked; a script a step calls (a `.sh` file)
// is not read; and a set-up step with its own `if:` counts as done, so give it the same condition as the steps that
// need it.
//
// The workflows are read with a small line reader rather than a YAML library, because none is a dependency here. It
// relies on the layout every workflow in this repository has (a `jobs:` key at the top level, a `steps:` list, block
// `run: |` scripts); a file it cannot read that way fails the test rather than being skipped.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

// Steps that use the runner's own interpreter on purpose, each with its reason, keyed by
// "file > job > step name > runtime". Keyed by step, not job, so a new step in the same job is still checked. A new
// entry needs a reason a reviewer can check, and a comment above the step in the workflow saying the same.
const RUNNER_DEFAULT_ALLOWED = {};

// Where a command may start: the line's start or an opening or joining character, then any `NAME=value` assignments
// and words that run the next word (`env FOO=1 node`, `sudo node`, `if node ...; then`).
const START = String.raw`(?:^|[$<]\(\s*|[({|;&]\s*)(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+|(?:env|sudo|xargs|exec|time|nice|command|if|then|else|elif|do|while|until|!)\s+)*`;
const COMMAND = {
  node: new RegExp(`${START}(?:node|npm|npx)(?=\\s|$)`),
  python: new RegExp(`${START}(?:python(?:3(?:\\.\\d+)?)?|pip3?)(?=\\s|$)`),
};
const SETUP = { node: /^actions\/setup-node@/, python: /^actions\/setup-python@/ };

// The line with the text of its quoted strings taken out, so words in a message (`echo "...; if pip named..."`) do not
// count. A double-quoted string that runs a command (`"$(node x)"`) is kept.
const withoutQuotedText = (line) =>
  line.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, (q) => (/[$<]\(/.test(q) ? q : '""'));

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

/** The `name`, `uses` and `run` of one step (its first line's `- ` already turned into spaces). */
function stepKeys(lines, keyIndent) {
  const keys = {};
  const keyLine = new RegExp(`^ {${keyIndent}}([A-Za-z_-]+):[ \\t]*(.*)$`);
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(keyLine);
    i += 1;
    if (!match) continue;
    const [, key, rest] = match;
    if (/^[|>][+-]?\d?\s*(?:#.*)?$/.test(rest)) {
      const block = [];
      while (i < lines.length && (!lines[i].trim() || indentOf(lines[i]) > keyIndent)) block.push(lines[i++]);
      keys[key] = block.some((l) => l.trim()) ? dedent(block).replace(/^\n+|\n+$/g, "") : "";
    } else if (key === "uses") {
      keys[key] = rest.split(/\s+/)[0] ?? "";
    } else {
      keys[key] = unquote(key === "run" ? rest : rest.replace(/\s+#.*$/, ""));
    }
  }
  return keys;
}

/** Every job of a workflow: {name: {container, steps: [{name, uses, run}, ...]}}. */
export function readJobs(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
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
    jobs[match[1]] = { container, steps };
  });
  return jobs;
}

/** The steps of one workflow that run a runtime before (or without) setting it up: "file > job > step > kind". */
export function unsetSteps(file, jobs) {
  const found = [];
  for (const [name, job] of Object.entries(jobs)) {
    if (job.container) continue;
    for (const kind of Object.keys(COMMAND)) {
      const setup = job.steps.findIndex((step) => SETUP[kind].test(step.uses ?? ""));
      job.steps.forEach((step, i) => {
        if ((setup === -1 || setup > i) && runsRuntime(step.run, kind)) {
          found.push(`${file} > ${name} > ${step.name || `step ${i + 1}`} > ${kind}`);
        }
      });
    }
  }
  return found;
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
  ];
  for (const line of node) assert.equal(runsRuntime(line, "node"), true, line);
  const python = [
    "cat x | python3 -I check.py",
    "python3.15 -I x.py",
    'compare_out="$(python3 -I scripts/follow_website_base.py --check)"',
    "python -m pip install uv",
    "python3 -m venv zizmor-env",
  ];
  for (const line of python) assert.equal(runsRuntime(line, "python"), true, line);
});

test("runsRuntime does not count words that are not commands", () => {
  const cases = [
    ['echo "run `node scripts/x.mjs` by hand"', "node"],
    ['docker run --rm img python -c "import azure"', "python"],
    ["/opt/az/bin/python3 -Im pip check", "python"],
    ["# node is not run here", "node"],
    ['for node in items["nodes"]:', "node"],
    ['echo "$NODE_VERSION"', "node"],
    ["nodes=3 nodejs-check", "node"],
    ['echo "the stage is wrong; if pip named the file differently, look"', "python"],
    ["zizmor-env/bin/python -m pip install zizmor", "python"],
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

test("every step that runs Node.js or Python comes after its version is set up", () => {
  assert.deepEqual(
    unset.filter((entry) => !(entry in RUNNER_DEFAULT_ALLOWED)),
    [],
  );
});

test("every allowed exception still exists, so the list cannot hide a step that has since changed", () => {
  for (const entry of Object.keys(RUNNER_DEFAULT_ALLOWED)) assert.ok(unset.includes(entry), entry);
});
