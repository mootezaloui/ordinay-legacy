$baseUrl = "http://localhost:3000/api/lawsuits"
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

# Arabic case titles
$arabicCaseTitles = @(
  "دعوى مدنية تعويضية",
  "قضية جنائية سرقة",
  "نزاع تجاري عقدي",
  "دعوى عائلية حضانة",
  "قضية إدارية فساد",
  "نزاع عمالي إضراب",
  "دعوى مصرفية قرض",
  "قضية بيئية تلوث",
  "نزاع استثماري أسهم",
  "دعوى عائلية نفقة",
  "قضية مرورية حادث",
  "نزاع تجاري احتكار",
  "دعوى جنائية رشوة",
  "قضية عمالية تمييز",
  "نزاع إيجاري تأخير",
  "دعوى إفلاس فردي",
  "قضية إرث نزاع",
  "نزاع تشهير إعلامي",
  "دعوى ملكية فكرية",
  "قضية تأمين حوادث",
  "نزاع مصرفي احتيال",
  "دعوى بيئية تلوث",
  "قضية استثمارية خسارة",
  "نزاع عائلي زواج",
  "دعوى مرورية مخالفة",
  "قضية تجارية احتكار",
  "نزاع جنائي اعتداء",
  "دعوى عمالية فصل",
  "قضية إيجارية زيادة",
  "نزاع إفلاس شركة"
)

# Arabic adversaries, parties, lawyers, courts
$arabicAdversaries = @("الخصم أحمد", "الخصم فاطمة", "الخصم محمد", "الخصم لينا", "الخصم عمر")
$arabicParties = @("الطرف الأول", "الطرف الثاني", "الطرف الثالث", "الطرف الرابع", "الطرف الخامس")
$arabicLawyers = @("المحامي علي", "المحامية نور", "المحامي كريم", "المحامية هدى", "المحامي يوسف")
$arabicCourts = @("محكمة القاهرة", "محكمة الجيزة", "محكمة الإسكندرية", "محكمة أسيوط", "محكمة المنصورة")

# Example values for required and optional fields
$statuses = @("open","in_progress","on_hold","closed")
$priorities = @("urgent","high","medium","low")
$phases = @("Opening","Investigation","Negotiation","Pleading","Judgment","Execution")

# Generate 1-3 cases per dossier, filling all fields
$cases = @()
$caseTitleIndex = 0

foreach ($dossier in $dossiers) {
  $cases += @(
    @{ title = $arabicCaseTitles[$caseTitleIndex % $arabicCaseTitles.Length]; dossier_id = $dossier.id; description = "قضية أولى لـ $($dossier.title)"; adversary = $arabicAdversaries[$caseTitleIndex % $arabicAdversaries.Length]; adversary_party = $arabicParties[$caseTitleIndex % $arabicParties.Length]; adversary_lawyer = $arabicLawyers[$caseTitleIndex % $arabicLawyers.Length]; court = $arabicCourts[$caseTitleIndex % $arabicCourts.Length]; filing_date = "2026-01-13"; next_hearing = "2026-02-01"; reference_number = "REF-$(Get-Random -Minimum 1000 -Maximum 9999)"; status = "open"; priority = "medium"; opened_at = "2026-01-13T09:00:00Z"; closed_at = $null },
    @{ title = $arabicCaseTitles[($caseTitleIndex + 1) % $arabicCaseTitles.Length]; dossier_id = $dossier.id; description = "قضية ثانية لـ $($dossier.title)"; adversary = $arabicAdversaries[($caseTitleIndex + 1) % $arabicAdversaries.Length]; adversary_party = $arabicParties[($caseTitleIndex + 1) % $arabicParties.Length]; adversary_lawyer = $arabicLawyers[($caseTitleIndex + 1) % $arabicLawyers.Length]; court = $arabicCourts[($caseTitleIndex + 1) % $arabicCourts.Length]; filing_date = "2026-01-14"; next_hearing = "2026-02-10"; reference_number = "REF-$(Get-Random -Minimum 1000 -Maximum 9999)"; status = "in_progress"; priority = "high"; opened_at = "2026-01-14T09:00:00Z"; closed_at = $null }
  )
  $caseTitleIndex += 2
  if ($dossier.id % 3 -eq 0) {
    $cases += @{ title = $arabicCaseTitles[$caseTitleIndex % $arabicCaseTitles.Length]; dossier_id = $dossier.id; description = "قضية ثالثة لـ $($dossier.title)"; adversary = $arabicAdversaries[$caseTitleIndex % $arabicAdversaries.Length]; adversary_party = $arabicParties[$caseTitleIndex % $arabicParties.Length]; adversary_lawyer = $arabicLawyers[$caseTitleIndex % $arabicLawyers.Length]; court = $arabicCourts[$caseTitleIndex % $arabicCourts.Length]; filing_date = "2026-01-15"; next_hearing = "2026-02-20"; reference_number = "REF-$(Get-Random -Minimum 1000 -Maximum 9999)"; status = "on_hold"; priority = "low"; opened_at = "2026-01-15T09:00:00Z"; closed_at = $null }
    $caseTitleIndex++
  }
}

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding Cases to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($case in $cases) {
  try {
    $json = $case | ConvertTo-Json -Depth 4
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($case.title) for dossier $($case.dossier_id)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($case.title) for dossier $($case.dossier_id) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
