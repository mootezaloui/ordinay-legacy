$baseUrl = "http://localhost:3000/api/missions"
$dossiersUrl = "http://localhost:3000/api/dossiers"
$lawsuitsUrl = "http://localhost:3000/api/lawsuits"
$officersUrl = "http://localhost:3000/api/officers"

# Fetch dossiers from the API
try {
  $dossiersResponse = Invoke-WebRequest -Uri $dossiersUrl -Method Get -ErrorAction Stop
  $dossiers = $dossiersResponse.Content | ConvertFrom-Json
  Write-Host "Fetched $($dossiers.Count) dossiers from the database." -ForegroundColor Green
} catch {
  Write-Host "Failed to fetch dossiers from API: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Fetch lawsuits from the API
try {
  $lawsuitsResponse = Invoke-WebRequest -Uri $lawsuitsUrl -Method Get -ErrorAction Stop
  $lawsuits = $lawsuitsResponse.Content | ConvertFrom-Json
  Write-Host "Fetched $($lawsuits.Count) lawsuits from the database." -ForegroundColor Green
} catch {
  Write-Host "Failed to fetch lawsuits from API: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Fetch officers from the API
try {
  $officersResponse = Invoke-WebRequest -Uri $officersUrl -Method Get -ErrorAction Stop
  $officers = $officersResponse.Content | ConvertFrom-Json
  Write-Host "Fetched $($officers.Count) officers from the database." -ForegroundColor Green
} catch {
  Write-Host "Failed to fetch officers from API: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Arabic mission titles
$arabicMissionTitles = @(
  "مهمة تحقيق",
  "مهمة تدقيق",
  "مهمة استشارة",
  "مهمة مراجعة",
  "مهمة جمع أدلة",
  "مهمة إعداد تقرير",
  "مهمة متابعة",
  "مهمة تحليل",
  "مهمة توثيق",
  "مهمة تنسيق",
  "مهمة بحث قانوني",
  "مهمة إدارية",
  "مهمة مالية",
  "مهمة فنية",
  "مهمة اجتماعية"
)

# Helper to get a random officer
function Get-RandomOfficerId {
  if ($officers.Count -eq 0) { return $null }
  return $officers[(Get-Random -Minimum 0 -Maximum ($officers.Count - 1))].id
}

# Helper to get a random date between today and 14 days from now
function Get-RandomDate {
  $days = Get-Random -Minimum 0 -Maximum 14
  (Get-Date).AddDays($days).ToString('yyyy-MM-dd')
}

$missions = @()
$missionTitleIndex = 0

# 1-2 missions per dossier
foreach ($dossier in $dossiers) {
  $missions += @{ title = $arabicMissionTitles[$missionTitleIndex % $arabicMissionTitles.Length]; description = "مهمة مخصصة للملف $($dossier.title)"; mission_type = "investigation"; status = "planned"; priority = "medium"; assign_date = Get-RandomDate; due_date = Get-RandomDate; dossier_id = $dossier.id; officer_id = Get-RandomOfficerId }
  $missionTitleIndex++
  if ($dossier.id % 2 -eq 0) {
    $missions += @{ title = $arabicMissionTitles[$missionTitleIndex % $arabicMissionTitles.Length]; description = "مهمة ثانية للملف $($dossier.title)"; mission_type = "audit"; status = "in_progress"; priority = "high"; assign_date = Get-RandomDate; due_date = Get-RandomDate; dossier_id = $dossier.id; officer_id = Get-RandomOfficerId }
    $missionTitleIndex++
  }
}

# 1-2 missions per lawsuit
foreach ($lawsuit in $lawsuits) {
  $missions += @{ title = $arabicMissionTitles[$missionTitleIndex % $arabicMissionTitles.Length]; description = "مهمة مخصصة للقضية $($lawsuit.title)"; mission_type = "investigation"; status = "planned"; priority = "medium"; assign_date = Get-RandomDate; due_date = Get-RandomDate; lawsuit_id = $lawsuit.id; officer_id = Get-RandomOfficerId }
  $missionTitleIndex++
  if ($lawsuit.id % 2 -eq 1) {
    $missions += @{ title = $arabicMissionTitles[$missionTitleIndex % $arabicMissionTitles.Length]; description = "مهمة ثانية للقضية $($lawsuit.title)"; mission_type = "audit"; status = "in_progress"; priority = "high"; assign_date = Get-RandomDate; due_date = Get-RandomDate; lawsuit_id = $lawsuit.id; officer_id = Get-RandomOfficerId }
    $missionTitleIndex++
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
