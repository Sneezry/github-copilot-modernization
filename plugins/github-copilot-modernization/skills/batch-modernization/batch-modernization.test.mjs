import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(skillRoot, "..", "..");
const thisFile = fileURLToPath(import.meta.url);
const expectedModernizeSha256 = "8628391c66000e74440ce4a37486d624e4185afda7d629fb9cf0102393e70960";

function walkFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

test("Stage 1A ships the complete deterministic control-plane surface", () => {
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
    "scripts/inspect-workspaces.mjs",
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

test("Stage 1A contains no business-agent or AppMod tool dependency", () => {
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

test("Stage 1A does not modify the public modernize route", () => {
  const modernizePath = path.join(pluginRoot, "agents", "modernize.agent.md");
  const actual = crypto.createHash("sha256").update(fs.readFileSync(modernizePath)).digest("hex");
  assert.equal(actual, expectedModernizeSha256);
  assert.equal(fs.existsSync(path.join(pluginRoot, "agents", "batch-coordinator.agent.md")), false);
  assert.equal(fs.existsSync(path.join(pluginRoot, "agents", "batch-assessment.agent.md")), false);
});