import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const stageRoot = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(stageRoot, "..", "..", "..");
const designPath = path.join(pluginRoot, "docs", "BATCH_MODE_DESIGN.md");
const issuesPath = path.join(pluginRoot, "docs", "BATCH_MODE_OPEN_ISSUES.md");
const expectedDesignSha256 = "06e99b12bf05523fe0978e10f85ae5a7c6237b9e0a8286db5c725de6bf479750";
const expectedStage0Statuses = new Map([
  ["BM-001", "Deferred"],
  ["BM-002", "Open"],
  ["BM-003", "Closed"],
  ["BM-004", "Deferred"],
  ["BM-005", "Decided"],
  ["BM-006", "Closed"],
  ["BM-007", "Decided"],
]);
const deliveryBlockers = ["BM-008", "BM-009", "BM-010"];

test("Stage 0 decisions do not modify the batch design baseline", () => {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(designPath)).digest("hex");
  assert.equal(actual, expectedDesignSha256);
});

test("Stage 0 issues retain their decisions and current statuses", () => {
  const issues = fs.readFileSync(issuesPath, "utf8");
  for (const [issueId, expectedStatus] of expectedStage0Statuses) {
    const start = issues.indexOf(`### ${issueId}:`);
    assert.notEqual(start, -1, issueId);
    const end = issues.indexOf("\n### BM-", start + 1);
    const section = issues.slice(start, end === -1 ? undefined : end);
    assert.match(section, new RegExp(`- \\*\\*Status:\\*\\* ${expectedStatus}`), issueId);
    assert.match(section, /\*\*Stage 0 decision \(2026-08-12\)\*\*/, issueId);
  }
  assert.match(issues, /same two-child request has been observed both serialized and overlapped/);
  assert.match(issues, /tests\/batch-mode\/stage0\/evidence\/platform-probe\.json/);
});

test("delivery blockers are open and have an explicit delivery decision", () => {
  const issues = fs.readFileSync(issuesPath, "utf8");
  for (const issueId of deliveryBlockers) {
    const start = issues.indexOf(`### ${issueId}:`);
    assert.notEqual(start, -1, issueId);
    const end = issues.indexOf("\n### BM-", start + 1);
    const section = issues.slice(start, end === -1 ? undefined : end);
    assert.match(section, /- \*\*Status:\*\* Open/, issueId);
    assert.match(section, /\*\*Delivery decision \(2026-08-17\)\*\*/, issueId);
  }
});