import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { acquireLease, initializeBatch, readLease, readState } from "./batch-state.mjs";
import {
  commitAttempt,
  finalizeAssessmentBatch,
  initializeAssessmentBatch,
  publishAttemptResult,
  startAttempt,
} from "./batch-attempt.mjs";

const batchAttemptCli = fileURLToPath(new URL("./batch-attempt.mjs", import.meta.url));

function runBatchAttemptCli(args) {
  return spawnSync(process.execPath, [batchAttemptCli, ...args], {
    encoding: "utf8",
    timeout: 15_000,
  });
}

function cliJson(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stdout, /ownerToken|BATCH_OWNER_TOKEN/);
  return JSON.parse(result.stdout);
}

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-attempt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspacePath = path.join(root, "workspace");
  fs.mkdirSync(workspacePath);
  fs.writeFileSync(path.join(workspacePath, "package.json"), "{}\n");
  const unit = {
    schemaVersion: 1,
    repoId: "orders",
    executionUnitId: "orders/api",
    displayName: "orders/api",
    workspacePath,
    gitRoot: workspacePath,
    scopeRoots: [workspacePath],
    languages: ["javascript"],
    source: "include-path",
  };
  const batchRoot = path.join(root, "batch");
  initializeBatch({
    batchRoot,
    manifest: {
      batchId: "batch-1",
      resolvedConfig: { repositories: [{ repoId: "orders", executionUnits: [unit] }] },
    },
    state: {
      status: "ready",
      executionUnits: [{
        repoId: "orders",
        executionUnitId: "orders/api",
        phase: "assessment",
        attempt: 0,
        invocationId: null,
        status: "pending",
        resultPath: null,
        startedAt: null,
        finishedAt: null,
      }],
      progress: { wave: 1, eligible: 1, terminal: 0, successful: 0, issues: 0, failed: 0 },
    },
  });
  const { ownerToken } = acquireLease({ batchRoot, invocationId: "coordinator" });
  return { root, batchRoot, workspacePath, ownerToken };
}

function start(fixture) {
  return startAttempt({
    batchRoot: fixture.batchRoot,
    ownerToken: fixture.ownerToken,
    executionUnitId: "orders/api",
    input: {
      userRequest: "Assess selected repositories",
      phaseApproved: true,
      inputArtifacts: {},
      decisions: { domains: ["security"], analysisCoverage: "full", maxConcurrency: 1 },
    },
    invocationId: "11111111-1111-4111-8111-111111111111",
    now: "2026-08-17T12:00:00.000Z",
  });
}

function assessmentUnit({ repoId, executionUnitId = repoId, workspacePath, gitRoot = workspacePath, language, source = "repository-root" }) {
  return {
    schemaVersion: 1,
    repoId,
    executionUnitId,
    displayName: executionUnitId,
    workspacePath,
    gitRoot,
    scopeRoots: [workspacePath],
    languages: [language],
    source,
  };
}

function resolvedConfig(root, repositories) {
  return {
    schemaVersion: 1,
    configPath: path.join(root, "repos.json"),
    configSha256: "a".repeat(64),
    producer: null,
    repositories: repositories.map(({ repoId, workspacePath, executionUnits, includePaths = [] }) => ({
      repoId,
      name: repoId,
      input: { url: null, path: workspacePath, branch: null, includePaths },
      workspacePath,
      preflightStatus: "ready",
      warnings: [],
      errors: [],
      executionUnits,
      unknownFields: {},
    })),
    apps: [],
    unknownFields: {},
  };
}

function createAssessmentArtifacts(workspacePath, name) {
  const outputDirectory = path.join(workspacePath, ".github", "modernize", "assessment", name);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const reportPath = path.join(outputDirectory, "report.json");
  const htmlPath = path.join(outputDirectory, "report.html");
  fs.writeFileSync(reportPath, `${JSON.stringify({ name })}\n`);
  fs.writeFileSync(htmlPath, `<!doctype html><title>${name}</title>\n`);
  return { report: reportPath, html: htmlPath };
}

