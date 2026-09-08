# Bundles just the release .exe installers into a single distributable zip,
# NOT electron-builder's own "zip" target, which archives the raw
# win-unpacked app folder (all of Electron's dlls/pak files exposed loose).
# Run after "electron-builder --win nsis portable" has produced the .exe
# files in dist/, or via "npm run dist:win" which chains this automatically.

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pkg = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version

$distDir = Join-Path $repoRoot 'dist'
$zipPath = Join-Path $distDir "Witcher-Vault-v$version-Windows.zip"

$candidates = @(
    (Join-Path $distDir "Witcher-Vault-Setup-v$version.exe"),
    (Join-Path $distDir "Witcher-Vault-Portable-v$version.exe")
)
$files = $candidates | Where-Object { Test-Path $_ }

if ($files.Count -eq 0) {
    throw "No release .exe files found in dist/ - run 'npm run dist:win' (or electron-builder directly) first."
}

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path $files -DestinationPath $zipPath -CompressionLevel Optimal

Write-Output "Created $zipPath containing:"
foreach ($f in $files) {
    Write-Output ("  - " + (Split-Path -Leaf $f))
}
