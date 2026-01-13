$baseUrl = "http://localhost:3000/api/sessions"

# Dossiers (from previous script)
$dossiers = @(1..35 | ForEach-Object { @{ id = $_ } })

# Cases (from previous script, assuming IDs are sequential and start after dossiers)
$cases = @(1..($dossiers.Count * 2 + ($dossiers.Count / 3)) | ForEach-Object { @{ id = $_ } })

# Helper to get a random date/time between today and 14 days from now
function Get-RandomDateTime {
  $days = Get-Random -Minimum 0 -Maximum 14
  $hour = Get-Random -Minimum 8 -Maximum 17
  (Get-Date).AddDays($days).Date.AddHours($hour).ToString('yyyy-MM-ddTHH:mm:ssZ')
}

$sessions = @()

# At least one hearing per dossier
foreach ($dossier in $dossiers) {
  $sessions += @{ title = "Hearing for Dossier $($dossier.id)"; session_type = "hearing"; status = "scheduled"; scheduled_at = Get-RandomDateTime; duration = "01:00"; location = "Courtroom A"; court_room = "A1"; judge = "Judge Smith"; outcome = $null; description = "Initial hearing for dossier $($dossier.id)"; notes = "Auto-generated"; participants = @("Lawyer 1", "Client $($dossier.id)"); dossier_id = $dossier.id }
}

# At least one hearing per case
foreach ($case in $cases) {
  $sessions += @{ title = "Hearing for Case $($case.id)"; session_type = "hearing"; status = "scheduled"; scheduled_at = Get-RandomDateTime; duration = "01:00"; location = "Courtroom B"; court_room = "B2"; judge = "Judge Doe"; outcome = $null; description = "Initial hearing for case $($case.id)"; notes = "Auto-generated"; participants = @("Lawyer 2", "Client for Case $($case.id)"); case_id = $case.id }
}

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding Hearings (Sessions) to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($session in $sessions) {
  try {
    $json = $session | ConvertTo-Json -Depth 4
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($session.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($session.title) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 200
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
