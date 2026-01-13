$baseUrl = "http://localhost:3000/api/missions"

# Dossiers and cases (from previous scripts)
$dossiers = @(1..35 | ForEach-Object { @{ id = $_ } })
$cases = @(1..($dossiers.Count * 2 + ($dossiers.Count / 3)) | ForEach-Object { @{ id = $_ } })

# Officers (from API)
$officers = @(1..8 | ForEach-Object { @{ id = $_ } })

# Helper to get a random officer
function Get-RandomOfficerId {
  return $officers[(Get-Random -Minimum 0 -Maximum ($officers.Count - 1))].id
}

# Helper to get a random date between today and 14 days from now
function Get-RandomDate {
  $days = Get-Random -Minimum 0 -Maximum 14
  (Get-Date).AddDays($days).ToString('yyyy-MM-dd')
}

$missions = @()

# 1-2 missions per dossier
foreach ($dossier in $dossiers) {
  $missions += @{ title = "Mission for Dossier $($dossier.id)"; reference = "MIS-DOS-$($dossier.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; mission_number = "MN-DOS-$($dossier.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; description = "Mission assigned for dossier $($dossier.id)"; mission_type = "investigation"; status = "planned"; priority = "medium"; assign_date = Get-RandomDate; due_date = Get-RandomDate; dossier_id = $dossier.id; officer_id = Get-RandomOfficerId }
  if ($dossier.id % 2 -eq 0) {
    $missions += @{ title = "Second Mission for Dossier $($dossier.id)"; reference = "MIS-DOS2-$($dossier.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; mission_number = "MN-DOS2-$($dossier.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; description = "Second mission for dossier $($dossier.id)"; mission_type = "audit"; status = "in_progress"; priority = "high"; assign_date = Get-RandomDate; due_date = Get-RandomDate; dossier_id = $dossier.id; officer_id = Get-RandomOfficerId }
  }
}

# 1-2 missions per case
foreach ($case in $cases) {
  $missions += @{ title = "Mission for Case $($case.id)"; reference = "MIS-CAS-$($case.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; mission_number = "MN-CAS-$($case.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; description = "Mission assigned for case $($case.id)"; mission_type = "investigation"; status = "planned"; priority = "medium"; assign_date = Get-RandomDate; due_date = Get-RandomDate; case_id = $case.id; officer_id = Get-RandomOfficerId }
  if ($case.id % 2 -eq 1) {
    $missions += @{ title = "Second Mission for Case $($case.id)"; reference = "MIS-CAS2-$($case.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; mission_number = "MN-CAS2-$($case.id)-$(Get-Random -Minimum 1000 -Maximum 9999)"; description = "Second mission for case $($case.id)"; mission_type = "audit"; status = "in_progress"; priority = "high"; assign_date = Get-RandomDate; due_date = Get-RandomDate; case_id = $case.id; officer_id = Get-RandomOfficerId }
  }
}

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding Missions to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($mission in $missions) {
  try {
    $json = $mission | ConvertTo-Json -Depth 4
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($mission.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($mission.title) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 200
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
