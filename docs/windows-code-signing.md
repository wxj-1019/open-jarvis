# Windows 代码签名配置指南

## 概述

未签名的 Windows 可执行文件会被 SmartScreen 拦截，用户需要手动点击"仍要运行"才能安装。
配置代码签名后，安装程序会被系统信任，无需额外确认。

## 前置条件

1. **购买代码签名证书**
   - OV（组织验证）证书：适用于大多数场景，价格约 $70-200/年
   - EV（扩展验证）证书：立即获得 SmartScreen 信誉，价格约 $300-500/年
   - 推荐供应商：DigiCert、Sectigo、Comodo

2. **导出证书为 PFX/P12 文件**
   - 从 Windows 证书管理器导出
   - 包含私钥
   - 设置强密码

## GitHub Actions 配置

### 1. 添加 Repository Secrets

进入 GitHub 仓库 → Settings → Secrets and variables → Actions，添加：

| Secret 名称 | 说明 |
|-------------|------|
| `WIN_CSC_LINK` | PFX 证书文件的 Base64 编码内容 |
| `WIN_CSC_KEY_PASSWORD` | PFX 证书的密码 |

### 2. 获取证书的 Base64 编码

在 PowerShell 中执行：

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("C:\path\to\certificate.pfx")
) | Set-Clipboard
```

将剪贴板内容粘贴到 `WIN_CSC_LINK` secret 中。

### 3. 验证 CI 配置

推送一个 tag 触发构建：

```bash
git tag v0.0.0-test-sign
git push origin v0.0.0-test-sign
```

在 GitHub Actions 日志中检查：
- `electron-builder` 步骤应显示 `signing with certificate` 而非 `skipped`
- 生成的 `.exe` 应通过 Windows 签名验证

## 本地签名（开发者手动构建）

### 前置条件

- Windows 10/11
- 安装 [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/)（包含 `signtool.exe`）
- 证书已安装到 Windows 证书存储

### 使用本地签名脚本

```powershell
# 设置环境变量
$env:WIN_CSC_LINK = "C:\path\to\certificate.pfx"
$env:WIN_CSC_KEY_PASSWORD = "your-password"

# 运行构建
npm run dist:win
```

electron-builder 会自动读取 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD` 环境变量进行签名。

### 手动签名已有安装包

```powershell
# 查找 signtool 路径
$sdkPath = (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Directory |
  Sort-Object Name -Descending | Select-Object -First 1).FullName
$signtool = "$sdkPath\x64\signtool.exe"

# 签名
& $signtool sign /f "C:\path\to\certificate.pfx" /p "your-password" `
  /tr http://timestamp.digicert.com /td sha256 /fd sha256 `
  "dist\Hanako-0.x.y-Windows-x64.exe"

# 验证签名
& $signtool verify /pa "dist\Hanako-0.x.y-Windows-x64.exe"
```

## 常见问题

### SmartScreen 仍然拦截

- OV 证书需要时间建立信誉（通常几天到几周）
- EV 证书立即获得 SmartScreen 信誉
- 确保每次发布都使用同一证书

### CI 签名失败

- 检查 `WIN_CSC_LINK` 是否为有效的 Base64 编码
- 检查 `WIN_CSC_KEY_PASSWORD` 是否正确
- 确保 PFX 文件包含完整的证书链

### 证书过期

- 过期证书无法签名新文件
- 已签名的文件在签名时间戳之后仍然有效
- 务必使用 `/tr` 参数添加 RFC 3161 时间戳

## 延伸阅读

- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [Microsoft SmartScreen](https://learn.microsoft.com/en-us/windows/security/threat-protection/windows-defender-smartscreen/windows-defender-smartscreen-overview)
