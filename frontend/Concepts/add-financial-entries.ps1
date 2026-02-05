$baseUrl = "http://localhost:3000/api/financial"
$clientsUrl = "http://localhost:3000/api/clients"
$dossiersUrl = "http://localhost:3000/api/dossiers"
$lawsuitsUrl = "http://localhost:3000/api/lawsuits"
$missionsUrl = "http://localhost:3000/api/missions"

# Fetch clients from the API
try {
  $clientsResponse = Invoke-WebRequest -Uri $clientsUrl -Method Get -ErrorAction Stop
  $clients = $clientsResponse.Content | ConvertFrom-Json
  Write-Host "Fetched $($clients.Count) clients from the database." -ForegroundColor Green
} catch {
  Write-Host "Failed to fetch clients from API: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

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

# Fetch missions from the API
try {
  $missionsResponse = Invoke-WebRequest -Uri $missionsUrl -Method Get -ErrorAction Stop
  $missions = $missionsResponse.Content | ConvertFrom-Json
  Write-Host "Fetched $($missions.Count) missions from the database." -ForegroundColor Green
} catch {
  Write-Host "Failed to fetch missions from API: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$now = Get-Date

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Adding Financial Entries..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$successCount = 0
$failureCount = 0

# Arabic financial entry titles
$arabicIncomeTitles = @(
  "الدفعة الأولى",
  "الخدمات الشهرية",
  "استشارات قانونية",
  "رسوم التقاضي",
  "أتعاب المحاماة",
  "رسوم الترخيص",
  "استشارات تجارية",
  "دعوى مدنية",
  "قضية جنائية",
  "خدمات إدارية"
)

$arabicExpenseTitles = @(
  "تحقيق جنائي",
  "تحليل برمجيات",
  "تحليل أدلة",
  "تدقيق بناء",
  "رسوم المحكمة",
  "رسوم كاداستر",
  "رسوم الاستئناف",
  "رسوم محكمة العمل",
  "مصاريف السفر",
  "إقامة",
  "ترجمة وثائق",
  "اشتراك قاعدة بيانات",
  "اشتراك أدوات قانونية"
)

# Generate financial entries dynamically
$entries = @()
$titleIndex = 0

# Client income entries
foreach ($client in $clients | Select-Object -First 10) {
  $entries += @{
    scope = "client"
    entry_type = "income"
    status = "confirmed"
    amount = Get-Random -Minimum 1000 -Maximum 10000
    currency = "TND"
    occurred_at = $now.AddDays(-(Get-Random -Minimum 0 -Maximum 30)).ToUniversalTime().ToString("o")
    due_date = $now.AddDays((Get-Random -Minimum 0 -Maximum 30)).ToUniversalTime().ToString("o")
    paid_at = $now.AddDays(-(Get-Random -Minimum 0 -Maximum 10)).ToUniversalTime().ToString("o")
    client_id = $client.id
    title = $arabicIncomeTitles[$titleIndex % $arabicIncomeTitles.Length]
    description = "دخل من العميل $($client.name)"
  }
  $titleIndex++
}

# Internal expense entries
foreach ($mission in $missions | Select-Object -First 10) {
  $entries += @{
    scope = "internal"
    entry_type = "expense"
    status = "confirmed"
    amount = Get-Random -Minimum 500 -Maximum 5000
    currency = "TND"
    occurred_at = $now.AddDays(-(Get-Random -Minimum 0 -Maximum 30)).ToUniversalTime().ToString("o")
    due_date = $now.AddDays((Get-Random -Minimum 0 -Maximum 30)).ToUniversalTime().ToString("o")
    paid_at = $now.AddDays(-(Get-Random -Minimum 0 -Maximum 10)).ToUniversalTime().ToString("o")
    mission_id = $mission.id
    title = $arabicExpenseTitles[$titleIndex % $arabicExpenseTitles.Length]
    description = "مصروفات للمهمة $($mission.title)"
  }
  $titleIndex++
}

# Dossier-related expenses
foreach ($dossier in $dossiers | Select-Object -First 5) {
  $entries += @{
    scope = "internal"
    entry_type = "expense"
    status = "pending"
    amount = Get-Random -Minimum 200 -Maximum 2000
    currency = "TND"
    occurred_at = $now.AddDays(-(Get-Random -Minimum 0 -Maximum 10)).ToUniversalTime().ToString("o")
    due_date = $now.AddDays((Get-Random -Minimum 0 -Maximum 20)).ToUniversalTime().ToString("o")
    paid_at = $null
    dossier_id = $dossier.id
    title = $arabicExpenseTitles[$titleIndex % $arabicExpenseTitles.Length]
    description = "مصروفات للملف $($dossier.title)"
  }
  $titleIndex++
}

# Lawsuit-related expenses
foreach ($lawsuit in $lawsuits | Select-Object -First 5) {
  $entries += @{
    scope = "internal"
    entry_type = "expense"
    status = "pending"
    amount = Get-Random -Minimum 300 -Maximum 3000
    currency = "TND"
    occurred_at = $now.AddDays(-(Get-Random -Minimum 0 -Maximum 10)).ToUniversalTime().ToString("o")
    due_date = $now.AddDays((Get-Random -Minimum 0 -Maximum 20)).ToUniversalTime().ToString("o")
    paid_at = $null
    lawsuit_id = $lawsuit.id
    title = $arabicExpenseTitles[$titleIndex % $arabicExpenseTitles.Length]
    description = "مصروفات للقضية $($lawsuit.title)"
  }
  $titleIndex++
}

foreach ($entry in $entries) {
  try {
    $json = $entry | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($entry.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($entry.title) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Cyan
