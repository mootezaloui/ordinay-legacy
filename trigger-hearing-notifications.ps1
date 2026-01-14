param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [int]$DaysToday = 0,
    [int]$DaysTomorrow = 1,
    [int]$DaysSoon = 3,
    [int]$DaysWeek = 7,
    [int]$DaysPast = -2,
    [int]$CountPerType = 5
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "Creating a seed client..." -ForegroundColor Cyan
$clientPayload = @{
    name = "Hearing Notif Client $timestamp"
    email = "hearing-notif+$timestamp@example.com"
    status = "active"
}
$client = Invoke-RestMethod -Uri "$BaseUrl/clients" -Method Post -ContentType "application/json" -Body ($clientPayload | ConvertTo-Json -Depth 4)
if (-not $client.id) {
    throw "Client creation failed."
}

Write-Host "Creating a dossier..." -ForegroundColor Cyan
$dossierPayload = @{
    title = "Hearing Notif Dossier $timestamp"
    client_id = $client.id
    status = "open"
    priority = "medium"
    description = "Seeded for hearing notification test"
}
$dossier = Invoke-RestMethod -Uri "$BaseUrl/dossiers" -Method Post -ContentType "application/json" -Body ($dossierPayload | ConvertTo-Json -Depth 4)
if (-not $dossier.id) {
    throw "Dossier creation failed."
}

Write-Host "Creating a case..." -ForegroundColor Cyan
$casePayload = @{
    title = "Hearing Notif Case $timestamp"
    dossier_id = $dossier.id
    description = "Seeded for hearing notification test"
    status = "open"
    priority = "medium"
    reference_number = "PRO-$timestamp"
}
$case = Invoke-RestMethod -Uri "$BaseUrl/cases" -Method Post -ContentType "application/json" -Body ($casePayload | ConvertTo-Json -Depth 4)
if (-not $case.id) {
    throw "Case creation failed."
}

$baseDate = (Get-Date).Date
$types = @(
    @{ type = "past"; days = $DaysPast; status = "scheduled" },
    @{ type = "today"; days = $DaysToday; status = "scheduled" },
    @{ type = "tomorrow"; days = $DaysTomorrow; status = "scheduled" },
    @{ type = "soon"; days = $DaysSoon; status = "scheduled" },
    @{ type = "week"; days = $DaysWeek; status = "scheduled" }
)

Write-Host "Creating hearings..." -ForegroundColor Cyan
$created = 0
foreach ($entry in $types) {
    for ($i = 1; $i -le $CountPerType; $i++) {
        $scheduledAt = $baseDate.AddDays($entry.days).AddHours(9 + $i).ToString("yyyy-MM-ddTHH:mm:ss")
        $payload = @{
            title = "Hearing $($entry.type) $timestamp #$i"
            session_type = "hearing"
            status = $entry.status
            scheduled_at = $scheduledAt
            location = "Salle $i"
            court_room = "A$i"
            participants = @("Participant $i", "Assistant $i")
        }

        if ($i % 2 -eq 0) {
            $payload.case_id = $case.id
        } else {
            $payload.dossier_id = $dossier.id
        }

        if ($entry.type -eq "past") {
            $payload.notes = ""
        }

        $session = Invoke-RestMethod -Uri "$BaseUrl/sessions" -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 4)
        if ($session.id) {
            $created++
            Write-Host "✓ Added hearing ID $($session.id) ($($entry.type) #$i)" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to add hearing ($($entry.type) #$i)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Done. Reload the app and open Notification Center to see hearing notifications." -ForegroundColor Green
