import fs from "fs";
import path from "path";
import { CronJob } from "cron";
import { exportAgent } from "./agent-backup.js";

const BACKUP_CONFIG_FILE = path.join(process.cwd(), ".backup-config.json");

export function loadBackupConfig() {
  if (!fs.existsSync(BACKUP_CONFIG_FILE)) {
    return { enabled: false, frequency: "weekly", time: "02:00", retainCount: 10 };
  }
  return JSON.parse(fs.readFileSync(BACKUP_CONFIG_FILE, "utf-8"));
}

export function saveBackupConfig(config) {
  fs.writeFileSync(BACKUP_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function buildCronExpression(frequency, time) {
  const [hour, minute] = time.split(":").map(Number);
  
  switch (frequency) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * 0`;
    case "monthly":
      return `${minute} ${hour} 1 * *`;
    default:
      return `${minute} ${hour} * * 0`;
  }
}

async function backupAllAgents(engine, retainCount) {
  const agents = engine.listAgents();
  const backupDir = path.join(engine.agentsDir, ".backups");
  fs.mkdirSync(backupDir, { recursive: true });

  for (const agent of agents) {
    const outputPath = path.join(backupDir, `agent-backup-${agent.id}-${Date.now()}.zip`);
    try {
      await exportAgent(agent.dir, outputPath);
      console.log(`[AutoBackup] Backed up agent: ${agent.id}`);
    } catch (err) {
      console.error(`[AutoBackup] Failed to backup ${agent.id}:`, err.message);
    }
  }

  // 按 Agent ID 分别清理旧备份
  for (const agent of agents) {
    await cleanupOldBackupsForAgent(backupDir, agent.id, retainCount);
  }
}

async function cleanupOldBackupsForAgent(backupDir, agentId, retainCount) {
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(`agent-backup-${agentId}-`) && f.endsWith('.zip'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  const toDelete = files.slice(retainCount);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(backupDir, file.name));
    console.log(`[AutoBackup] Deleted old backup for ${agentId}: ${file.name}`);
  }
}

export function startAutoBackupScheduler(engine) {
  const config = loadBackupConfig();
  
  if (!config.enabled) {
    console.log("[AutoBackup] Disabled");
    return null;
  }

  const cronExpression = buildCronExpression(config.frequency, config.time);
  console.log(`[AutoBackup] Scheduled: ${cronExpression}`);

  const job = new CronJob(cronExpression, async () => {
    console.log("[AutoBackup] Running scheduled backup...");
    await backupAllAgents(engine, config.retainCount);
  });

  job.start();
  return job;
}
