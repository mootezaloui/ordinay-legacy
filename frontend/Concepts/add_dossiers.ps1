$baseUrl = "http://localhost:3000/api/dossiers"
$clientsUrl = "http://localhost:3000/api/clients"

# Fetch clients from the API
try {
  $clientsResponse = Invoke-WebRequest -Uri $clientsUrl -Method Get -ErrorAction Stop
  $clients = $clientsResponse.Content | ConvertFrom-Json
  Write-Host "Fetched $($clients.Count) clients from the database." -ForegroundColor Green
}
catch {
  Write-Host "Failed to fetch clients from API: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Dossier categories, priorities, phases, statuses (from your form)
$categories = @("Commercial Law", "Family Law", "Criminal Law", "Labor Law", "Real Estate Law", "Administrative Law", "Tax Law")
$priorities = @("urgent", "high", "medium", "low")
$phases = @("Opening", "Investigation", "Negotiation", "Pleading", "Judgment", "Execution")
$statuses = @("open", "in_progress", "on_hold", "closed")

# Arabic dossier titles for realistic mocks
$arabicTitles = @(
  "قضية طلاق زوجية",
  "دعوى تجارية ضد الشركة",
  "قضية جنائية سرقة",
  "نزاع عمالي في الشركة",
  "صفقة بيع عقار",
  "دعوى إدارية ضد الحكومة",
  "قضية ضريبية",
  "دعوى مدنية تعويض",
  "قضية حضانة أطفال",
  "نزاع عقدي",
  "دعوى إفلاس",
  "قضية إرث",
  "دعوى تشهير",
  "نزاع ملكية فكرية",
  "قضية تأمين",
  "دعوى مصرفية",
  "قضية بيئية",
  "نزاع استثماري",
  "دعوى عائلية",
  "قضية مرورية",
  "دعوى تجارية شراكة",
  "قضية جنائية اعتداء",
  "نزاع عمالي إضراب",
  "صفقة إيجار عقار",
  "دعوى إدارية ترخيص",
  "قضية ضريبية إعادة تقييم",
  "دعوى مدنية إيذاء",
  "قضية حضانة مشتركة",
  "نزاع عقدي فسخ",
  "دعوى إفلاس فردي",
  "قضية إرث نزاع",
  "دعوى تشهير إعلامي",
  "نزاع ملكية براءة اختراع",
  "قضية تأمين حوادث",
  "دعوى مصرفية قرض",
  "قضية بيئية تلوث",
  "نزاع استثماري أسهم",
  "دعوى عائلية نفقة",
  "قضية مرورية حادث",
  "دعوى تجارية احتكار",
  "قضية جنائية رشوة",
  "نزاع عمالي تمييز",
  "صفقة شراء عقار",
  "دعوى إدارية فساد",
  "قضية ضريبية تهرب",
  "دعوى مدنية إهمال",
  "قضية حضانة كاملة",
  "نزاع عقدي تأخير",
  "دعوى إفلاس شركة",
  "قضية إرث وصية",
  "دعوى تشهير شخصي",
  "نزاع ملكية علامة تجارية"
)

# Example dossiers per client (2-3 per client, respecting required fields)
$dossiers = @()
$titleIndex = 0

foreach ($client in $clients) {
  $dossiers += @(
    @{ title = $arabicTitles[$titleIndex % $arabicTitles.Length]; client_id = $client.id; category = "Commercial Law"; priority = "medium"; phase = "Opening"; status = "open"; description = "Review and update commercial contract." },
    @{ title = $arabicTitles[($titleIndex + 1) % $arabicTitles.Length]; client_id = $client.id; category = "Criminal Law"; priority = "high"; phase = "Investigation"; status = "in_progress"; description = "Ongoing litigation case." }
  )
  $titleIndex += 2
  if ($client.id % 3 -eq 0) {
    $dossiers += @{ title = $arabicTitles[$titleIndex % $arabicTitles.Length]; client_id = $client.id; category = "Real Estate Law"; priority = "low"; phase = "Negotiation"; status = "on_hold"; description = "Assist with property transaction." }
    $titleIndex++
  }
}

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding Dossiers to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($dossier in $dossiers) {
  try {
    $json = $dossier | ConvertTo-Json -Depth 4
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($dossier.title) for client $($dossier.client_id)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($dossier.title) for client $($dossier.client_id) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
