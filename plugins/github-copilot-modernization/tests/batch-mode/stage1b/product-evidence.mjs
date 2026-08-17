import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TERMINAL_BATCH_STATUSES = new Set(["completed", "completed_with_issues", "failed"]);
const SUCCESS_UNIT_STATUSES = new Set(["completed", "completed_with_issues"]);
const TERMINAL_UNIT_STATUSES = new Set([
  ...SUCCESS_UNIT_STATUSES,
  "protocol_error",
  "failed",
  "interrupted",
]);
const UUID_PATTERN = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[1-5][A-Fa-f0-9]{3}-[89ABab][A-Fa-f0-9]{3}-[A-Fa-f0-9]{12}$/;
const PRODUCT_AGENT_PREFIX = "github-copilot-modernization:";

export class ProductEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProductEvidenceError";
  }
}

function requireEvidence(condition, message) {
  if (!condition) throw new ProductEvidenceError(message);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new ProductEvidenceError(`Unable to read ${label}: ${error.message}`);
  }
}

function readEvents(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    throw new ProductEvidenceError(`Unable to read batch events: ${error.message}`);
  }
}

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fileEvidence(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: path.resolve(filePath),
    bytes: stat.size,
    sha256: fileSha256(filePath),
  };
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  requireEvidence(Number.isFinite(parsed), `${label} is not an ISO timestamp`);
  return parsed;
}

function inputSelectsAgent(value, normalizedAgentName) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((entry) => inputSelectsAgent(entry, normalizedAgentName));
  }
  return Object.entries(value).some(([key, entry]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (["agent", "agenttype", "agentname", "customagent", "customagentname"].includes(normalizedKey)) {
      return String(entry).toLowerCase() === normalizedAgentName;
    }
    return inputSelectsAgent(entry, normalizedAgentName);
  });
}

export function toolCallIdentifiesAgent(toolCall, agentName) {
  const normalizedAgentName = String(agentName).toLowerCase();
  return String(toolCall?.title ?? "").toLowerCase().includes(normalizedAgentName)
    || inputSelectsAgent(toolCall?.rawInput, normalizedAgentName);
}

export function hasToolEvidence(run, agentName) {
  return (run?.toolCalls ?? []).some((toolCall) => toolCallIdentifiesAgent(toolCall, agentName));
}

function inputSelectsExactAgentType(value, expectedAgentType) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((entry) => inputSelectsExactAgentType(entry, expectedAgentType));
  }
  return Object.entries(value).some(([key, entry]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (normalizedKey === "agenttype") {
      return String(entry).toLowerCase() === expectedAgentType;
    }
    return inputSelectsExactAgentType(entry, expectedAgentType);
  });
}

export function toolCallSelectsProductAgent(toolCall, agentName) {
  return inputSelectsExactAgentType(
    toolCall?.rawInput,
    `${PRODUCT_AGENT_PREFIX}${String(agentName).toLowerCase()}`,
  );
}

function productAgentCalls(run, agentName) {
  return (run?.toolCalls ?? []).map((toolCall, index) => ({ toolCall, index }))
    .filter(({ toolCall }) => toolCallSelectsProductAgent(toolCall, agentName));
}

function acceptedChoice(run) {
  const responses = run?.elicitationResponses ?? [];
  requireEvidence(responses.length === 1, `Expected one structured approval response, found ${responses.length}`);
  const response = responses[0]?.response;
  requireEvidence(response?.action === "accept", "Structured approval response was not accepted");
  return Object.values(response.content ?? {}).map(String).join(" ");
}

function validateHostRun(run) {
  requireEvidence(run && typeof run === "object", "ACP run evidence is missing");
  requireEvidence((run.hostErrors ?? []).length === 0, `ACP host failed: ${(run.hostErrors ?? []).join(", ")}`);
  const promptResults = run.promptResults?.length > 0
    ? run.promptResults
    : (run.promptResult ? [run.promptResult] : []);
  requireEvidence(promptResults.length > 0, "ACP prompt results are missing");
  requireEvidence(
    promptResults.every((result) => result?.stopReason === "end_turn"),
    "ACP prompt did not reach end_turn",
  );
}

