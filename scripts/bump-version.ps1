# Update all version files
# Usage: .\scripts\bump-version.ps1 0.3.1

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
$CargoLines = Get-Content "$ProjectRoot\src-tauri\Cargo.toml"
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
$CargoLines | Set-Content "$ProjectRoot\src-tauri\Cargo.toml"
Write-Host "OK: Cargo.toml -> $Version"

# 3. tauri.conf.json
$TauriConf = Get-Content "$ProjectRoot\src-tauri\tauri.conf.json" -Raw
$TauriConf = $TauriConf -replace '"version":\s*"[^"]*"', "`"version`": `"$Version`""
Set-Content "$ProjectRoot\src-tauri\tauri.conf.json" -Value $TauriConf -NoNewline
Write-Host "OK: tauri.conf.json -> $Version"

# 4. Update lock files
Write-Host "Updating lock files..."
Set-Location $ProjectRoot
npm install --package-lock-only 2>$null | Out-Null
Write-Host "OK: package-lock.json"

Set-Location "$ProjectRoot\src-tauri"
cargo update --workspace 2>$null | Out-Null
Write-Host "OK: Cargo.lock"

Write-Host ""
Write-Host "Version updated to $Version"
