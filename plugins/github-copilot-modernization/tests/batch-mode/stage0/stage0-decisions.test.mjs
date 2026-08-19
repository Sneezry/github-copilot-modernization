import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const stageRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(stageRoot, "..", "..", "..");
const designPath = path.join(pluginRoot, "docs", "BATCH_MODE_DESIGN.md");
const implementationPlanPath = path.join(pluginRoot, "docs", "BATCH_MODE_IMPLEMENTATION_PLAN.md");
const issuesPath = path.join(pluginRoot, "docs", "BATCH_MODE_OPEN_ISSUES.md");
const expectedDesignSha256 = "d6fe2339d71d78ea267fd131838ec8c98e7f5f4d2aa59928f094c855ed1abb72";
const expectedIssueStatuses = new Map([
  ["BM-002", "Closed"],
  ["BM-003", "Closed"],
  ["BM-006", "Closed"],
  ["BM-008", "Closed"],
  ["BM-009", "Closed"],
  ["BM-010", "Closed"],
  ["BM-011", "Closed"],
  ["BM-012", "Closed"],
  ["BM-013", "Closed"],
]);

test("Stage 0 decisions match the approved batch design baseline", () => {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(designPath)).digest("hex");
  assert.equal(actual, expectedDesignSha256);
});

test("issue register contains only current Assessment work", () => {
  const issues = fs.readFileSync(issuesPath, "utf8");
  for (const [issueId, expectedStatus] of expectedIssueStatuses) {
    const start = issues.indexOf(`### ${issueId}:`);
    assert.notEqual(start, -1, issueId);
    const end = issues.indexOf("\n### BM-", start + 1);
    const section = issues.slice(start, end === -1 ? undefined : end);
    assert.match(section, new RegExp(`\\*\\*Status:\\*\\* ${expectedStatus}`), issueId);
  }
  for (const removed of ["BM-001", "BM-004", "BM-005", "BM-007"]) {
    assert.equal(issues.includes(`### ${removed}:`), false, removed);
    assert.match(issues, new RegExp(`\\| ${removed} \\|[^\n]+\\| Removed\\.`), removed);
  }
});

test("implementation plan has no future Batch stages", () => {
  const plan = fs.readFileSync(implementationPlanPath, "utf8");
  assert.doesNotMatch(plan, /^### Stage [234]:/m);
  assert.doesNotMatch(plan, /^### Stage [234]：/m);
  assert.doesNotMatch(plan, /^### 阶段 [234]/m);
  assert.match(plan, /^## 10\. Removed From This Plan$/m);
  assert.match(plan, /Batch Planning;/);
  assert.match(plan, /cross-session resume;/);
});