function validateStartApproval(run, approvalMode) {
  if (approvalMode === "structured") {
    requireEvidence(/start/i.test(acceptedChoice(run)), "Structured response did not select Start batch");
  } else if (approvalMode === "explicit-follow-up") {
    requireEvidence((run.elicitationRequests ?? []).length === 0, "Explicit follow-up mode received an elicitation request");
    requireEvidence((run.elicitationResponses ?? []).length === 0, "Explicit follow-up mode received an elicitation response");
    requireEvidence(run.userPrompts?.length === 2, `Expected two explicit user turns, found ${run.userPrompts?.length ?? 0}`);
    requireEvidence(run.promptResults?.length === 2, `Expected two ACP prompt results, found ${run.promptResults?.length ?? 0}`);
    requireEvidence(run.userPrompts[0] !== "Start batch", "Initial Review request was itself Start batch");
    requireEvidence(run.userPrompts[1] === "Start batch", "Second user turn was not exactly Start batch");
  } else {
    throw new ProductEvidenceError(`Unsupported approval evidence mode: ${approvalMode}`);
  }
  return {
    mode: approvalMode,
    userPrompts: [...(run.userPrompts ?? [])],
    promptStopReasons: (run.promptResults ?? [run.promptResult]).filter(Boolean).map((result) => result.stopReason),
    elicitationCount: run.elicitationRequests?.length ?? 0,
  };
}

function validateProductAgentOrder(run, repositoryCount, approvalMode) {
  const reviewCalls = productAgentCalls(run, "batch-review");
  const coordinatorCalls = productAgentCalls(run, "batch-coordinator");
  const assessmentCalls = productAgentCalls(run, "batch-assessment");
  requireEvidence(reviewCalls.length === 1, `Expected one exact batch-review agent call, found ${reviewCalls.length}`);
  requireEvidence(coordinatorCalls.length === 1, `Expected one exact batch-coordinator agent call, found ${coordinatorCalls.length}`);
  requireEvidence(
    assessmentCalls.length === repositoryCount,
    `Expected ${repositoryCount} exact batch-assessment agent calls, found ${assessmentCalls.length}`,
  );
  requireEvidence(reviewCalls[0].index < coordinatorCalls[0].index, "batch-coordinator ran before batch-review");
  if (approvalMode === "explicit-follow-up") {
    requireEvidence(reviewCalls[0].toolCall.promptIndex === 0, "batch-review did not run in the first user turn");
    requireEvidence(coordinatorCalls[0].toolCall.promptIndex === 1, "batch-coordinator did not run after explicit approval");
    requireEvidence(
      assessmentCalls.every(({ toolCall }) => toolCall.promptIndex === 1),
      "A batch-assessment call did not run after explicit approval",
    );
  }
}

function canaryPath(fixture, canaryName) {
  const [repositoryName, ...segments] = canaryName.split("/");
  const repository = fixture.repositories.find((candidate) => candidate.name === repositoryName);
  requireEvidence(repository, `Canary references unknown repository: ${canaryName}`);
  requireEvidence(segments.length > 0, `Canary has no repository-relative path: ${canaryName}`);
  return path.join(repository.path, ...segments);
}

export function verifyProductSourceCanaries(fixture) {
  const actual = {};
  const changed = [];
  for (const [canaryName, expectedDigest] of Object.entries(fixture.canaries ?? {})) {
    const filePath = canaryPath(fixture, canaryName);
    if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      actual[canaryName] = null;
      changed.push(canaryName);
      continue;
    }
    actual[canaryName] = fileSha256(filePath);
    if (actual[canaryName] !== expectedDigest) changed.push(canaryName);
  }
  return { valid: changed.length === 0, changed, actual };
}

