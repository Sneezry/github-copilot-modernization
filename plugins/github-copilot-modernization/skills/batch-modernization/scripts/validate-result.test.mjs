import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateAttemptResult, validateAttemptResultFile } from "./validate-result.mjs";

const identity = {
  batchId: "batch-1",
  invocationId: "4f7e6f2d-8e4f-4e7d-a5d4-3ab29ed8dd3d",
  repoId: "orders",
  executionUnitId: "orders",
  attempt: 1,
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-result-"));
  const batchRoot = path.join(root, "batch");
  const workspacePath = path.join(root, "workspace");
  fs.mkdirSync(batchRoot);
  fs.mkdirSync(workspacePath);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, batchRoot, workspacePath };
}

function baseResult(phase, artifacts, extra = {}) {
  return {
    schemaVersion: 1,
    ...identity,
    phase,
    status: "completed",
    artifacts,
    evidence: { artifactValidation: "not_run" },
    needsInput: null,
    error: null,
    completedAt: "2026-08-12T12:00:00.000Z",
    ...extra,
  };
}

function options(fixtureValue, phase) {
  return {
    batchRoot: fixtureValue.batchRoot,
    workspacePath: fixtureValue.workspacePath,
    expected: { ...identity, phase },
  };
}

test("assessment completion requires parseable report and non-empty HTML inside allowed roots", (t) => {
  const value = fixture(t);
  const report = path.join(value.workspacePath, "report.json");
  const html = path.join(value.workspacePath, "report.html");
  fs.writeFileSync(report, "{}\n");
  fs.writeFileSync(html, "<html></html>\n");
  const result = baseResult("assessment", { report, html });
  assert.deepEqual(validateAttemptResult(result, options(value, "assessment")), {
    valid: true,
    status: "completed",
    errors: [],
    artifacts: { report, html },
  });
});

test("planning completion requires plan and a tasks array", (t) => {
  const value = fixture(t);
  const plan = path.join(value.workspacePath, "plan.md");
  const tasks = path.join(value.workspacePath, "tasks.json");
  fs.writeFileSync(plan, "# Plan\n");
  fs.writeFileSync(tasks, '{"tasks":[]}\n');
  assert.equal(
    validateAttemptResult(baseResult("planning", { plan, tasks }), options(value, "planning")).valid,
    true,
  );
  fs.writeFileSync(tasks, "{}\n");
  assert.match(
    validateAttemptResult(baseResult("planning", { plan, tasks }), options(value, "planning")).errors.join("\n"),
    /tasks array/,
  );
});

test("execution completion requires terminal tasks and explicit build/test evidence", (t) => {
  const value = fixture(t);
  const summary = path.join(value.workspacePath, "summary.md");
  const taskStatus = path.join(value.batchRoot, "task-status.json");
  fs.writeFileSync(summary, "# Done\n");
  fs.writeFileSync(taskStatus, '{"tasks":[{"id":"T1","status":"completed"}]}\n');
  const result = baseResult("execution", { summary, taskStatus }, {
    evidence: {
      artifactValidation: "not_run",
      successCriteria: { build: "passed", tests: "exempt" },
    },
  });
  assert.equal(validateAttemptResult(result, options(value, "execution")).valid, true);
  fs.writeFileSync(taskStatus, '{"tasks":[{"id":"T1","status":"running"}]}\n');
  assert.match(
    validateAttemptResult(result, options(value, "execution")).errors.join("\n"),
    /no supported terminal status/,
  );
});

test("schema, identity, status, and secret violations become protocol errors", (t) => {
  const value = fixture(t);
  const invalid = {
    ...baseResult("assessment", {}),
    invocationId: "wrong",
    status: "completed",
    needsInput: { requestId: "stale" },
    error: { code: "bad", message: "https://user:secret@example.com/repo.git?token=x", retryable: false },
  };
  delete invalid.executionUnitId;
  const validation = validateAttemptResult(invalid, options(value, "assessment"));
  assert.equal(validation.status, "protocol_error");
  assert.match(validation.errors.join("\n"), /executionUnitId is required/);
  assert.match(validation.errors.join("\n"), /invocationId does not match/);
  assert.match(validation.errors.join("\n"), /needsInput must be null/);
  assert.match(validation.errors.join("\n"), /must not contain URL credentials/);
});

test("artifact paths reject missing, relative, outside, and symlink escapes", (t) => {
  const value = fixture(t);
  const outside = path.join(value.root, "outside.json");
  fs.writeFileSync(outside, "{}\n");
  const relative = baseResult("assessment", { report: "report.json", html: "missing.html" });
  assert.match(validateAttemptResult(relative, options(value, "assessment")).errors.join("\n"), /absolute path/);
  const outsideResult = baseResult("assessment", { report: outside, html: outside });
  assert.match(validateAttemptResult(outsideResult, options(value, "assessment")).errors.join("\n"), /escapes/);

  const link = path.join(value.workspacePath, "linked-report.json");
  try {
    fs.symlinkSync(outside, link, "file");
    const escaped = baseResult("assessment", { report: link, html: link });
    assert.match(validateAttemptResult(escaped, options(value, "assessment")).errors.join("\n"), /escapes/);
  } catch (error) {
    if (!["EPERM", "EACCES", "UNKNOWN"].includes(error.code)) throw error;
  }
});

test("NeedsInput and failed results enforce their payload contracts without phase artifacts", (t) => {
  const value = fixture(t);
  const needsInput = baseResult("planning", {}, {
    status: "needs_input",
    needsInput: {
      schemaVersion: 1,
      requestId: "q1",
      batchId: identity.batchId,
      invocationId: identity.invocationId,
      repoId: identity.repoId,
      executionUnitId: identity.executionUnitId,
      sourceAttempt: 1,
      status: "pending",
      questions: [{
        id: "target",
        kind: "text",
        prompt: "Target?",
        required: true,
        options: [],
      }],
      answers: [],
    },
  });
  assert.equal(validateAttemptResult(needsInput, options(value, "planning")).valid, true);
  const failed = baseResult("assessment", {}, {
    status: "failed",
    error: { code: "engine_failed", message: "failed", retryable: true },
  });
  assert.equal(validateAttemptResult(failed, options(value, "assessment")).valid, true);
});

test("missing and malformed result files fail closed", (t) => {
  const value = fixture(t);
  const resultPath = path.join(value.batchRoot, "result.json");
  assert.equal(validateAttemptResultFile(resultPath, options(value, "assessment")).status, "protocol_error");
  fs.writeFileSync(resultPath, "{");
  assert.equal(validateAttemptResultFile(resultPath, options(value, "assessment")).valid, false);
});