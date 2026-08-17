import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(skillRoot, "..", "..");
const thisFile = fileURLToPath(import.meta.url);

function walkFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

test("Stage 1B retains the complete deterministic control-plane surface", () => {
  const expected = [
    "SKILL.md",
    "references/phase-contract.md",
    "references/repos-json-compatibility.md",
    "schemas/attempt-request.schema.json",
    "schemas/attempt-result.schema.json",
    "schemas/batch-state.schema.json",
    "schemas/event.schema.json",
    "schemas/execution-unit.schema.json",
    "schemas/needs-input.schema.json",
    "schemas/resolved-repos.schema.json",
    "scripts/batch-state.mjs",
    "scripts/batch-attempt.mjs",
    "scripts/inspect-workspaces.mjs",
    "scripts/prepare-review.mjs",
    "scripts/resolve-repos.mjs",
    "scripts/schema-validator.mjs",
    "scripts/validate-result.mjs",
  ];
  for (const relativePath of expected) {
    assert.equal(fs.existsSync(path.join(skillRoot, ...relativePath.split("/"))), true, relativePath);
  }
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /^name: batch-modernization$/m);
  assert.match(skill, /^user-invocable: false$/m);
});

test("deterministic batch utilities contain no business-agent or AppMod tool dependency", () => {
  const files = walkFiles(skillRoot).filter((filePath) =>
    filePath !== thisFile && [".js", ".json", ".md", ".mjs"].includes(path.extname(filePath)));
  const violations = files.flatMap((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    return /appmod-|mcpServers|batch-coordinator\.agent|batch-assessment\.agent/i.test(content)
      ? [path.relative(skillRoot, filePath)]
      : [];
  });
  assert.deepEqual(violations, []);
});

function frontmatterTools(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  return [...frontmatter.matchAll(/^  - ([^\r\n]+)$/gm)].map((match) => match[1]);
}

