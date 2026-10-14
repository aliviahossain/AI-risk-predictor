$ErrorActionPreference = "Continue"
$timer = [System.Diagnostics.Stopwatch]::StartNew()
$failed = $false

Write-Host "Running backend and R tests..."
python -m pytest -q --durations=10
if ($LASTEXITCODE -ne 0) {
    $failed = $true
}

Write-Host "`nRunning frontend tests..."
Push-Location (Join-Path $PSScriptRoot "frontend")
try {
    npm test -- --watchAll=false --runInBand
    if ($LASTEXITCODE -ne 0) {
        $failed = $true
    }

    Write-Host "`nBuilding frontend for production..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        $failed = $true
    }
}
finally {
    Pop-Location
}

$timer.Stop()
Write-Host "`nTest suite elapsed: $([math]::Round($timer.Elapsed.TotalSeconds, 2)) seconds"

if ($failed) {
    exit 1
}
