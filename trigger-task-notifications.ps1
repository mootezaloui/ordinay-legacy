param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [int]$DaysOverdue = 3,
    [int]$DaysUpcoming = 3,
    [int]$DaysWeek = 7,
    [int]$DaysStatusCheck = 10,
    [int]$CountPerType = 5
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "Creating a seed client..." -ForegroundColor Cyan
$clientPayload = @{
    name = "Task Notif Client $timestamp"
    email = "task-notif+$timestamp@example.com"
    status = "active"
}
$client = Invoke-RestMethod -Uri "$BaseUrl/clients" -Method Post -ContentType "application/json" -Body ($clientPayload | ConvertTo-Json -Depth 4)
if (-not $client.id) {
    throw "Client creation failed."
}

Write-Host "Creating a dossier..." -ForegroundColor Cyan
$dossierPayload = @{
    title = "Task Notif Dossier $timestamp"
    client_id = $client.id
    status = "open"
    priority = "medium"
    description = "Seeded for task notification test"
}
$dossier = Invoke-RestMethod -Uri "$BaseUrl/dossiers" -Method Post -ContentType "application/json" -Body ($dossierPayload | ConvertTo-Json -Depth 4)
if (-not $dossier.id) {
    throw "Dossier creation failed."
}

Write-Host "Creating a case..." -ForegroundColor Cyan
$casePayload = @{
    title = "Task Notif Case $timestamp"
    dossier_id = $dossier.id
    description = "Seeded for task notification test"
    status = "open"
    priority = "medium"
    reference_number = "CASE-$timestamp"
}
$case = Invoke-RestMethod -Uri "$BaseUrl/cases" -Method Post -ContentType "application/json" -Body ($casePayload | ConvertTo-Json -Depth 4)
if (-not $case.id) {
    throw "Case creation failed."
}

$now = Get-Date
$types = @(
    @{ type = "overdue"; days = -$DaysOverdue; status = "todo" },
    @{ type = "dueToday"; days = 0; status = "todo" },
    @{ type = "upcoming"; days = $DaysUpcoming; status = "todo" },
    @{ type = "week"; days = $DaysWeek; status = "todo" },
    @{ type = "statusCheck"; days = $DaysStatusCheck; status = "in_progress" }
)

Write-Host "Creating tasks..." -ForegroundColor Cyan
$created = 0
foreach ($entry in $types) {
    for ($i = 1; $i -le $CountPerType; $i++) {
        $dueDate = $now.AddDays($entry.days).ToString("yyyy-MM-ddTHH:mm:ss")
        $payload = @{
            title = "Task $($entry.type) $timestamp #$i"
            description = "Seeded for task notification test"
            due_date = $dueDate
            status = $entry.status
            priority = "medium"
        }

        if ($i % 2 -eq 0) {
            $payload.case_id = $case.id
        } else {
            $payload.dossier_id = $dossier.id
        }

        $task = Invoke-RestMethod -Uri "$BaseUrl/tasks" -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 4)
        if ($task.id) {
            $created++
            Write-Host "✓ Added task ID $($task.id) ($($entry.type) #$i)" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to add task ($($entry.type) #$i)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Done. Reload the app and open Notification Center to see task notifications." -ForegroundColor Green
