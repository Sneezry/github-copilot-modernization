import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSafePersistedValue } from "./batch-state.mjs";
import { canonicalPath, isPathInside } from "./inspect-workspaces.mjs";
import { validateSchema } from "./schema-validator.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(scriptRoot, "..", "schemas", "attempt-result.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const SUCCESS_STATUSES = new Set(["completed", "completed_with_issues"]);
const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "skipped", "not_applicable"]);
const SUCCESS_CRITERIA_STATUSES = new Set(["passed", "exempt", "not_applicable"]);

function readJsonArtifact(filePath, label, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function validateIdentity(result, expected, errors) {
  for (const field of [
    "batchId",
    "invocationId",
    "repoId",
    "executionUnitId",
    "phase",
    "attempt",
  ]) {
    if (expected[field] !== undefined && result[field] !== expected[field]) {
      errors.push(`${field} does not match the expected attempt`);
    }
  }
}

function resolveArtifactPaths(result, { batchRoot, workspacePath }, errors) {
  const roots = [];
  for (const [label, rootPath] of [["batchRoot", batchRoot], ["workspacePath", workspacePath]]) {
    try {
      roots.push(canonicalPath(rootPath));
    } catch (error) {
      errors.push(`${label} is unavailable: ${error.message}`);
    }
  }
  const artifacts = {};
  for (const [name, artifactPath] of Object.entries(result.artifacts ?? {})) {
    if (!path.isAbsolute(artifactPath)) {
      errors.push(`artifact ${name} must use an absolute path`);
      continue;
    }
    if (!fs.existsSync(artifactPath)) {
      errors.push(`artifact ${name} does not exist`);
      continue;
    }
    let canonicalArtifact;
    try {
      canonicalArtifact = canonicalPath(artifactPath);
    } catch (error) {
      errors.push(`artifact ${name} cannot be resolved: ${error.message}`);
      continue;
    }
    if (!roots.some((root) => isPathInside(root, canonicalArtifact))) {
      errors.push(`artifact ${name} escapes the batch and workspace roots`);
      continue;
    }
    artifacts[name] = canonicalArtifact;
  }
  return artifacts;
}

function requireArtifact(artifacts, name, errors) {
  if (!artifacts[name]) errors.push(`required artifact ${name} is missing or invalid`);
  return artifacts[name];
}

function validateAssessment(artifacts, errors) {
  const reportPath = requireArtifact(artifacts, "report", errors);
  const htmlPath = requireArtifact(artifacts, "html", errors);
  if (reportPath) {
    const report = readJsonArtifact(reportPath, "assessment report", errors);
    if (report && typeof report !== "object") errors.push("assessment report must contain an object");
  }
  if (htmlPath && fs.statSync(htmlPath).size === 0) errors.push("assessment HTML report is empty");
}

function validatePlanning(artifacts, errors) {
  const planPath = requireArtifact(artifacts, "plan", errors);
  const tasksPath = requireArtifact(artifacts, "tasks", errors);
  if (planPath && !fs.readFileSync(planPath, "utf8").trim()) errors.push("plan.md is empty");
  if (tasksPath) {
    const tasks = readJsonArtifact(tasksPath, "planning tasks", errors);
    if (tasks && !Array.isArray(tasks.tasks)) errors.push("planning tasks must contain a tasks array");
  }
}

function validateExecution(result, artifacts, errors) {
  const summaryPath = requireArtifact(artifacts, "summary", errors);
  const taskStatusPath = requireArtifact(artifacts, "taskStatus", errors);
  if (summaryPath && !fs.readFileSync(summaryPath, "utf8").trim()) errors.push("execution summary is empty");
  if (taskStatusPath) {
    const taskStatus = readJsonArtifact(taskStatusPath, "execution task status", errors);
    if (!taskStatus || !Array.isArray(taskStatus.tasks) || taskStatus.tasks.length === 0) {
      errors.push("execution task status must contain a non-empty tasks array");
    } else {
      for (const [index, task] of taskStatus.tasks.entries()) {
        if (!TERMINAL_TASK_STATUSES.has(task?.status)) {
          errors.push(`execution task ${index} has no supported terminal status`);
        }
      }
    }
  }
  const criteria = result.evidence?.successCriteria;
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) {
    errors.push("execution evidence must include successCriteria");
    return;
  }
  for (const key of ["build", "tests"]) {
    if (!SUCCESS_CRITERIA_STATUSES.has(criteria[key])) {
      errors.push(`execution successCriteria.${key} must be passed, exempt, or not_applicable`);
    }
  }
}

function validateStatusContract(result, errors) {
  if (result.status === "needs_input") {
    if (!result.needsInput) errors.push("needs_input status requires a needsInput payload");
  } else if (result.needsInput !== null) {
    errors.push("needsInput must be null unless status is needs_input");
  }
  if (result.status === "failed" && !result.error) {
    errors.push("failed status requires an error payload");
  }
  if (SUCCESS_STATUSES.has(result.status) && result.error !== null) {
    errors.push("successful statuses cannot contain an error payload");
  }
}

export function validateAttemptResult(result, {
  expected = {},
  batchRoot,
  workspacePath,
} = {}) {
  const errors = validateSchema(result, schema, schemaPath);
  try {
    assertSafePersistedValue(result);
  } catch (error) {
    errors.push(error.message);
  }
  validateIdentity(result, expected, errors);
  validateStatusContract(result, errors);
  const artifacts = resolveArtifactPaths(result, { batchRoot, workspacePath }, errors);
  if (SUCCESS_STATUSES.has(result.status)) {
    if (result.phase === "assessment") validateAssessment(artifacts, errors);
    if (result.phase === "planning") validatePlanning(artifacts, errors);
    if (result.phase === "execution") validateExecution(result, artifacts, errors);
  }
  return {
    valid: errors.length === 0,
    status: errors.length === 0 ? result.status : "protocol_error",
    errors,
    artifacts,
  };
}

export function validateAttemptResultFile(resultPath, options = {}) {
  let result;
  try {
    result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  } catch (error) {
    return {
      valid: false,
      status: "protocol_error",
      errors: [`result file is missing or invalid JSON: ${error.message}`],
      artifacts: {},
    };
  }
  return validateAttemptResult(result, options);
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultPath = optionValue("--result");
  const validation = validateAttemptResultFile(resultPath, {
    batchRoot: optionValue("--batch-root"),
    workspacePath: optionValue("--workspace"),
    expected: {
      batchId: optionValue("--batch-id"),
      invocationId: optionValue("--invocation-id"),
      repoId: optionValue("--repo-id"),
      executionUnitId: optionValue("--execution-unit-id"),
      phase: optionValue("--phase"),
      attempt: Number(optionValue("--attempt")),
    },
  });
  process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
  if (!validation.valid) process.exitCode = 1;
}