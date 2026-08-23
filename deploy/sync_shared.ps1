# PowerShell equivalent of sync_shared.sh for local Windows runs.
#   .\deploy\sync_shared.ps1
$root = Split-Path -Parent $PSScriptRoot
foreach ($f in @("schemas.py", "config.py", "firestore.py", "google_apis.py")) {
  Copy-Item -Force (Join-Path $root "backend\app\$f") (Join-Path $root "worker\app\$f")
}
Write-Host "synced shared modules into worker/app/"
