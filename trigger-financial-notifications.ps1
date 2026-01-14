param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [int[]]$UpcomingDays = @(7, 3, 1),
    [int[]]$OverdueDays = @(1, 3, 7, 14),
    [int]$VariantCount = 5
)

$ErrorActionPreference = "Stop"

function Get-ApiItems {
    param([string]$Endpoint)
    try {
        $items = Invoke-RestMethod -Uri "$BaseUrl/$Endpoint" -Method Get
        if ($items) { return @($items) }
        return @()
    } catch {
        Write-Warning "Failed to load ${Endpoint}: $($_.Exception.Message)"
        return @()
    }
}

function Find-ClientId {
    param(
        [int]$ClientId,
        [int]$DossierId,
        [int]$CaseId,
        [array]$Dossiers,
        [array]$Cases
    )
    if ($ClientId) { return $ClientId }
    if ($DossierId) {
        $dossier = $Dossiers | Where-Object { $_.id -eq $DossierId } | Select-Object -First 1
        if ($dossier -and $dossier.client_id) { return $dossier.client_id }
    }
    if ($CaseId) {
        $caseItem = $Cases | Where-Object { $_.id -eq $CaseId } | Select-Object -First 1
        if ($caseItem -and $caseItem.dossier_id) {
            $dossier = $Dossiers | Where-Object { $_.id -eq $caseItem.dossier_id } | Select-Object -First 1
            if ($dossier -and $dossier.client_id) { return $dossier.client_id }
        }
    }
    return $null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$today = (Get-Date).Date

$clients = Get-ApiItems "clients"
$dossiers = Get-ApiItems "dossiers"
$cases = Get-ApiItems "cases"
$missions = Get-ApiItems "missions"
$tasks = Get-ApiItems "tasks"
$personalTasks = Get-ApiItems "personal-tasks"
$officers = Get-ApiItems "officers"

Write-Host "Loaded:" -ForegroundColor Cyan
Write-Host " clients: $($clients.Count)"
Write-Host " dossiers: $($dossiers.Count)"
Write-Host " cases: $($cases.Count)"
Write-Host " missions: $($missions.Count)"
Write-Host " tasks: $($tasks.Count)"
Write-Host " personal tasks: $($personalTasks.Count)"
Write-Host " officers: $($officers.Count)"

$contexts = @()

if ($dossiers.Count -gt 0) {
    $dossier = $dossiers | Select-Object -First 1
    $contexts += @{ label = "dossier"; dossier_id = $dossier.id }
}
if ($cases.Count -gt 0) {
    $caseItem = $cases | Select-Object -First 1
    $contexts += @{ label = "case"; case_id = $caseItem.id }
}
if ($missions.Count -gt 0) {
    $mission = $missions | Select-Object -First 1
    $contexts += @{ label = "mission"; mission_id = $mission.id; case_id = $mission.case_id; dossier_id = $mission.dossier_id }
}
if ($tasks.Count -gt 0) {
    $task = $tasks | Select-Object -First 1
    $contexts += @{ label = "task"; task_id = $task.id; case_id = $task.case_id; dossier_id = $task.dossier_id }
}
if ($personalTasks.Count -gt 0) {
    $personalTask = $personalTasks | Select-Object -First 1
    $contexts += @{ label = "personalTask"; personal_task_id = $personalTask.id }
}
if ($clients.Count -gt 0) {
    $client = $clients | Select-Object -First 1
    $contexts += @{ label = "client"; client_id = $client.id }
}

if ($contexts.Count -eq 0) {
    Write-Warning "No entities found. Seed clients/dossiers/cases/missions/tasks first."
    exit 1
}

$created = 0
$variantIndex = 0

function New-FinancialEntry {
    param(
        [hashtable]$Context,
        [int]$DaysFromToday,
        [string]$DirectionLabel
    )

    $dueDate = $today.AddDays($DaysFromToday).ToString("yyyy-MM-dd")
    $amount = [math]::Round((Get-Random -Minimum 150 -Maximum 2500) + (Get-Random), 2)
    $currency = @("TND", "EUR", "USD") | Get-Random

    $clientId = Find-ClientId `
        -ClientId $Context.client_id `
        -DossierId $Context.dossier_id `
        -CaseId $Context.case_id `
        -Dossiers $dossiers `
        -Cases $cases

    $scope = if ($clientId) { "client" } else { "internal" }

    $body = @{
        scope = $scope
        client_id = $clientId
        dossier_id = $Context.dossier_id
        case_id = $Context.case_id
        mission_id = $Context.mission_id
        task_id = $Context.task_id
        personal_task_id = $Context.personal_task_id
        entry_type = "income"
        status = "confirmed"
        category = "bailiff fees"
        amount = $amount
        currency = $currency
        occurred_at = $today.ToString("yyyy-MM-dd")
        due_date = $dueDate
        title = "Payment $DirectionLabel $timestamp"
        description = "variantIndex = $variantIndex"
        reference = "FIN-$timestamp-$DirectionLabel-$variantIndex"
        direction = "receivable"
    } | ConvertTo-Json

    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/financial" -Method POST -Body $body -ContentType "application/json"
        Write-Host "Created $DirectionLabel entry for $($Context.label) (variant $variantIndex)" -ForegroundColor Green
        $script:created++
    } catch {
        Write-Warning "Failed to create $DirectionLabel entry for $($Context.label): $($_.Exception.Message)"
    }

    $script:variantIndex = ($script:variantIndex + 1) % $VariantCount
}

foreach ($context in $contexts) {
    foreach ($days in $UpcomingDays) {
        New-FinancialEntry -Context $context -DaysFromToday $days -DirectionLabel "upcoming"
    }
    foreach ($days in $OverdueDays) {
        New-FinancialEntry -Context $context -DaysFromToday (-1 * $days) -DirectionLabel "overdue"
    }
}

Write-Host ""
Write-Host "Created $created financial entries." -ForegroundColor Green
Write-Host "Reload the app and open Notification Center to see financial notifications." -ForegroundColor Green
