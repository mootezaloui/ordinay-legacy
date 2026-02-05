$baseUrl = "http://localhost:3000/api/sessions"
$dossiersUrl = "http://localhost:3000/api/dossiers"
$lawsuitsUrl = "http://localhost:3000/api/lawsuits"

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

# Arabic hearing titles
$arabicHearingTitles = @(
  "جلسة استماع أولية",
  "جلسة استماع ثانية",
  "جلسة استماع نهائية",
  "جلسة استئناف",
  "جلسة تحقيق",
  "جلسة حكم",
  "جلسة تسوية",
  "جلسة إعادة نظر",
  "جلسة طعن",
  "جلسة تنفيذ"
)

# Arabic judges, locations, participants
$arabicJudges = @("القاضي أحمد", "القاضية فاطمة", "القاضي محمد", "القاضية لينا", "القاضي عمر")
$arabicLocations = @("قاعة المحكمة أ", "قاعة المحكمة ب", "قاعة المحكمة ج", "قاعة المحكمة د", "قاعة المحكمة هـ")
$arabicCourtRooms = @("أ1", "ب2", "ج3", "د4", "هـ5")
$arabicParticipants = @("المحامي علي", "المحامية نور", "المحامي كريم", "المحامية هدى", "المحامي يوسف")

# Helper to get a random date/time between today and 14 days from now
function Get-RandomDateTime {
  $days = Get-Random -Minimum 0 -Maximum 14
  $hour = Get-Random -Minimum 8 -Maximum 17
  (Get-Date).AddDays($days).Date.AddHours($hour).ToString('yyyy-MM-ddTHH:mm:ssZ')
}

$sessions = @()
$hearingTitleIndex = 0

# At least one hearing per lawsuit (hearings are typically for cases/lawsuits)
foreach ($lawsuit in $lawsuits) {
  $sessions += @{ title = $arabicHearingTitles[$hearingTitleIndex % $arabicHearingTitles.Length]; session_type = "hearing"; status = "scheduled"; scheduled_at = Get-RandomDateTime; duration = "01:00"; location = $arabicLocations[$hearingTitleIndex % $arabicLocations.Length]; court_room = $arabicCourtRooms[$hearingTitleIndex % $arabicCourtRooms.Length]; judge = $arabicJudges[$hearingTitleIndex % $arabicJudges.Length]; outcome = $null; description = "جلسة استماع أولية للقضية $($lawsuit.title)"; participants = @($arabicParticipants[$hearingTitleIndex % $arabicParticipants.Length], "العميل للقضية $($lawsuit.title)"); lawsuit_id = $lawsuit.id }
  $hearingTitleIndex++
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
