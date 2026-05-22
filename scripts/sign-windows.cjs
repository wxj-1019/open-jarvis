/**
 * sign-windows.cjs — Windows 代码签名辅助脚本
 *
 * 使用 signtool.exe 对指定文件进行签名。
 * 从环境变量读取证书路径和密码。
 *
 * 用法:
 *   node scripts/sign-windows.cjs <file-to-sign>
 *
 * 环境变量:
 *   WIN_CSC_LINK       — PFX 证书文件路径
 *   WIN_CSC_KEY_PASSWORD — PFX 证书密码
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const fileToSign = process.argv[2];
if (!fileToSign) {
  console.error("用法: node scripts/sign-windows.cjs <file-to-sign>");
  process.exit(1);
}

if (!fs.existsSync(fileToSign)) {
  console.error(`文件不存在: ${fileToSign}`);
  process.exit(1);
}

const certPath = process.env.WIN_CSC_LINK;
const certPassword = process.env.WIN_CSC_KEY_PASSWORD;

if (!certPath || !certPassword) {
  console.error("错误: 未设置 WIN_CSC_LINK 或 WIN_CSC_KEY_PASSWORD 环境变量");
  console.error("");
  console.error("请设置:");
  console.error('  $env:WIN_CSC_LINK = "C:\\path\\to\\certificate.pfx"');
  console.error('  $env:WIN_CSC_KEY_PASSWORD = "your-password"');
  process.exit(1);
}

if (!fs.existsSync(certPath)) {
  console.error(`证书文件不存在: ${certPath}`);
  process.exit(1);
}

function findSigntool() {
  const kitsPath = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  if (!fs.existsSync(kitsPath)) {
    throw new Error(
      "未找到 Windows SDK。请安装 Windows SDK:\n" +
      "https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
    );
  }

  const versions = fs.readdirSync(kitsPath)
    .filter(d => /^\d+\./.test(d))
    .sort()
    .reverse();

  for (const ver of versions) {
    const candidates = [
      path.join(kitsPath, ver, "x64", "signtool.exe"),
      path.join(kitsPath, ver, "x86", "signtool.exe"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  throw new Error("未找到 signtool.exe");
}

try {
  const signtool = findSigntool();
  console.log(`使用 signtool: ${signtool}`);
  console.log(`签名文件: ${fileToSign}`);

  const escapedPassword = certPassword.replace(/"/g, '""');
  const cmd = [
    `"${signtool}"`,
    "sign",
    `/f "${certPath}"`,
    `/p "${escapedPassword}"`,
    "/tr http://timestamp.digicert.com",
    "/td sha256",
    "/fd sha256",
    `"${fileToSign}"`,
  ].join(" ");

  execSync(cmd, { stdio: "inherit" });
  console.log(`\n✓ 签名成功: ${fileToSign}`);

  console.log("\n验证签名...");
  execSync(`"${signtool}" verify /pa "${fileToSign}"`, { stdio: "inherit" });
  console.log("✓ 签名验证通过");
} catch (err) {
  console.error(`\n✗ 签名失败: ${err.message}`);
  process.exit(1);
}
