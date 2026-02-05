$baseUrl = "http://localhost:3000/api/tasks"
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

# Arabic task titles
$arabicTaskTitles = @(
  "مراجعة العقد",
  "إعداد الوثائق",
  "الاتصال بالعميل",
  "جمع الأدلة",
  "إعداد التقرير",
  "حضور الجلسة",
  "تحديث الملف",
  "إرسال الإشعارات",
  "مراجعة القانون",
  "إعداد الاستئناف",
  "جمع الشهادات",
  "تحليل الحالة",
  "إعداد الرد",
  "تنظيم الملفات",
  "الاتصال بالمحكمة",
  "إعداد الطلب",
  "مراجعة الوثائق",
  "تحديث العميل",
  "إعداد الخطة",
  "جمع المعلومات"
)

# Helper to get a random date between today and 14 days from now
function Get-RandomDueDate {
  $days = Get-Random -Minimum 0 -Maximum 14
  (Get-Date).AddDays($days).ToString('yyyy-MM-dd')
}

$tasks = @()
$taskTitleIndex = 0

# At least one task per dossier
foreach ($dossier in $dossiers) {
  $tasks += @{ title = $arabicTaskTitles[$taskTitleIndex % $arabicTaskTitles.Length]; dossier_id = $dossier.id; description = "مهمة مجدولة للملف $($dossier.title)"; status = "todo"; priority = "medium"; due_date = Get-RandomDueDate }
  $taskTitleIndex++
}

# At least one task per lawsuit
foreach ($lawsuit in $lawsuits) {
  $tasks += @{ title = $arabicTaskTitles[$taskTitleIndex % $arabicTaskTitles.Length]; lawsuit_id = $lawsuit.id; description = "مهمة مجدولة للقضية $($lawsuit.title)"; status = "todo"; priority = "medium"; due_date = Get-RandomDueDate }
  $taskTitleIndex++
}

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding Tasks to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($task in $tasks) {
  try {
    $json = $task | ConvertTo-Json -Depth 4
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($task.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($task.title) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 200
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
