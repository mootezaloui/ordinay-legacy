# Add Financial Entries Script
# This script will create demo financial entries for clients, dossiers, cases, and missions using the API.
# It assumes the API is running at http://localhost:3000/api/financial_entries


# Helper: Generate a random date within the last 30 days
function Get-RandomDate {
    $daysAgo = Get-Random -Minimum 0 -Maximum 30
    return (Get-Date).AddDays(-$daysAgo).ToString('yyyy-MM-dd')
}

# Demo data for enums
$entryTypes = @("income", "expense", "revenue")
$statuses = @("draft", "confirmed", "cancelled", "paid", "pending", "posted", "void")
$currencies = @("TND", "EUR", "USD")
$directions = @("receivable", "payable")

# Load IDs from previous scripts (replace with actual IDs if needed)
$clients = @(1..15)
$dossiers = @(1..35)
$cases = @(1..81)
$missions = @(1..99)

# Create 40 demo financial entries
for ($i = 1; $i -le 40; $i++) {
    $scope = if ((Get-Random -Minimum 0 -Maximum 2) -eq 0) { "client" } else { "internal" }
    $entryType = $entryTypes | Get-Random
    $status = $statuses | Get-Random
    $currency = $currencies | Get-Random
    $direction = $directions | Get-Random
    $amount = [math]::Round((Get-Random -Minimum 100 -Maximum 5000) + (Get-Random), 2)
    $occurredAt = Get-RandomDate
    $dueDate = (Get-Date $occurredAt).AddDays((Get-Random -Minimum 0 -Maximum 30)).ToString('yyyy-MM-dd')
    $paidAt = if ((Get-Random -Minimum 0 -Maximum 2) -eq 0) { (Get-Date $occurredAt).AddDays((Get-Random -Minimum 1 -Maximum 30)).ToString('yyyy-MM-dd') } else { $null }
    $title = "Demo Financial Entry $i"
    $description = "Auto-generated demo entry #$i"
    $reference = "FIN-$(Get-Random -Minimum 1000 -Maximum 9999)"
    $category = if ((Get-Random -Minimum 0 -Maximum 2) -eq 0) { "legal fees" } elseif ((Get-Random -Minimum 0 -Maximum 2) -eq 1) { "court costs" } else { "consulting" }

    # Link to a random client, dossier, case, or mission
    $clientId = if ($scope -eq "client") { $clients | Get-Random } else { $null }
    $dossierId = if ((Get-Random -Minimum 0 -Maximum 2) -eq 0) { $dossiers | Get-Random } else { $null }
    $caseId = if (($dossierId -eq $null) -and ((Get-Random -Minimum 0 -Maximum 2) -eq 0)) { $cases | Get-Random } else { $null }
    $missionId = if ((Get-Random -Minimum 0 -Maximum 4) -eq 0) { $missions | Get-Random } else { $null }

    $body = @{ 
        scope = $scope
        client_id = $clientId
        dossier_id = $dossierId
        case_id = $caseId
        mission_id = $missionId
        entry_type = $entryType
        status = $status
        category = $category
        amount = $amount
        currency = $currency
        occurred_at = $occurredAt
        due_date = $dueDate
        paid_at = $paidAt
        title = $title
        description = $description
        reference = $reference
        direction = $direction
    } | ConvertTo-Json

    Write-Host "Creating financial entry $i..."
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/financial" -Method POST -Body $body -ContentType "application/json"
    Write-Host $response.StatusCode $response.StatusDescription
}
Write-Host "Demo financial entries creation complete."