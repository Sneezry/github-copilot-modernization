import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  computeProductFixtureDigest,
  discoverNewBatchRoot,
  listBatchRoots,
  validateCancelledProductRun,
  validateCompletedProductRun,
} from "./product-evidence.mjs";
import { createProductFixture } from "./product-probe.mjs";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function acpRun(choice, tools) {
  return {
    promptResult: { stopReason: "end_turn" },
    promptResults: [{ stopReason: "end_turn" }],
    hostErrors: [],
    toolCalls: tools.map((title, index) => {
      const agentName = title.match(/batch-(?:review|coordinator|assessment)/)?.[0];
      return {
        toolCallId: `tool-${index}`,
        title,
        promptIndex: 0,
        rawInput: agentName ? { agent_type: `github-copilot-modernization:${agentName}` } : {},
      };
    }),
    elicitationRequests: [{ mode: "form" }],
    elicitationResponses: [{
      response: { action: "accept", content: { approval: choice } },
    }],
  };
}

function reviewOnly(fixture, batchId = "batch-product-test") {
  const batchRoot = path.join(fixture.launchRoot, ".github", "modernize", "batches", batchId);
  const selectedExecutionUnitIds = fixture.repositories.map((repository) => repository.name);
  writeJson(path.join(batchRoot, "review.json"), {
    schemaVersion: 1,
    status: "ready_for_approval",
    batchId,
    batchRoot,
    configSha256: "a".repeat(64),
    selectedExecutionUnitIds,
  });
  fs.writeFileSync(path.join(batchRoot, "REVIEW.md"), "# Review\n", "utf8");
  writeJson(path.join(batchRoot, "scratch", "resolved-repos.json"), { schemaVersion: 1 });
  writeJson(path.join(batchRoot, "scratch", "inspected-repos.json"), { schemaVersion: 1 });
  return { batchRoot, batchId, selectedExecutionUnitIds };
}