export function computeProductFixtureDigest(fixture) {
  const hash = crypto.createHash("sha256");
  hash.update("stage1b-product-fixture-v1\0");
  for (const canaryName of Object.keys(fixture.canaries ?? {}).sort()) {
    hash.update(canaryName);
    hash.update("\0");
    hash.update(fs.readFileSync(canaryPath(fixture, canaryName)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function listBatchRoots(launchRoot) {
  const batchesRoot = path.join(path.resolve(launchRoot), ".github", "modernize", "batches");
  if (!fs.existsSync(batchesRoot)) return [];
  return fs.readdirSync(batchesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(batchesRoot, entry.name))
    .sort();
}

export function discoverNewBatchRoot(launchRoot, previousRoots = []) {
  const previous = new Set(previousRoots.map((entry) => path.resolve(entry)));
  const created = listBatchRoots(launchRoot).filter((entry) => !previous.has(path.resolve(entry)));
  requireEvidence(created.length === 1, `Expected one new batch root, found ${created.length}`);
  return created[0];
}

function validateReviewRoot(fixture, batchRoot) {
  const expectedParent = path.join(path.resolve(fixture.launchRoot), ".github", "modernize", "batches");
  requireEvidence(isPathInside(expectedParent, batchRoot), "Batch root escapes the fixture batches directory");
  const requiredFiles = [
    "review.json",
    "REVIEW.md",
    path.join("scratch", "resolved-repos.json"),
    path.join("scratch", "inspected-repos.json"),
  ];
  for (const relativePath of requiredFiles) {
    requireEvidence(
      fs.statSync(path.join(batchRoot, relativePath), { throwIfNoEntry: false })?.isFile(),
      `Review artifact is missing: ${relativePath}`,
    );
  }
  const review = readJson(path.join(batchRoot, "review.json"), "batch review");
  requireEvidence(review.status === "ready_for_approval", "Review was not ready for approval");
  requireEvidence(review.batchRoot === path.resolve(batchRoot), "Review batchRoot does not match its directory");
  requireEvidence(review.configSha256 && /^[a-f0-9]{64}$/.test(review.configSha256), "Review config digest is invalid");
  requireEvidence(
    review.selectedExecutionUnitIds?.length === fixture.repositories.length,
    "Review did not select every fixture repository",
  );
  return review;
}

export function validateCancelledProductRun({ fixture, batchRoot, acpRun, approvalMode = "structured" } = {}) {
  validateHostRun(acpRun);
  if (approvalMode === "structured") {
    requireEvidence(/cancel/i.test(acceptedChoice(acpRun)), "Structured response did not select Cancel");
  } else if (approvalMode === "explicit-follow-up") {
    requireEvidence((acpRun.elicitationRequests ?? []).length === 0, "Explicit Cancel received an elicitation request");
    requireEvidence((acpRun.elicitationResponses ?? []).length === 0, "Explicit Cancel received an elicitation response");
    requireEvidence(acpRun.userPrompts?.length === 2, `Expected two explicit Cancel turns, found ${acpRun.userPrompts?.length ?? 0}`);
    requireEvidence(acpRun.promptResults?.length === 2, `Expected two explicit Cancel results, found ${acpRun.promptResults?.length ?? 0}`);
    requireEvidence(acpRun.userPrompts[0] !== "Cancel", "Initial Review request was itself Cancel");
    requireEvidence(acpRun.userPrompts[1] === "Cancel", "Second user turn was not exactly Cancel");
  } else {
    throw new ProductEvidenceError(`Unsupported cancel approval mode: ${approvalMode}`);
  }
  const reviewCalls = productAgentCalls(acpRun, "batch-review");
  const coordinatorCalls = productAgentCalls(acpRun, "batch-coordinator");
  requireEvidence(reviewCalls.length === 1, `Expected one exact batch-review call, found ${reviewCalls.length}`);
  requireEvidence(coordinatorCalls.length === 0, "Cancel unexpectedly invoked batch-coordinator");
  if (approvalMode === "explicit-follow-up") {
    requireEvidence(reviewCalls[0].toolCall.promptIndex === 0, "Cancel Review did not run in the first user turn");
  }
  const review = validateReviewRoot(fixture, path.resolve(batchRoot));
  const forbidden = [
    "selection.json",
    "assessment-input.json",
    "manifest.json",
    "state.json",
    "events.jsonl",
    "lease.json",
    "attempts",
    "repos",
    "summary.json",
    "summary.md",
  ];
  const unexpected = forbidden.filter((relativePath) => fs.existsSync(path.join(batchRoot, relativePath)));
  requireEvidence(unexpected.length === 0, `Cancel left approval-bearing artifacts: ${unexpected.join(", ")}`);
  const canaries = verifyProductSourceCanaries(fixture);
  requireEvidence(canaries.valid, `Cancel changed source canaries: ${canaries.changed.join(", ")}`);
  return {
    status: "passed",
    batchId: review.batchId,
    batchRoot: path.resolve(batchRoot),
    approvalMode,
    elicitationCount: acpRun.elicitationRequests?.length ?? 0,
    sourceCanaries: canaries,
    review: fileEvidence(path.join(batchRoot, "review.json")),
  };
}

function requireControlFiles(batchRoot) {
  for (const relativePath of [
    "review.json",
    "manifest.json",
    "state.json",
    "events.jsonl",
    "summary.json",
    "summary.md",
  ]) {
    requireEvidence(
      fs.statSync(path.join(batchRoot, relativePath), { throwIfNoEntry: false })?.isFile(),
      `Batch control artifact is missing: ${relativePath}`,
    );
  }
  requireEvidence(!fs.existsSync(path.join(batchRoot, "lease.json")), "Finalized batch retained its lease");
}

function validateEventLog(events, batchId) {
  const eventIds = new Set();
  for (const [index, event] of events.entries()) {
    requireEvidence(event.sequence === index + 1, `Event sequence is not contiguous at ${index + 1}`);
    requireEvidence(event.batchId === batchId, `Event ${event.sequence} has the wrong batchId`);
    requireEvidence(UUID_PATTERN.test(event.eventId), `Event ${event.sequence} has an invalid eventId`);
    requireEvidence(!eventIds.has(event.eventId), `Event ${event.sequence} repeats an eventId`);
    eventIds.add(event.eventId);
    timestamp(event.at, `Event ${event.sequence} timestamp`);
  }
}

function expectedSummaryCounts(units) {
  return {
    total: units.length,
    completed: units.filter((unit) => unit.status === "completed").length,
    completedWithIssues: units.filter((unit) => unit.status === "completed_with_issues").length,
    failed: units.filter((unit) => ["protocol_error", "failed", "interrupted"].includes(unit.status)).length,
  };
}

function validateResultArtifacts(result, batchRoot, workspacePath) {
  const artifacts = {};
  for (const [name, artifactPath] of Object.entries(result.artifacts ?? {})) {
    requireEvidence(path.isAbsolute(artifactPath), `Result artifact ${name} is not absolute`);
    requireEvidence(
      isPathInside(batchRoot, artifactPath) || isPathInside(workspacePath, artifactPath),
      `Result artifact ${name} escapes the attempt roots`,
    );
    requireEvidence(fs.statSync(artifactPath, { throwIfNoEntry: false })?.isFile(), `Result artifact ${name} is missing`);
    artifacts[name] = fileEvidence(artifactPath);
  }
  if (SUCCESS_UNIT_STATUSES.has(result.status)) {
    requireEvidence(result.evidence?.artifactValidation === "passed", "Successful result lacks passed artifact validation");
    requireEvidence(artifacts.report, "Successful Assessment has no report artifact");
    requireEvidence(artifacts.html, "Successful Assessment has no HTML artifact");
    const report = readJson(artifacts.report.path, "Assessment report");
    requireEvidence(report && typeof report === "object" && !Array.isArray(report), "Assessment report is not an object");
    requireEvidence(artifacts.html.bytes > 0, "Assessment HTML artifact is empty");
  }
  return artifacts;
}

function matchingFixtureRepository(fixture, workspacePath) {
  const matches = fixture.repositories.filter(
    (repository) => path.resolve(repository.path) === path.resolve(workspacePath),
  );
  requireEvidence(matches.length === 1, `Attempt workspace is not a fixture repository: ${workspacePath}`);
  return matches[0];
}

function validateAttempt({ fixture, batchRoot, batchId, unit, events, summaryResult }) {
  requireEvidence(TERMINAL_UNIT_STATUSES.has(unit.status), `Execution unit is not terminal: ${unit.executionUnitId}`);
  requireEvidence(UUID_PATTERN.test(unit.invocationId), `Execution unit has an invalid invocationId: ${unit.executionUnitId}`);
  requireEvidence(unit.attempt === 1, `Execution unit did not use its first attempt: ${unit.executionUnitId}`);
  const startedAt = timestamp(unit.startedAt, `${unit.executionUnitId} startedAt`);
  const finishedAt = timestamp(unit.finishedAt, `${unit.executionUnitId} finishedAt`);
  requireEvidence(startedAt <= finishedAt, `${unit.executionUnitId} finished before it started`);

  const startedEvents = events.filter((event) => event.type === "attempt_started"
    && event.executionUnitId === unit.executionUnitId);
  const finishedEvents = events.filter((event) => event.type === "attempt_finished"
    && event.executionUnitId === unit.executionUnitId);
  requireEvidence(startedEvents.length === 1, `${unit.executionUnitId} has ${startedEvents.length} start events`);
  requireEvidence(finishedEvents.length === 1, `${unit.executionUnitId} has ${finishedEvents.length} finish events`);
  const startedEvent = startedEvents[0];
  const finishedEvent = finishedEvents[0];
  requireEvidence(startedEvent.invocationId === unit.invocationId, `${unit.executionUnitId} start event invocation mismatch`);
  requireEvidence(finishedEvent.invocationId === unit.invocationId, `${unit.executionUnitId} finish event invocation mismatch`);
  requireEvidence(startedEvent.sequence < finishedEvent.sequence, `${unit.executionUnitId} event order is invalid`);
  requireEvidence(timestamp(startedEvent.at, "attempt_started timestamp") >= startedAt, `${unit.executionUnitId} start event predates state`);
  requireEvidence(timestamp(finishedEvent.at, "attempt_finished timestamp") >= finishedAt, `${unit.executionUnitId} finish event predates state`);

  const requestPath = path.resolve(startedEvent.payload?.requestPath ?? "");
  const resultPath = path.resolve(startedEvent.payload?.resultPath ?? "");
  requireEvidence(isPathInside(path.join(batchRoot, "attempts"), requestPath), `${unit.executionUnitId} request escapes attempts`);
  requireEvidence(path.basename(requestPath) === "request.json", `${unit.executionUnitId} request path is invalid`);
  requireEvidence(path.basename(resultPath) === "result.json", `${unit.executionUnitId} result path is invalid`);
  requireEvidence(path.dirname(requestPath) === path.dirname(resultPath), `${unit.executionUnitId} request/result are not colocated`);
  requireEvidence(fs.statSync(requestPath, { throwIfNoEntry: false })?.isFile(), `${unit.executionUnitId} request is missing`);
  const request = readJson(requestPath, `${unit.executionUnitId} request`);
  for (const [field, expected] of Object.entries({
    batchId,
    invocationId: unit.invocationId,
    repoId: unit.repoId,
    executionUnitId: unit.executionUnitId,
    phase: "assessment",
    attempt: 1,
    mode: "batch-headless",
    phaseApproved: true,
    resultPath,
  })) {
    requireEvidence(request[field] === expected, `${unit.executionUnitId} request ${field} mismatch`);
  }
  matchingFixtureRepository(fixture, request.workspacePath);
  requireEvidence(unit.resultPath === resultPath, `${unit.executionUnitId} state resultPath mismatch`);

  let result = null;
  let artifacts = {};
  if (fs.existsSync(resultPath)) {
    result = readJson(resultPath, `${unit.executionUnitId} result`);
    for (const [field, expected] of Object.entries({
      batchId,
      invocationId: unit.invocationId,
      repoId: unit.repoId,
      executionUnitId: unit.executionUnitId,
      phase: "assessment",
      attempt: 1,
    })) {
      requireEvidence(result[field] === expected, `${unit.executionUnitId} result ${field} mismatch`);
    }
    const committedStatus = result.status === "skipped" ? "failed" : result.status;
    requireEvidence(unit.status === committedStatus, `${unit.executionUnitId} result/state status mismatch`);
    requireEvidence(timestamp(result.completedAt, `${unit.executionUnitId} completedAt`) <= finishedAt, `${unit.executionUnitId} result postdates commit`);
    artifacts = validateResultArtifacts(result, batchRoot, request.workspacePath);
  } else {
    requireEvidence(unit.status === "protocol_error", `${unit.executionUnitId} is missing a non-protocol-error result`);
  }

  if (SUCCESS_UNIT_STATUSES.has(unit.status)) {
    requireEvidence(fs.statSync(path.join(path.dirname(requestPath), "scratch"), { throwIfNoEntry: false })?.isDirectory(), `${unit.executionUnitId} scratch is missing`);
  }
  const repoStatePath = path.join(batchRoot, "repos", `${unit.repoId}.json`);
  const repoState = readJson(repoStatePath, `${unit.repoId} repository state`);
  const validation = repoState.validations?.[unit.executionUnitId];
  requireEvidence(validation, `${unit.executionUnitId} repository validation is missing`);
  requireEvidence(validation.status === (result?.status ?? "protocol_error"), `${unit.executionUnitId} repository validation status mismatch`);
  requireEvidence(summaryResult?.status === unit.status, `${unit.executionUnitId} summary status mismatch`);
  for (const artifactName of Object.keys(artifacts)) {
    requireEvidence(
      path.resolve(summaryResult.artifacts?.[artifactName] ?? "") === path.resolve(artifacts[artifactName].path),
      `${unit.executionUnitId} summary artifact ${artifactName} mismatch`,
    );
  }

  return {
    repoId: unit.repoId,
    executionUnitId: unit.executionUnitId,
    invocationId: unit.invocationId,
    status: unit.status,
    startedAt: unit.startedAt,
    finishedAt: unit.finishedAt,
    startSequence: startedEvent.sequence,
    finishSequence: finishedEvent.sequence,
    request: fileEvidence(requestPath),
    result: result ? fileEvidence(resultPath) : null,
    scratchPath: path.join(path.dirname(requestPath), "scratch"),
    artifacts,
  };
}

export function validateCompletedProductRun({ fixture, batchRoot, acpRun, approvalMode = "structured" } = {}) {
  validateHostRun(acpRun);
  const approval = validateStartApproval(acpRun, approvalMode);
  validateProductAgentOrder(acpRun, fixture.repositories.length, approvalMode);
  const root = path.resolve(batchRoot);
  validateReviewRoot(fixture, root);
  requireControlFiles(root);
  const manifest = readJson(path.join(root, "manifest.json"), "batch manifest");
  const state = readJson(path.join(root, "state.json"), "batch state");
  const summary = readJson(path.join(root, "summary.json"), "batch summary");
  const events = readEvents(path.join(root, "events.jsonl"));
  requireEvidence(manifest.batchId === state.batchId && state.batchId === summary.batchId, "Batch identity differs across control artifacts");
  requireEvidence(manifest.action === "assessment" && manifest.executionMode === "local", "Manifest is outside the Stage 1B boundary");
  requireEvidence(manifest.assessment?.phaseApproved === true, "Manifest lacks approved Assessment input");
  requireEvidence(manifest.assessment?.decisions?.maxConcurrency === 1, "Manifest does not enforce maxConcurrency 1");
  requireEvidence(TERMINAL_BATCH_STATUSES.has(state.status), `Batch state is not terminal: ${state.status}`);
  requireEvidence(summary.status === state.status, "Summary status does not match state");
  requireEvidence(state.executionUnits?.length === fixture.repositories.length, "Batch state does not contain both fixture repositories");
  requireEvidence(
    manifest.selectedExecutionUnitIds?.length === state.executionUnits.length,
    "Manifest selection does not match state units",
  );
  validateEventLog(events, state.batchId);
  const completedEvents = events.filter((event) => event.type === "batch_completed");
  requireEvidence(completedEvents.length === 1, `Expected one batch_completed event, found ${completedEvents.length}`);
  const summaryResults = new Map((summary.results ?? []).map((result) => [result.executionUnitId, result]));
  const attempts = state.executionUnits.map((unit) => validateAttempt({
    fixture,
    batchRoot: root,
    batchId: state.batchId,
    unit,
    events,
    summaryResult: summaryResults.get(unit.executionUnitId),
  }));
  requireEvidence(new Set(attempts.map((attempt) => attempt.invocationId)).size === attempts.length, "Attempts reused an invocationId");
  for (let index = 1; index < attempts.length; index += 1) {
    const previous = attempts[index - 1];
    const current = attempts[index];
    requireEvidence(
      timestamp(previous.finishedAt, `${previous.executionUnitId} finishedAt`) <= timestamp(current.startedAt, `${current.executionUnitId} startedAt`),
      `${current.executionUnitId} started before ${previous.executionUnitId} finished`,
    );
    requireEvidence(previous.finishSequence < current.startSequence, "Attempt events are not strictly sequential");
  }
  requireEvidence(
    JSON.stringify(summary.counts) === JSON.stringify(expectedSummaryCounts(state.executionUnits)),
    "Summary counts do not match terminal state",
  );
  const canaries = verifyProductSourceCanaries(fixture);
  requireEvidence(canaries.valid, `Assessment changed source canaries: ${canaries.changed.join(", ")}`);
  return {
    status: "passed",
    batchId: state.batchId,
    batchRoot: root,
    batchStatus: state.status,
    elicitationCount: acpRun.elicitationRequests?.length ?? 0,
    approval,
    sequential: true,
    sourceCanaries: canaries,
    attempts,
    controlArtifacts: {
      manifest: fileEvidence(path.join(root, "manifest.json")),
      state: fileEvidence(path.join(root, "state.json")),
      events: fileEvidence(path.join(root, "events.jsonl")),
      summary: fileEvidence(path.join(root, "summary.json")),
    },
  };
}