test("assessment attempt is bound to one unit and commits verified artifacts", (t) => {
  const fixture = createFixture(t);
  const started = start(fixture);
  assert.equal(fs.existsSync(started.requestPath), true);
  assert.equal(started.request.executionUnitId, "orders/api");
  assert.equal(started.request.workspacePath, fixture.workspacePath);
  assert.equal(Object.hasOwn(started.request, "leaseToken"), false);
  assert.equal(readState(fixture.batchRoot).executionUnits[0].status, "running");

  const reportPath = path.join(fixture.workspacePath, "report.json");
  const htmlPath = path.join(fixture.workspacePath, "report.html");
  fs.writeFileSync(reportPath, "{}\n");
  fs.writeFileSync(htmlPath, "<!doctype html>\n");
  publishAttemptResult({
    requestPath: started.requestPath,
    outcome: {
      status: "completed",
      artifacts: { report: reportPath, html: htmlPath },
      evidence: { artifactValidation: "passed" },
      needsInput: null,
      error: null,
    },
    now: "2026-08-17T12:01:00.000Z",
  });
  assert.throws(
    () => publishAttemptResult({
      requestPath: started.requestPath,
      outcome: {
        status: "completed",
        artifacts: { report: reportPath, html: htmlPath },
        evidence: { artifactValidation: "passed" },
      },
    }),
    /already exists/,
  );

  const committed = commitAttempt({
    batchRoot: fixture.batchRoot,
    ownerToken: fixture.ownerToken,
    requestPath: started.requestPath,
    now: "2026-08-17T12:02:00.000Z",
  });
  assert.equal(committed.validation.valid, true);
  assert.equal(committed.state.status, "completed");
  assert.equal(committed.state.executionUnits[0].status, "completed");
  assert.deepEqual(committed.state.progress, {
    wave: 1,
    eligible: 1,
    terminal: 1,
    successful: 1,
    issues: 0,
    failed: 0,
  });

  const finalized = finalizeAssessmentBatch({
    batchRoot: fixture.batchRoot,
    ownerToken: fixture.ownerToken,
    now: "2026-08-17T12:03:00.000Z",
  });
  assert.equal(finalized.summary.status, "completed");
  assert.equal(finalized.summary.results[0].artifacts.report, reportPath);
  assert.equal(fs.existsSync(finalized.paths.markdown), true);
  assert.equal(readLease(fixture.batchRoot), null);
});

