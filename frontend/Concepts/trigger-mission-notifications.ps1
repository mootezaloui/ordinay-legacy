param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [int]$DaysOverdue = -2,
    [int]$DaysToday = 0,
    [int]$DaysSoon = 1,
    [int]$DaysIn3 = 3,
    [int]$DaysWeek = 7,
    [int]$CountPerType = 5,
    [int]$VariantCount = 5
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$baseDate = (Get-Date).Date

Write-Host "Creating a seed client..." -ForegroundColor Cyan
$clientPayload = @{
    name = "Mission Notif Client $timestamp"
    email = "mission-notif+$timestamp@example.com"
    status = "active"
}
$client = Invoke-RestMethod -Uri "$BaseUrl/clients" -Method Post -ContentType "application/json" -Body ($clientPayload | ConvertTo-Json -Depth 4)
if (-not $client.id) {
    throw "Client creation failed."
}

Write-Host "Creating a dossier..." -ForegroundColor Cyan
$dossierPayload = @{
    title = "Mission Notif Dossier $timestamp"
    client_id = $client.id
    status = "open"
    priority = "medium"
    description = "Seeded for mission notification test"
}
$dossier = Invoke-RestMethod -Uri "$BaseUrl/dossiers" -Method Post -ContentType "application/json" -Body ($dossierPayload | ConvertTo-Json -Depth 4)
if (-not $dossier.id) {
    throw "Dossier creation failed."
}

Write-Host "Creating a case..." -ForegroundColor Cyan
$casePayload = @{
    title = "Mission Notif Case $timestamp"
    dossier_id = $dossier.id
    description = "Seeded for mission notification test"
    status = "open"
    priority = "medium"
    reference_number = "PRO-$timestamp"
}
$case = Invoke-RestMethod -Uri "$BaseUrl/cases" -Method Post -ContentType "application/json" -Body ($casePayload | ConvertTo-Json -Depth 4)
if (-not $case.id) {
    throw "Case creation failed."
}

$types = @(
    @{ type = "overdue"; days = $DaysOverdue; status = "planned"; priority = "high" },
    @{ type = "today"; days = $DaysToday; status = "planned"; priority = "medium" },
    @{ type = "soon"; days = $DaysSoon; status = "planned"; priority = "medium" },
    @{ type = "in3"; days = $DaysIn3; status = "planned"; priority = "low" },
    @{ type = "week"; days = $DaysWeek; status = "planned"; priority = "low" }
)

Write-Host "Creating missions..." -ForegroundColor Cyan
$created = 0
foreach ($entry in $types) {
    for ($i = 1; $i -le $CountPerType; $i++) {
        $variantIndex = ($i - 1) % $VariantCount
        $dueDate = $baseDate.AddDays($entry.days).ToString("yyyy-MM-dd")
        $assignDate = $baseDate.ToString("yyyy-MM-dd")
        $payload = @{
            title = "Mission $($entry.type) $timestamp #$i"
            description = "Seeded for mission notification test"
            mission_type = "investigation"
            status = $entry.status
            priority = $entry.priority
            assign_date = $assignDate
            due_date = $dueDate
            reference = "MIS-$timestamp-$($entry.type)-VARIANT:$variantIndex"
        }

        if ($i % 2 -eq 0) {
            $payload.case_id = $case.id
        } else {
            $payload.dossier_id = $dossier.id
        }

        $mission = Invoke-RestMethod -Uri "$BaseUrl/missions" -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 4)
        if ($mission.id) {
            $created++
            Write-Host "Added mission ID $($mission.id) ($($entry.type) #$i)" -ForegroundColor Green
        } else {
            Write-Host "Failed to add mission ($($entry.type) #$i)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Done. Reload the app and open Notification Center to see mission notifications." -ForegroundColor Green
