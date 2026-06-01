import { Hono } from "hono";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { createModuleLogger } from "../../lib/debug-log.js";
import { runHealthChecks, getFixAction } from "../utils/health-checks.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const log = createModuleLogger("system-health");

async function verifyWindowsSignature(filePath) {
  if (process.platform !== "win32") {
    return {
      supported: false,
      platform: process.platform,
      message: "Code signing verification is only available on Windows",
    };
  }

  if (!filePath || typeof filePath !== "string" || filePath.includes("\0")) {
    return { supported: true, signed: false, valid: false, status: "InvalidPath", message: "Invalid file path" };
  }

  try {
    const psScript = `
$sig = Get-AuthenticodeSignature -LiteralFilePath $args[0]
[PSCustomObject]@{
  Status = $sig.Status.ToString()
  StatusMessage = $sig.StatusMessage
  SignerCertificate = if ($sig.SignerCertificate) {
    [PSCustomObject]@{
      Subject = $sig.SignerCertificate.Subject
      Issuer = $sig.SignerCertificate.Issuer
      NotBefore = $sig.SignerCertificate.NotBefore.ToString('o')
      NotAfter = $sig.SignerCertificate.NotAfter.ToString('o')
      Thumbprint = $sig.SignerCertificate.Thumbprint
    }
  } else { $null }
} | ConvertTo-Json -Depth 3`.trim();

    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", psScript, "-", filePath],
      { timeout: 15000, windowsHide: true }
    );

    const result = JSON.parse(stdout.trim());
    const isValid = result.Status === "Valid";

    return {
      supported: true,
      signed: result.Status !== "NotSigned",
      valid: isValid,
      status: result.Status,
      message: result.StatusMessage || null,
      signer: result.SignerCertificate
        ? {
            subject: result.SignerCertificate.Subject,
            issuer: result.SignerCertificate.Issuer,
            validFrom: result.SignerCertificate.NotBefore,
            validTo: result.SignerCertificate.NotAfter,
            thumbprint: result.SignerCertificate.Thumbprint,
          }
        : null,
    };
  } catch (err) {
    log.error("Signature verification failed:", err.message);
    return {
      supported: true,
      signed: null,
      valid: null,
      status: "Error",
      message: err.message,
      signer: null,
    };
  }
}

function findSignableExecutables() {
  const cwd = process.cwd();
  const candidates = [];

  const possiblePaths = [
    { path: path.join(cwd, "dist", "win-unpacked", "Jarvis.exe"), name: "Jarvis.exe (built)" },
    { path: path.join(cwd, "dist", "win-unpacked", "open-jarvis.exe"), name: "open-jarvis.exe (built)" },
    { path: path.join(cwd, "dist", "win-unpacked", "hana.exe"), name: "hana.exe (built)" },
  ];

  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate.path)) {
      candidates.push(candidate);
    }
  }

  if (process.platform === "win32" && process.execPath) {
    const exeName = path.basename(process.execPath);
    candidates.push({ path: process.execPath, name: `${exeName} (current process)` });
  }

  return candidates;
}

export function createSystemRoute() {
  const app = new Hono();

  app.get("/system/health", async (c) => {
    try {
      const health = await runHealthChecks();
      return c.json(health);
    } catch (err) {
      log.error("Health check failed:", err.message);
      return c.json(
        { status: "error", error: "Health check failed", checks: [] },
        500
      );
    }
  });

  app.post("/system/fix/:action", async (c) => {
    const action = c.req.param("action");
    const fix = getFixAction(action);
    if (!fix) {
      return c.json(
        { success: false, error: `Unknown fix action: ${action}` },
        400
      );
    }

    try {
      log.info(`Starting fix: ${action}`);
      const { stdout, stderr } = await execAsync(fix.command, {
        cwd: process.cwd(),
        timeout: 300000,
      });

      log.info(`Fix completed: ${action}`, stdout);
      if (stderr) log.warn(`Fix stderr: ${action}`, stderr);

      return c.json({
        success: true,
        message: `${fix.name} 重建成功`,
        requiresRestart: true,
      });
    } catch (err) {
      log.error(`Fix failed: ${action}`, err.message, err.stderr);
      return c.json(
        {
          success: false,
          error: `修复失败: ${err.message}`,
        },
        500
      );
    }
  });

  app.get("/system/code-signing", async (c) => {
    const executables = findSignableExecutables();
    const results = [];

    for (const exe of executables) {
      const verification = await verifyWindowsSignature(exe.path);
      results.push({
        name: exe.name,
        path: exe.path,
        ...verification,
      });
    }

    return c.json({
      platform: process.platform,
      supported: process.platform === "win32",
      executables: results,
    });
  });

  app.post("/system/code-signing/verify", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const filePath = body.path;

    if (!filePath) {
      return c.json(
        { success: false, error: "File path is required" },
        400
      );
    }

    if (!fs.existsSync(filePath)) {
      return c.json(
        { success: false, error: `File not found: ${filePath}` },
        404
      );
    }

    const verification = await verifyWindowsSignature(filePath);
    return c.json({
      success: true,
      ...verification,
    });
  });

  return app;
}