test("lease session retains ownership across stateless CLI processes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-lease-session-"));
  let leaseSessionId;
  t.after(() => {
    if (leaseSessionId) {
      runBatchAttemptCli(["session-release", "--lease-session-id", leaseSessionId]);
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const repositories = ["orders", "billing"].map((repoId) => {
    const workspacePath = path.join(root, repoId);
    fs.mkdirSync(workspacePath);
    return {
      repoId,
      workspacePath,
      executionUnits: [assessmentUnit({ repoId, workspacePath, language: "java" })],
    };
  });
  const batchRoot = path.join(root, "batch");
  initializeAssessmentBatch({
    batchRoot,
    resolvedConfig: resolvedConfig(root, repositories),
    selection: { executionUnitIds: ["orders", "billing"], approvedNeedsAttention: [] },
    input: {
      batchId: "lease-session-assessment",
      userRequest: "Assess selected repositories",
      phaseApproved: true,
      inputArtifacts: {},
      decisions: { domains: ["cloud-readiness"], analysisCoverage: "issue-only", maxConcurrency: 1 },
    },
  });

  const opened = cliJson(runBatchAttemptCli([
    "open-session",
    "--batch-root", batchRoot,
    "--invocation-id", "lease-session-test",
    "--execution-unit-id", "orders",
  ]));
  leaseSessionId = opened.leaseSessionId;
  assert.match(leaseSessionId, /^[0-9a-f-]{36}$/i);

  for (const [index, repoId] of ["orders", "billing"].entries()) {
    const started = index === 0
      ? opened
      : cliJson(runBatchAttemptCli([
        "session-start",
        "--lease-session-id", leaseSessionId,
        "--execution-unit-id", repoId,
      ]));
    const artifacts = createAssessmentArtifacts(repositories[index].workspacePath, repoId);
    publishAttemptResult({
      requestPath: started.requestPath,
      outcome: {
        status: "completed",
        artifacts,
        evidence: { artifactValidation: "passed" },
        needsInput: null,
        error: null,
      },
    });
    const committed = cliJson(runBatchAttemptCli([
      "session-commit",
      "--lease-session-id", leaseSessionId,
      "--request", started.requestPath,
    ]));
    assert.equal(committed.validation.valid, true);
  }

  const finalized = cliJson(runBatchAttemptCli([
    "session-finalize-assessment",
    "--lease-session-id", leaseSessionId,
  ]));
  leaseSessionId = null;
  assert.equal(finalized.summary.status, "completed");
  assert.equal(finalized.summary.counts.completed, 2);
  assert.equal(readLease(batchRoot), null);
});

test("missing result commits protocol_error instead of trusting agent completion", (t) => {
  const fixture = createFixture(t);
  const started = start(fixture);

  const committed = commitAttempt({
    batchRoot: fixture.batchRoot,
    ownerToken: fixture.ownerToken,
    requestPath: started.requestPath,
    now: "2026-08-17T12:02:00.000Z",
  });

  assert.equal(committed.validation.valid, false);
  assert.equal(committed.validation.status, "protocol_error");
  assert.equal(committed.state.executionUnits[0].status, "protocol_error");
  assert.equal(committed.state.status, "failed");
  assert.equal(committed.state.progress.failed, 1);
});

test("unapproved or overlapping attempts fail closed", (t) => {
  const fixture = createFixture(t);
  assert.throws(
    () => startAttempt({
      batchRoot: fixture.batchRoot,
      ownerToken: fixture.ownerToken,
      executionUnitId: "orders/api",
      input: { userRequest: "Assess", phaseApproved: false },
    }),
    /not approved/,
  );
  start(fixture);
  assert.throws(() => start(fixture), /already active/);
});

test("initialization derives pending units only from approved preflight selections", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-initialize-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspacePath = path.join(root, "workspace");
  fs.mkdirSync(workspacePath);
  const unit = {
    schemaVersion: 1,
    repoId: "orders",
    executionUnitId: "orders",
    displayName: "orders",
    workspacePath,
    gitRoot: workspacePath,
    scopeRoots: [workspacePath],
    languages: ["java"],
    source: "repository-root",
  };
  const resolvedConfig = {
    schemaVersion: 1,
    configPath: path.join(root, "repos.json"),
    configSha256: "a".repeat(64),
    producer: null,
    repositories: [{
      repoId: "orders",
      name: "orders",
      input: { url: null, path: workspacePath, branch: null, includePaths: [] },
      workspacePath,
      preflightStatus: "needs_attention",
      warnings: ["local non-Git workspace"],
      errors: [],
      executionUnits: [unit],
      unknownFields: {},
    }],
    apps: [],
    unknownFields: {},
  };
  const input = {
    batchId: "batch-approved",
    userRequest: "Assess orders",
    phaseApproved: true,
    inputArtifacts: {},
    decisions: { domains: ["cloud-readiness"], analysisCoverage: "issue-only", maxConcurrency: 1 },
  };
  assert.throws(
    () => initializeAssessmentBatch({
      batchRoot: path.join(root, "unapproved"),
      resolvedConfig,
      selection: { executionUnitIds: ["orders"], approvedNeedsAttention: [] },
      input,
    }),
    /explicit attention approval/,
  );

  const initialized = initializeAssessmentBatch({
    batchRoot: path.join(root, "approved"),
    resolvedConfig,
    selection: { executionUnitIds: ["orders"], approvedNeedsAttention: ["orders"] },
    input,
    now: "2026-08-17T11:00:00.000Z",
  });
  assert.equal(initialized.state.status, "ready");
  assert.equal(initialized.state.executionUnits[0].status, "pending");
  assert.deepEqual(initialized.manifest.selectedExecutionUnitIds, ["orders"]);
});

