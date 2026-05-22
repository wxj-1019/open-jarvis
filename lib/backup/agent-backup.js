import crypto from "crypto";
import fs from "fs";
import path from "path";
import YAML from "js-yaml";
import { writeZipFromDirectory } from "../zip-writer.js";

const MANIFEST_FILE = "backup-manifest.json";
const FORMAT = "hana-agent-backup";
const FORMAT_VERSION = 1;

const EXCLUDE_DIRS = new Set(["sessions", "node_modules"]);
const EXCLUDE_FILES = new Set([
  "facts.db-journal",
  "facts.db-wal",
  "facts.db-shm",
]);
const EXCLUDE_EXTS = new Set([".tmp", ".bak", ".log"]);

function shouldExclude(entryName, isDir) {
  if (isDir) return EXCLUDE_DIRS.has(entryName);
  if (EXCLUDE_FILES.has(entryName)) return true;
  const ext = path.extname(entryName).toLowerCase();
  return EXCLUDE_EXTS.has(ext);
}

function computeChecksum(filePath) {
  const data = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) count += countFiles(path.join(dir, entry.name));
    } else {
      if (!shouldExclude(entry.name, false)) count++;
    }
  }
  return count;
}

function copyFiltered(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldExclude(entry.name, entry.isDirectory())) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyFiltered(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getAppVersion() {
  try {
    const pkgPath = path.resolve(import.meta.dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

export async function exportAgent(agentDir, outputPath) {
  if (!fs.existsSync(agentDir)) {
    throw new Error(`Agent 目录不存在: ${agentDir}`);
  }
  const configPath = path.join(agentDir, "config.yaml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Agent 配置文件不存在: ${configPath}`);
  }

  const config = YAML.load(fs.readFileSync(configPath, "utf-8")) || {};
  const agentId = path.basename(agentDir);
  const agentName = config.agent?.name || agentId;
  const yuan = config.agent?.yuan || "hanako";

  const stagingDir = `${outputPath}.staging`;
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    copyFiltered(agentDir, stagingDir);

    const manifest = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      agentId,
      agentName,
      yuan,
      createdAt: new Date().toISOString(),
      appVersion: getAppVersion(),
      fileCount: countFiles(stagingDir),
      checksum: null,
    };

    fs.writeFileSync(
      path.join(stagingDir, MANIFEST_FILE),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    await writeZipFromDirectory(stagingDir, outputPath);

    manifest.checksum = computeChecksum(outputPath);

    return { outputPath, manifest };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

import { extractZip } from "../extract-zip.js";

export async function importAgent(zipPath, targetDir) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`备份文件不存在: ${zipPath}`);
  }
  if (fs.existsSync(targetDir)) {
    throw new Error(`目标目录已存在: ${targetDir}`);
  }

  const tmpDir = `${targetDir}.import-tmp`;
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    await extractZip(zipPath, tmpDir);

    const manifestPath = path.join(tmpDir, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) {
      throw new Error("备份包无效: 缺少 backup-manifest.json");
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (manifest.format !== FORMAT) {
      throw new Error(`不支持的备份格式: ${manifest.format}`);
    }

    if (manifest.checksum) {
      const actual = computeChecksum(zipPath);
      if (manifest.checksum !== actual) {
        throw new Error("备份文件校验失败: 文件可能已损坏或被篡改");
      }
    }

    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.renameSync(tmpDir, targetDir);

    return { targetDir, manifest };
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}
