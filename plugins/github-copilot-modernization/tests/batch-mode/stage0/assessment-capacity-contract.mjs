export function buildWaves(taskIds, maxConcurrency) {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error("maxConcurrency must be a positive integer");
  }
  const waves = [];
  for (let index = 0; index < taskIds.length; index += maxConcurrency) {
    waves.push(taskIds.slice(index, index + maxConcurrency));
  }
  return waves;
}

export function aggregateTaskResults(taskIds, results) {
  const byTask = new Map();
  for (const result of results) {
    if (!taskIds.includes(result.taskId)) {
      throw new Error(`Unexpected task result: ${result.taskId}`);
    }
    if (byTask.has(result.taskId)) {
      throw new Error(`Duplicate task result: ${result.taskId}`);
    }
    byTask.set(result.taskId, result);
  }

  const missing = taskIds.filter((taskId) => !byTask.has(taskId));
  if (missing.length > 0) {
    throw new Error(`Missing task results: ${missing.join(", ")}`);
  }
  const tasks = taskIds.map((taskId) => byTask.get(taskId));
  return {
    status: tasks.some((result) => result.status !== "completed")
      ? "completed_with_issues"
      : "completed",
    tasks,
  };
}