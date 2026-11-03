# Update all version files
# Usage: .\scripts\bump-version.ps1 0.5.0

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

# 1. package.json
$PackageJson = Get-Content "$ProjectRoot\package.json" -Raw
$PackageJson = $PackageJson -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
Set-Content "$ProjectRoot\package.json" -Value $PackageJson -NoNewline
Write-Host "OK: package.json -> $Version"

# 2. Cargo.toml — 只替换 [package] 块下的 version，避免误改依赖版本
$CargoLines = @(Get-Content "$ProjectRoot\src-tauri\Cargo.toml")
if ($CargoLines.Count -lt 5) { throw "Cargo.toml 读取异常（仅 $($CargoLines.Count) 行），已中止且未写入任何文件" }
$InPackage = $false
$PackageVersionReplaced = $false
$CargoLines = $CargoLines | ForEach-Object {
    if ($_ -match '^\[package\]') { $InPackage = $true }
    elseif ($_ -match '^\[') { $InPackage = $false }
    if ($InPackage -and -not $PackageVersionReplaced -and $_ -match '^version\s*=\s*"[^"]*"') {
        $PackageVersionReplaced = $true
        $_ -replace '^version\s*=\s*"[^"]*"', "version = `"$Version`""
    } else {
        $_
    }
}
$TmpCargo = "$ProjectRoot\src-tauri\Cargo.toml.tmp"
$CargoLines | Set-Content $TmpCargo
Move-Item $TmpCargo "$ProjectRoot\src-tauri\Cargo.toml" -Force
Write-Host "OK: Cargo.toml -> $Version"

# 3. tauri.conf.json
$TauriConf = Get-Content "$ProjectRoot\src-tauri\tauri.conf.json" -Raw
$TauriConf = $TauriConf -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
Set-Content "$ProjectRoot\src-tauri\tauri.conf.json" -Value $TauriConf -NoNewline
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