function createCompletedFixture(t) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "batch-product-evidence-")), "launch");
  t.after(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));
  const fixture = createProductFixture(root);
  const { batchRoot, batchId, selectedExecutionUnitIds } = reviewOnly(fixture);
  const units = [];
  const events = [];
  const summaryResults = [];
  let sequence = 0;

  for (const [index, repository] of fixture.repositories.entries()) {
    const invocationId = index === 0
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222";
    const executionUnitId = repository.name;
    const startedAt = `2026-08-17T12:0${index * 3}:00.000Z`;
    const completedAt = `2026-08-17T12:0${index * 3 + 1}:00.000Z`;
    const finishedAt = `2026-08-17T12:0${index * 3 + 2}:00.000Z`;
    const attemptRoot = path.join(batchRoot, "attempts", repository.name, `unit-${index}`, "assessment", "1");
    const requestPath = path.join(attemptRoot, "request.json");
    const resultPath = path.join(attemptRoot, "result.json");
    fs.mkdirSync(path.join(attemptRoot, "scratch"), { recursive: true });
    const reportRoot = path.join(repository.path, ".github", "modernize", "assessment", `run-${index}`);
    const reportPath = path.join(reportRoot, "report.json");
    const htmlPath = path.join(reportRoot, "report.html");
    writeJson(reportPath, { version: "1.1.0", metadata: { runId: `run-${index}` } });
    fs.writeFileSync(htmlPath, `<!doctype html><title>${repository.name}</title>\n`, "utf8");
    writeJson(requestPath, {
      schemaVersion: 1,
      batchId,
      invocationId,
      repoId: repository.name,
      executionUnitId,
      workspacePath: repository.path,
      scopeRoots: [repository.path],
      phase: "assessment",
      attempt: 1,
      mode: "batch-headless",
      userRequest: "Assess both repositories",
      phaseApproved: true,
      resultPath,
      inputArtifacts: {},
      decisions: { domains: ["cloud-readiness"], analysisCoverage: "issue-only", maxConcurrency: 1 },
    });
    writeJson(resultPath, {
      schemaVersion: 1,
      batchId,
      invocationId,
      repoId: repository.name,
      executionUnitId,
      phase: "assessment",
      attempt: 1,
      status: "completed",
      artifacts: { report: reportPath, html: htmlPath },
      evidence: { artifactValidation: "passed" },
      needsInput: null,
      error: null,
      completedAt,
    });
    const unit = {
      repoId: repository.name,
      executionUnitId,
      phase: "assessment",
      attempt: 1,
      invocationId,
      status: "completed",
      resultPath,
      startedAt,
      finishedAt,
    };
    units.push(unit);
    writeJson(path.join(batchRoot, "repos", `${repository.name}.json`), {
      schemaVersion: 1,
      repoId: repository.name,
      status: "completed",
      executionUnits: [unit],
      validations: {
        [executionUnitId]: {
          status: "completed",
          valid: true,
          errors: [],
          artifacts: { report: reportPath, html: htmlPath },
        },
      },
    });
    events.push({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      sequence: ++sequence,
      batchId,
      type: "attempt_started",
      at: startedAt,
      repoId: repository.name,
      executionUnitId,
      invocationId,
      payload: { phase: "assessment", attempt: 1, requestPath, resultPath },
    });
    events.push({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      sequence: ++sequence,
      batchId,
      type: "attempt_finished",
      at: finishedAt,
      repoId: repository.name,
      executionUnitId,
      invocationId,
      payload: { phase: "assessment", attempt: 1, status: "completed" },
    });
    summaryResults.push({
      repoId: repository.name,
      executionUnitId,
      status: "completed",
      attempt: 1,
      artifacts: { report: reportPath, html: htmlPath },
      errors: [],
    });
  }

  const batchCompletedAt = "2026-08-17T12:07:00.000Z";
  events.push({
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    sequence: ++sequence,
    batchId,
    type: "batch_completed",
    at: batchCompletedAt,
    repoId: null,
    executionUnitId: null,
    invocationId: null,
    payload: { status: "completed" },
  });
  writeJson(path.join(batchRoot, "manifest.json"), {
    schemaVersion: 1,
    batchId,
    executionMode: "local",
    action: "assessment",
    selectedExecutionUnitIds,
    assessment: {
      phaseApproved: true,
      decisions: { domains: ["cloud-readiness"], analysisCoverage: "issue-only", maxConcurrency: 1 },
    },
  });
  writeJson(path.join(batchRoot, "state.json"), {
    schemaVersion: 1,
    batchId,
    status: "completed",
    executionUnits: units,
  });
  fs.writeFileSync(path.join(batchRoot, "events.jsonl"), `${events.map(JSON.stringify).join("\n")}\n`, "utf8");
  writeJson(path.join(batchRoot, "summary.json"), {
    schemaVersion: 1,
    batchId,
    phase: "assessment",
    status: "completed",
    completedAt: batchCompletedAt,
    counts: { total: 2, completed: 2, completedWithIssues: 0, failed: 0 },
    results: summaryResults,
  });
  fs.writeFileSync(path.join(batchRoot, "summary.md"), "# Completed\n", "utf8");
  return {
    fixture,
    batchRoot,
    acpRun: acpRun("Start batch", [
      "Invoke batch-review",
      "Invoke batch-coordinator",
      "Invoke batch-assessment for alpha-service",
      "Invoke batch-assessment for beta-service",
    ]),
  };
}

test("product fixture digest is independent of its absolute root", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "batch-product-digest-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const left = createProductFixture(path.join(parent, "left"));
  const right = createProductFixture(path.join(parent, "right"));
  assert.equal(computeProductFixtureDigest(left), computeProductFixtureDigest(right));
});

