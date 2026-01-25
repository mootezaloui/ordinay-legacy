$baseUrl = "http://localhost:3000/api/tasks"

# Dossiers (from previous script)
$dossiers = @(1..35 | ForEach-Object { @{ id = $_ } })

# Cases (from previous script, assuming IDs are sequential and start after dossiers)
$cases = @(1..($dossiers.Count * 2 + ($dossiers.Count / 3)) | ForEach-Object { @{ id = $_ } })

# Helper to get a random date between today and 14 days from now
function Get-RandomDueDate {
  $days = Get-Random -Minimum 0 -Maximum 14
  (Get-Date).AddDays($days).ToString('yyyy-MM-dd')
}

$tasks = @()

# At least one task per dossier
foreach ($dossier in $dossiers) {
  $tasks += @{ title = "Task for Dossier $($dossier.id)"; dossier_id = $dossier.id; description = "Scheduled task for dossier $($dossier.id)"; status = "todo"; priority = "medium"; due_date = Get-RandomDueDate }
}

# At least one task per case
foreach ($case in $cases) {
  $tasks += @{ title = "Task for Case $($case.id)"; case_id = $case.id; description = "Scheduled task for case $($case.id)"; status = "todo"; priority = "medium"; due_date = Get-RandomDueDate }
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
