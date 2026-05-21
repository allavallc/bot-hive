import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const createdDirs: string[] = [];

function windowsPath(p: string): string {
  return execFileSync("wslpath", ["-w", p], { encoding: "utf8" }).trim();
}

function runResolveApiBase(options: {
  cwdPath: string;
  persistedApiBase?: string;
  devLog?: string;
  envApiBase?: string;
  reachableBases?: Record<string, boolean>;
}) {
  const tmpDir = fs.mkdtempSync(path.join(options.cwdPath, ".tmp-api-base-test-"));
  createdDirs.push(tmpDir);

  const persistedPath = path.join(tmpDir, ".bot-hive-api-url");
  const devLogPath = path.join(tmpDir, ".bot-hive-dev.log");

  if (options.persistedApiBase !== undefined) {
    fs.writeFileSync(persistedPath, `${options.persistedApiBase}\n`, "utf8");
  }
  if (options.devLog !== undefined) {
    fs.writeFileSync(devLogPath, options.devLog, "utf8");
  }

  const helperPath = windowsPath(path.join(options.cwdPath, "scripts", "lib", "api-base.ps1"));
  const persistedPathWin = windowsPath(persistedPath);
  const devLogPathWin = windowsPath(devLogPath);
  const reachable = JSON.stringify(options.reachableBases ?? {});
  const envApiBase = options.envApiBase ?? "";

  const script = [
    `$reachable = ConvertFrom-Json '${reachable.replace(/'/g, "''")}'`,
    `. '${helperPath}'`,
    "function Test-ApiBaseReachable {",
    "  param([string]$Base)",
    "  $key = Normalize-ApiBase $Base",
    "  $match = $reachable.PSObject.Properties | Where-Object { $_.Name -ieq $key } | Select-Object -First 1",
    "  if ($match) { return [bool]$match.Value }",
    "  return $false",
    "}",
    `$result = Resolve-BotHiveApiBase -PersistedApiBasePath '${persistedPathWin}' -DevLogPath '${devLogPathWin}' -EnvApiBase '${envApiBase.replace(/'/g, "''")}'`,
    "$result | ConvertTo-Json -Compress",
  ].join("\n");

  const stdout = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 15000,
  }).trim();

  return JSON.parse(stdout) as {
    ApiBase: string;
    Source: string;
    Reachable: boolean;
    ReachabilityChecked: boolean;
    CandidatesTried: string[];
  };
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function runReachabilityProbe(url: string) {
  const cwdPath = path.resolve(process.cwd());
  const helperPath = windowsPath(path.join(cwdPath, "scripts", "lib", "api-base.ps1"));
  const script = [
    `. '${helperPath}'`,
    `$result = Test-ApiBaseReachable -Base '${url.replace(/'/g, "''")}'`,
    "Write-Output $result",
  ].join("\n");

  return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 15000,
  }).trim();
}

function runHttpClientConstructionCheck() {
  const cwdPath = path.resolve(process.cwd());
  const helperPath = windowsPath(path.join(cwdPath, "scripts", "lib", "api-base.ps1"));
  const script = [
    `. '${helperPath}'`,
    "Add-Type -AssemblyName System.Net.Http -ErrorAction Stop | Out-Null",
    "$client = New-Object System.Net.Http.HttpClient",
    "try { Write-Output ($null -ne $client) } finally { if ($client) { $client.Dispose() } }",
  ].join("\n");

  return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    timeout: 15000,
  }).trim();
}

describe("Resolve-BotHiveApiBase", () => {
  const cwdPath = path.resolve(process.cwd());

  test("prefers reachable dev-log localhost over unreachable persisted network URL", () => {
    const result = runResolveApiBase({
      cwdPath,
      persistedApiBase: "http://10.5.0.2:3001",
      devLog: [
        "Local:        http://localhost:3001",
        "Network:      http://10.5.0.2:3001",
      ].join(os.EOL),
      reachableBases: {
        "http://localhost:3001": true,
        "http://10.5.0.2:3001": false,
        "https://bot-hive-j0ax.onrender.com": false,
      },
    });

    expect(result.ApiBase).toBe("http://localhost:3001");
    expect(result.Source).toBe("dev-log-local");
    expect(result.Reachable).toBe(true);
    expect(result.CandidatesTried[0]).toBe("dev-log-local=http://localhost:3001");
  });

  test("keeps explicit BOT_HIVE_API_URL authoritative", () => {
    const result = runResolveApiBase({
      cwdPath,
      persistedApiBase: "http://10.5.0.2:3001",
      devLog: "Local:        http://localhost:3001",
      envApiBase: "https://example.invalid/custom",
      reachableBases: {
        "http://localhost:3001": true,
      },
    });

    expect(result.ApiBase).toBe("https://example.invalid/custom");
    expect(result.Source).toBe("env");
    expect(result.ReachabilityChecked).toBe(false);
  });

  test("falls back to reachable persisted URL when localhost is unavailable", () => {
    const result = runResolveApiBase({
      cwdPath,
      persistedApiBase: "http://10.5.0.2:3001",
      devLog: [
        "Local:        http://localhost:3001",
        "Network:      http://10.5.0.2:3001",
      ].join(os.EOL),
      reachableBases: {
        "http://localhost:3001": false,
        "http://10.5.0.2:3001": true,
      },
    });

    expect(result.ApiBase).toBe("http://10.5.0.2:3001");
    expect(result.Source).toBe("persisted");
    expect(result.Reachable).toBe(true);
  });

  test("PowerShell can construct HttpClient for the probe helper", () => {
    expect(runHttpClientConstructionCheck()).toBe("True");
  });
});