test("mixed Java, .NET, and TypeScript assessments run sequentially and aggregate partial results", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-mixed-assessment-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const specifications = [
    { repoId: "java-orders", language: "java", status: "completed" },
    { repoId: "dotnet-billing", language: "dotnet", status: "completed_with_issues" },
    { repoId: "typescript-portal", language: "typescript", status: "completed" },
  ];
  const repositories = specifications.map((specification) => {
    const workspacePath = path.join(root, specification.repoId);
    fs.mkdirSync(workspacePath);
    return {
      repoId: specification.repoId,
      workspacePath,
      executionUnits: [assessmentUnit({
        repoId: specification.repoId,
        workspacePath,
        language: specification.language,
      })],
    };
  });
  const batchRoot = path.join(root, "batch");
  initializeAssessmentBatch({
    batchRoot,
    resolvedConfig: resolvedConfig(root, repositories),
    selection: { executionUnitIds: specifications.map(({ repoId }) => repoId), approvedNeedsAttention: [] },
    input: {
      batchId: "mixed-assessment",
      userRequest: "Assess all selected repositories",
      phaseApproved: true,
      inputArtifacts: {},
      decisions: { domains: ["security"], analysisCoverage: "full", maxConcurrency: 1 },
    },
    now: "2026-08-17T14:00:00.000Z",
  });
  const { ownerToken } = acquireLease({ batchRoot, invocationId: "mixed-coordinator" });
  const requestDirectories = [];

  for (const [index, specification] of specifications.entries()) {
    const started = startAttempt({
      batchRoot,
      ownerToken,
      executionUnitId: specification.repoId,
      invocationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      now: `2026-08-17T14:0${index}:00.000Z`,
    });
    requestDirectories.push(path.dirname(started.requestPath));
    assert.equal(readState(batchRoot).executionUnits.filter((unit) => unit.status === "running").length, 1);
    const artifacts = createAssessmentArtifacts(started.request.workspacePath, specification.repoId);
    publishAttemptResult({
      requestPath: started.requestPath,
      outcome: {
        status: specification.status,
        artifacts,
        evidence: {
          artifactValidation: "passed",
          ...(specification.language === "typescript" ? { planningSupported: false } : {}),
        },
        needsInput: null,
        error: null,
      },
      now: `2026-08-17T14:0${index}:30.000Z`,
    });
    const committed = commitAttempt({
      batchRoot,
      ownerToken,
      requestPath: started.requestPath,
      now: `2026-08-17T14:0${index}:45.000Z`,
    });
    assert.equal(committed.validation.valid, true);
  }

  assert.equal(new Set(requestDirectories).size, specifications.length);
  assert.deepEqual(
    readState(batchRoot).executionUnits.map(({ status }) => status),
    ["completed", "completed_with_issues", "completed"],
  );
  const typescriptResult = JSON.parse(fs.readFileSync(
    path.join(requestDirectories[2], "result.json"),
    "utf8",
  ));
  assert.equal(typescriptResult.evidence.planningSupported, false);

  const finalized = finalizeAssessmentBatch({
    batchRoot,
    ownerToken,
    now: "2026-08-17T14:04:00.000Z",
  });
  assert.equal(finalized.summary.status, "completed_with_issues");
  assert.deepEqual(finalized.summary.counts, {
    total: 3,
    completed: 2,
    completedWithIssues: 1,
    failed: 0,
  });
});