test("completed product evidence binds two distinct sequential attempts", (t) => {
  const scenario = createCompletedFixture(t);
  const evidence = validateCompletedProductRun(scenario);
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.sequential, true);
  assert.deepEqual(evidence.attempts.map((attempt) => attempt.invocationId), [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);
  assert.equal(evidence.attempts.every((attempt) => attempt.artifacts.report.sha256), true);

  const statePath = path.join(scenario.batchRoot, "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.executionUnits[1].startedAt = "2026-08-17T12:01:30.000Z";
  writeJson(statePath, state);
  assert.throws(() => validateCompletedProductRun(scenario), /started before/);
});

test("completed product evidence fails on a source-write canary change", (t) => {
  const scenario = createCompletedFixture(t);
  fs.appendFileSync(path.join(scenario.fixture.repositories[0].path, "src", "index.js"), "// modified\n");
  assert.throws(() => validateCompletedProductRun(scenario), /changed source canaries/);
});

test("completed product evidence requires a fresh phase invocation per attempt", (t) => {
  const scenario = createCompletedFixture(t);
  scenario.acpRun.toolCalls.pop();
  scenario.acpRun.toolCalls[1].rawOutput = "Coordinator plans to invoke batch-assessment";
  assert.throws(() => validateCompletedProductRun(scenario), /Expected 2 exact batch-assessment agent calls, found 1/);
});

test("completed product evidence rejects a generic agent named batch-assessment", (t) => {
  const scenario = createCompletedFixture(t);
  scenario.acpRun.toolCalls[2].rawInput = {
    agent_type: "general-purpose",
    name: "batch-assessment",
  };
  assert.throws(() => validateCompletedProductRun(scenario), /Expected 2 exact batch-assessment agent calls, found 1/);
});

test("explicit follow-up approval binds Review and Start batch to separate turns", (t) => {
  const scenario = createCompletedFixture(t);
  scenario.approvalMode = "explicit-follow-up";
  scenario.acpRun.userPrompts = ["Review this batch; this is not approval.", "Start batch"];
  scenario.acpRun.promptResults = [{ stopReason: "end_turn" }, { stopReason: "end_turn" }];
  scenario.acpRun.promptResult = scenario.acpRun.promptResults[1];
  scenario.acpRun.elicitationRequests = [];
  scenario.acpRun.elicitationResponses = [];
  scenario.acpRun.toolCalls.forEach((toolCall, index) => {
    toolCall.promptIndex = index === 0 ? 0 : 1;
  });
  const evidence = validateCompletedProductRun(scenario);
  assert.equal(evidence.approval.mode, "explicit-follow-up");
  assert.deepEqual(evidence.approval.promptStopReasons, ["end_turn", "end_turn"]);

  scenario.acpRun.userPrompts[1] = "Please start";
  assert.throws(() => validateCompletedProductRun(scenario), /not exactly Start batch/);
  scenario.acpRun.userPrompts[1] = "Start batch";
  scenario.acpRun.toolCalls[1].promptIndex = 0;
  assert.throws(() => validateCompletedProductRun(scenario), /did not run after explicit approval/);
});

test("cancel evidence permits Review artifacts only", (t) => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "batch-product-cancel-")), "launch");
  t.after(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));
  const fixture = createProductFixture(root);
  const before = listBatchRoots(fixture.launchRoot);
  const { batchRoot } = reviewOnly(fixture, "batch-cancel-test");
  assert.equal(discoverNewBatchRoot(fixture.launchRoot, before), batchRoot);
  const scenario = {
    fixture,
    batchRoot,
    acpRun: acpRun("Cancel", ["Invoke batch-review"]),
  };
  assert.equal(validateCancelledProductRun(scenario).status, "passed");
  writeJson(path.join(batchRoot, "selection.json"), { phaseApproved: true });
  assert.throws(() => validateCancelledProductRun(scenario), /approval-bearing artifacts/);
});

test("explicit Cancel binds Review and cancellation to separate turns", (t) => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "batch-product-explicit-cancel-")), "launch");
  t.after(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }));
  const fixture = createProductFixture(root);
  const { batchRoot } = reviewOnly(fixture, "batch-explicit-cancel-test");
  const run = acpRun("Cancel", []);
  run.elicitationResponses = [];
  run.elicitationRequests = [];
  run.userPrompts = ["Review selected repositories", "Cancel"];
  run.promptResults = [{ stopReason: "end_turn" }, { stopReason: "end_turn" }];
  run.toolCalls = [{
    promptIndex: 0,
    rawInput: { agent_type: "github-copilot-modernization:batch-review" },
  }];
  assert.equal(validateCancelledProductRun({
    fixture,
    batchRoot,
    acpRun: run,
    approvalMode: "explicit-follow-up",
  }).status, "passed");
});

test("product evidence rejects host quota failures before artifact claims", (t) => {
  const scenario = createCompletedFixture(t);
  scenario.acpRun.hostErrors = ["exceeded your monthly quota"];
  assert.throws(() => validateCompletedProductRun(scenario), /ACP host failed/);
});