test("Stage 1B wires internal agents through an explicit-only modernize route", () => {
  const modernizePath = path.join(pluginRoot, "agents", "modernize.agent.md");
  const reviewPath = path.join(pluginRoot, "agents", "batch-review.agent.md");
  const coordinatorPath = path.join(pluginRoot, "agents", "batch-coordinator.agent.md");
  const assessmentPath = path.join(pluginRoot, "agents", "batch-assessment.agent.md");
  const modernize = fs.readFileSync(modernizePath, "utf8");
  const review = fs.readFileSync(reviewPath, "utf8");
  const coordinator = fs.readFileSync(coordinatorPath, "utf8");
  const assessment = fs.readFileSync(assessmentPath, "utf8");

  assert.match(modernize, /Stage 1B Explicit Batch Assessment Preview/);
  for (const productAgent of [modernize, review, coordinator, assessment]) {
    assert.doesNotMatch(productAgent, /^model:/m);
  }
  assert.match(modernize, /Before using any tool or evaluating the existing single-repository routes/);
  assert.match(modernize, /current top-level user turn as fallback approval when its entire trimmed content is exactly `Start batch` or exactly `Cancel`/);
  assert.match(modernize, /Any longer text, text embedded in the original request, inferred intent, assistant prose, or non-adjacent turn is not fallback approval/);
  assert.match(modernize, /Explicit batch scope \+ any other action/);
  assert.match(modernize, /stop without tools or delegation/);
  assert.match(modernize, /This decision is local and final/);
  assert.match(modernize, /first tool action delegates exactly once to `batch-review`/);
  assert.match(modernize, /Do not create a todo, query or update session history, load a skill/);
  assert.match(modernize, /explicitly mentions `repos\.json`, multiple\/all\/selected repositories/);
  assert.match(modernize, /Do not enter batch mode merely because/);
  assert.match(modernize, /immediate next action after a valid Review is to invoke the `#ask_user` tool when the top-level host exposes it/);
  assert.match(modernize, /enum values are exactly \*\*Start batch\*\* and \*\*Cancel\*\*/);
  assert.match(modernize, /Do not emit text asking the user to reply, choose, or confirm/);
  assert.match(modernize, /If and only if the top-level host does not expose `ask_user`/);
  assert.match(modernize, /approval evidence containing `mode` \(`structured` or `explicit-follow-up`\)/);
  assert.match(modernize, /current host does not expose `ask_user` inside a nested agent invocation/);
  assert.match(modernize, /immediate next tool action delegates exactly once to `batch-coordinator`/);
  assert.match(modernize, /Never use background mode/);
  assert.match(modernize, /Do not invoke either internal agent outside this sequence/);
  assert.deepEqual(frontmatterTools(modernize), ["agent", "ask_user"]);
  assert.match(review, /^user-invocable: false$/m);
  assert.match(coordinator, /^user-invocable: false$/m);
  assert.match(assessment, /^user-invocable: false$/m);

  const reviewTools = frontmatterTools(review);
  const coordinatorTools = new Set(frontmatterTools(coordinator));
  const assessmentTools = frontmatterTools(assessment);
  assert.deepEqual(reviewTools, ["skill", "execute/runInTerminal"]);
  assert.equal(reviewTools.includes("ask_user"), false);
  assert.equal(reviewTools.includes("agent"), false);
  assert.equal(coordinatorTools.has("ask_user"), false);
  assert.equal(assessmentTools.includes("ask_user"), false);
  assert.equal(assessmentTools.every((tool) => coordinatorTools.has(tool)), true);
  assert.match(review, /Never call, request, or imitate `ask_user`/);
  assert.match(review, /Never initialize batch state, acquire a lease/);
  assert.match(review, /immediate next and only tool action is one foreground terminal command invoking `scripts\/prepare-review\.mjs`/);
  assert.match(review, /return its stdout verbatim with no preface or suffix/);
  assert.match(review, /Never improvise or reconstruct a handoff/);
  assert.match(review, /BATCH_REVIEW_READY/);
  assert.match(coordinator, /Continue only when its mode is exactly `structured` or `explicit-follow-up` and its value is exactly \*\*Start batch\*\*/);
  assert.match(coordinator, /Text in the original request is never approval/);
  assert.match(coordinator, /Do not call or request `ask_user`; nested agents do not receive that host tool/);
  assert.match(coordinator, /first point at which approval-bearing artifacts may exist/);
  assert.match(coordinator, /call `batch-attempt\.mjs open-session` exactly once/);
  assert.match(coordinator, /retains the raw owner token only in worker memory/);
  assert.match(coordinator, /raw owner token must never leave the lease-session worker/);
  assert.match(coordinator, /Every coordinator terminal command must be finite, foreground, and synchronous/);
  assert.match(coordinator, /Never add a keeper loop \(`while \(\$true\)`, `Start-Sleep`, or equivalent\), run the terminal command itself in async\/background mode/);
  assert.match(coordinator, /`lease\.json` contains only a digest and can never reconstruct the token/);
  assert.match(coordinator, /Never acquire a second lease, attempt takeover, delete or edit `lease\.json`, `state\.json`, `events\.jsonl`, or `attempts\/`/);
  assert.match(coordinator, /Do not release it while a child invocation is active/);
  assert.match(coordinator, /session-finalize-assessment/);
  assert.match(coordinator, /exact host agent type `github-copilot-modernization:batch-assessment`/);
  assert.match(coordinator, /Never invoke `general-purpose`, `task`, or another built-in agent type and merely name it `batch-assessment`/);
  assert.match(assessment, /Explicitly bootstrap the target workspace on every invocation/);
  assert.match(assessment, /Never delete, rename, replace, or edit an existing `\.github` path/);
  assert.match(assessment, /If bootstrap exits nonzero, do not repair or retry the workspace/);
  assert.match(assessment, /--attempt-scratch-root/);
  assert.match(assessment, /--max-concurrency/);
  assert.match(assessment, /catalog-order waves no larger than `maxConcurrency`/);
  assert.match(assessment, /top level must contain exactly the five fields accepted by `publish`/);
  assert.match(assessment, /Put optional language, domain, planning-support, finding-count, recommendation, and failed-task metadata inside `evidence`/);
  assert.match(assessment, /batch-attempt\.mjs publish/);
});