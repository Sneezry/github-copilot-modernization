import fs from "node:fs";
import path from "node:path";

export const FACT_SKILL_IDS = Object.freeze([
  "architecture-diagram",
  "dependency-map",
  "api-service-contracts",
  "data-architecture",
  "configuration-inventory",
  "business-workflows",
]);

export const SECURITY_CWE_SKILL_IDS = Object.freeze([
  "cwe-code-quality",
  "cwe-concurrency-synchronization",
  "cwe-credentials-secrets",
  "cwe-file-path-security",
  "cwe-injection-attacks",
  "cwe-memory-safety",
]);

export const SECURITY_SKILL_IDS = Object.freeze([
  "cve-known-vulnerabilities",
  ...SECURITY_CWE_SKILL_IDS,
]);

const SUPPORTED_DOMAINS = new Set(["security", "cloud-readiness", "java-upgrade"]);
const SUPPORTED_COVERAGE = new Set(["issue-only", "full"]);

function normalizeDomains(domains) {
  return [...new Set((domains ?? []).filter((domain) => SUPPORTED_DOMAINS.has(domain)))];
}

function task(skillId, outputPath) {
  return { skillId, outputPath };
}

export function buildAssessmentPlan({
  domains = [],
  analysisCoverage = "issue-only",
  assessmentRoot = path.join(".github", "modernize", "assessment"),
} = {}) {
  if (!SUPPORTED_COVERAGE.has(analysisCoverage)) {
    throw new Error(`Unsupported analysis coverage: ${analysisCoverage}`);
  }

  const selectedDomains = normalizeDomains(domains);
  const batches = [];

  if (selectedDomains.includes("security")) {
    const securityRoot = path.join(assessmentRoot, "engines", "security", "incoming");
    batches.push({
      id: "security",
      execution: "parallel",
      maxConcurrency: SECURITY_SKILL_IDS.length,
      tasks: SECURITY_SKILL_IDS.map((skillId) =>
        task(skillId, path.join(securityRoot, `${skillId}.json`))),
    });
  }

  if (analysisCoverage === "full") {
    const factsRoot = path.join(assessmentRoot, "engines", "facts");
    batches.push({
      id: "facts",
      execution: "parallel",
      maxConcurrency: FACT_SKILL_IDS.length,
      tasks: FACT_SKILL_IDS.map((skillId) =>
        task(skillId, path.join(factsRoot, `${skillId}.md`))),
    });
  }

  return {
    version: 1,
    domains: selectedDomains,
    analysisCoverage,
    appcat: selectedDomains.filter((domain) => domain !== "security"),
    batches,
    maxConcurrentSubagents: batches.reduce(
      (maximum, batch) => Math.max(maximum, batch.maxConcurrency),
      0,
    ),
  };
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

function writeRunMetadata({ runDir, runId, language, plan }) {
  fs.mkdirSync(runDir, { recursive: true });
  const selectedSkills = plan.batches.flatMap((batch) => batch.tasks.map((entry) => entry.skillId));
  const intent = [
    "version: 1",
    `captured_at: ${yamlScalar(new Date().toISOString())}`,
    `language: ${yamlScalar(language)}`,
    "selected_groups:",
    ...plan.domains.map((domain) => `  - ${yamlScalar(domain)}`),
    `analysis_coverage: ${yamlScalar(plan.analysisCoverage)}`,
    "",
  ].join("\n");
  const selected = [
    "version: 1",
    "skills:",
    ...selectedSkills.map((skillId) => `  - ${yamlScalar(skillId)}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(runDir, "intent.yaml"), intent, "utf8");
  fs.writeFileSync(path.join(runDir, "selected-skills.yaml"), selected, "utf8");
}

export function prepareAssessmentRun({
  workspacePath,
  runId,
  language,
  domains = [],
  analysisCoverage = "issue-only",
} = {}) {
  if (!workspacePath || !runId || !language) {
    throw new Error("workspacePath, runId, and language are required");
  }

  const workspaceRoot = path.resolve(workspacePath);
  const assessmentRoot = path.join(workspaceRoot, ".github", "modernize", "assessment");
  const memoryDir = path.join(workspaceRoot, ".github", "modernize", ".memory");
  const runDir = path.join(memoryDir, "runs", runId);
  const findingsPath = path.join(memoryDir, "findings.yaml");
  const plan = buildAssessmentPlan({ domains, analysisCoverage, assessmentRoot });

  fs.mkdirSync(memoryDir, { recursive: true });
  if (!fs.existsSync(findingsPath)) {
    fs.writeFileSync(findingsPath, "version: 1\nfindings: []\n", "utf8");
  }
  writeRunMetadata({ runDir, runId, language, plan });

  for (const batch of plan.batches) {
    for (const entry of batch.tasks) {
      fs.mkdirSync(path.dirname(entry.outputPath), { recursive: true });
      fs.rmSync(entry.outputPath, { force: true });
    }
  }

  return {
    ...plan,
    workspacePath: workspaceRoot,
    assessmentRoot,
    memoryDir,
    runDir,
    findingsPath,
    appcatDir: path.join(runDir, "appcat"),
    reportsDir: path.join(assessmentRoot, "reports"),
    htmlReportsDir: path.join(workspaceRoot, ".github", "modernize", "reports"),
  };
}

export function archiveFactFiles({ workspacePath, reportPath, analysisCoverage } = {}) {
  if (analysisCoverage !== "full") {
    return { archived: [], missing: [] };
  }
  if (!workspacePath || !reportPath) {
    throw new Error("workspacePath and reportPath are required");
  }

  const sourceDir = path.join(
    path.resolve(workspacePath),
    ".github",
    "modernize",
    "assessment",
    "engines",
    "facts",
  );
  const destinationDir = path.join(path.dirname(path.resolve(reportPath)), "facts");
  const missing = FACT_SKILL_IDS.filter(
    (skillId) => !fs.existsSync(path.join(sourceDir, `${skillId}.md`)),
  );
  if (missing.length > 0) {
    return { archived: [], missing };
  }

  fs.mkdirSync(destinationDir, { recursive: true });
  const archived = [];
  for (const skillId of FACT_SKILL_IDS) {
    const fileName = `${skillId}.md`;
    const destination = path.join(destinationDir, fileName);
    fs.copyFileSync(path.join(sourceDir, fileName), destination);
    archived.push(destination);
  }
  return { archived, missing: [] };
}
