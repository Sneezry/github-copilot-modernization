---
name: fact-application-type
description: Determine the type of application (Web App, API, Service, etc.)
user-invocable: false
---

# Application Type Analysis

## Purpose
Identify the type of application based on code structure and dependencies.

## Automated Analysis

This SKILL includes executable scripts that automatically determine the application type.

### Usage

**Bash:**
```bash
bash .github/modernize/.runtime/assessment/atomic/fact-application-type/analyze.sh <absolute-project-root>
```

**PowerShell:**
```powershell
pwsh .github/modernize/.runtime/assessment/atomic/fact-application-type/analyze.ps1 -ProjectPath <absolute-project-root>
```

### Detected Application Types

- **Web App / REST API**: Spring Boot, ASP.NET Core, Express, Flask, FastAPI
- **gRPC Service**: gRPC dependencies detected
- **Background Service**: BackgroundService, worker processes
- **Batch Job**: Scheduled tasks, cron jobs

### Script Output Format

```json
{
  "input_name": "Application Type",
  "analysis_method": "Code",
  "status": "success",
  "result": {
    "finding": "REST API",
    "confidence": "high",
    "evidence": [
      "Spring Boot REST found"
    ],
    "values": ["REST API"],
    "script_output": {
      "application_type": "REST API"
    }
  },
  "execution_time_seconds": 0.5,
  "timestamp": "2026-02-28T10:30:00Z"
}
```

## Manual Analysis Steps (for AI interpretation)

If scripts are unavailable:

### 1. Check for Web Frameworks