test("include-path units sharing a Git root remain isolated after a protocol error", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "batch-include-paths-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gitRoot = path.join(root, "portfolio");
  const apiPath = path.join(gitRoot, "services", "api");
  const webPath = path.join(gitRoot, "services", "web");
  fs.mkdirSync(apiPath, { recursive: true });
  fs.mkdirSync(webPath, { recursive: true });
  const units = [
    assessmentUnit({
      repoId: "portfolio",
      executionUnitId: "portfolio/services-api",
      workspacePath: apiPath,
      gitRoot,
      language: "java",
      source: "include-path",
    }),
    assessmentUnit({
      repoId: "portfolio",
      executionUnitId: "portfolio/services-web",
      workspacePath: webPath,
      gitRoot,
      language: "typescript",
      source: "include-path",
    }),
  ];
  const batchRoot = path.join(root, "batch");
  initializeAssessmentBatch({
    batchRoot,
    resolvedConfig: resolvedConfig(root, [{
      repoId: "portfolio",
      workspacePath: gitRoot,
      executionUnits: units,
      includePaths: ["services/api", "services/web"],
    }]),
    selection: {
      executionUnitIds: units.map(({ executionUnitId }) => executionUnitId),
      approvedNeedsAttention: [],
    },
    input: {
      batchId: "include-paths",
      userRequest: "Assess both portfolio services",
      phaseApproved: true,
      inputArtifacts: {},
      decisions: { domains: ["cloud-readiness"], analysisCoverage: "issue-only", maxConcurrency: 1 },
    },
  });
  const { ownerToken } = acquireLease({ batchRoot, invocationId: "include-path-coordinator" });
  const apiAttempt = startAttempt({
    batchRoot,
    ownerToken,
    executionUnitId: units[0].executionUnitId,
    invocationId: "00000000-0000-4000-8000-000000000011",
  });
  assert.throws(
    () => startAttempt({
      batchRoot,
      ownerToken,
      executionUnitId: units[1].executionUnitId,
      invocationId: "00000000-0000-4000-8000-000000000012",
    }),
    /already active/,
  );
  const apiCommit = commitAttempt({ batchRoot, ownerToken, requestPath: apiAttempt.requestPath });
  assert.equal(apiCommit.validation.status, "protocol_error");

  const webAttempt = startAttempt({
    batchRoot,
    ownerToken,
    executionUnitId: units[1].executionUnitId,
    invocationId: "00000000-0000-4000-8000-000000000012",
  });
  assert.equal(webAttempt.request.workspacePath, webPath);
  assert.deepEqual(webAttempt.request.scopeRoots, [webPath]);
  assert.notEqual(path.dirname(apiAttempt.requestPath), path.dirname(webAttempt.requestPath));
  const webArtifacts = createAssessmentArtifacts(webPath, "services-web");
  publishAttemptResult({
    requestPath: webAttempt.requestPath,
    outcome: {
      status: "completed",
      artifacts: webArtifacts,
      evidence: { artifactValidation: "passed", planningSupported: false },
      needsInput: null,
      error: null,
    },
  });
  const webCommit = commitAttempt({ batchRoot, ownerToken, requestPath: webAttempt.requestPath });
  assert.equal(webCommit.validation.valid, true);

  const finalized = finalizeAssessmentBatch({ batchRoot, ownerToken });
  assert.equal(finalized.summary.status, "completed_with_issues");
  assert.deepEqual(finalized.summary.counts, {
    total: 2,
    completed: 1,
    completedWithIssues: 0,
    failed: 1,
  });
  assert.deepEqual(
    finalized.summary.results.map(({ executionUnitId, status }) => ({ executionUnitId, status })),
    [
      { executionUnitId: "portfolio/services-api", status: "protocol_error" },
      { executionUnitId: "portfolio/services-web", status: "completed" },
    ],
  );
});