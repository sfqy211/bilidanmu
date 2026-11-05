# Update all version files
# Usage: .\scripts\bump-version.ps1 0.5.0

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

# 1. package.json — 显式 UTF-8 无 BOM 读写，防止默认 ANSI 编码损坏内容
$PackageJsonPath = "$ProjectRoot\package.json"
$PackageJson = [System.IO.File]::ReadAllText($PackageJsonPath, [System.Text.UTF8Encoding]::new($false))
$PackageJson = $PackageJson -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
[System.IO.File]::WriteAllText($PackageJsonPath, $PackageJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: package.json -> $Version"

# 2. Cargo.toml — 只替换 [package] 块下的 version，避免误改依赖版本
#    必须显式 UTF-8 无 BOM 读写：Get-Content/Set-Content 默认按系统 ANSI（GBK），
#    文件含中文注释时会产生坏字节，导致 cargo/tauri 解析失败（0.5.0 bump 实际踩坑）
$CargoPath = "$ProjectRoot\src-tauri\Cargo.toml"
$CargoText = [System.IO.File]::ReadAllText($CargoPath, [System.Text.UTF8Encoding]::new($false))
if ($CargoText.Length -lt 50) { throw "Cargo.toml 读取异常（仅 $($CargoText.Length) 字符），已中止且未写入任何文件" }
$InPackage = $false
$PackageVersionReplaced = $false
$CargoLines = $CargoText -split "\r?\n" | ForEach-Object {
    if ($_ -match '^\[package\]') { $InPackage = $true }
    elseif ($_ -match '^\[') { $InPackage = $false }
    if ($InPackage -and -not $PackageVersionReplaced -and $_ -match '^version\s*=\s*"[^"]*"') {
        $PackageVersionReplaced = $true
        $_ -replace '^version\s*=\s*"[^"]*"', "version = `"$Version`""
    } else {
        $_
    }
}
[System.IO.File]::WriteAllText($CargoPath, ($CargoLines -join "`r`n") + "`r`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: Cargo.toml -> $Version"

# 3. tauri.conf.json — 显式 UTF-8 无 BOM 读写（同上，防默认 ANSI 编码损坏）
$TauriConfPath = "$ProjectRoot\src-tauri\tauri.conf.json"
$TauriConf = [System.IO.File]::ReadAllText($TauriConfPath, [System.Text.UTF8Encoding]::new($false))
$TauriConf = $TauriConf -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
[System.IO.File]::WriteAllText($TauriConfPath, $TauriConf, [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: tauri.conf.json -> $Version"

# 4. 官网发布页的下载直链指向具体版本的 release 资产，
#    版本号与这里必须同步，否则首页下载按钮会 404。
#    注意：必须显式用 UTF-8 读写——LandingApp.tsx 含中文注释，
#    用默认编码（GBK）读写会把注释变成乱码，且会把换行吃掉。
$LandingFile = "$ProjectRoot\docs\src\components\landing\LandingApp.tsx"
if (Test-Path $LandingFile) {
    $Landing = [System.IO.File]::ReadAllText($LandingFile, [System.Text.UTF8Encoding]::new($false))
    $Landing = $Landing -replace 'const RELEASE_VERSION = "[^"]*";', "const RELEASE_VERSION = `"$Version`";"
    [System.IO.File]::WriteAllText($LandingFile, $Landing, [System.Text.UTF8Encoding]::new($false))
    Write-Host "OK: LandingApp.tsx RELEASE_VERSION -> $Version"
} else {
    Write-Warning "未找到 $LandingFile，请手动检查官网下载链接"
}

# 5. Update lock files
Write-Host "Updating lock files..."
Set-Location $ProjectRoot
npm install --package-lock-only 2>$null | Out-Null
Write-Host "OK: package-lock.json"

Set-Location "$ProjectRoot\src-tauri"
cargo update --workspace 2>$null | Out-Null
Write-Host "OK: Cargo.lock"

Write-Host ""
Write-Host "Version updated to $Version"
