$baseUrl = "http://localhost:3000/api/dossiers"

# List of clients (id and name) as returned by the API
$clients = @(
  @{ id = 1; name = "Alice Dupont" },
  @{ id = 2; name = "Bernard Martin" },
  @{ id = 3; name = "Claire Dubois" },
  @{ id = 4; name = "David Lefevre" },
  @{ id = 5; name = "Emma Moreau" },
  @{ id = 6; name = "François Petit" },
  @{ id = 7; name = "Gabrielle Laurent" },
  @{ id = 8; name = "Hugo Girard" },
  @{ id = 9; name = "Isabelle Renault" },
  @{ id = 10; name = "Julien Faure" },
  @{ id = 11; name = "Karine Blanchard" },
  @{ id = 12; name = "Louis Chevalier" },
  @{ id = 13; name = "Marie Lambert" },
  @{ id = 14; name = "Nicolas Marchand" },
  @{ id = 15; name = "Océane Perrin" }
)

# Dossier categories, priorities, phases, statuses (from your form)
$categories = @("Commercial Law", "Family Law", "Criminal Law", "Labor Law", "Real Estate Law", "Administrative Law", "Tax Law")
$priorities = @("urgent", "high", "medium", "low")
$phases = @("Opening", "Investigation", "Negotiation", "Pleading", "Judgment", "Execution")
$statuses = @("open", "in_progress", "on_hold", "closed")

# Example dossiers per client (2-3 per client, respecting required fields)
$dossiers = @()

foreach ($client in $clients) {
  $dossiers += @(
    @{ title = "Contract Review for $($client.name)"; client_id = $client.id; category = "Commercial Law"; priority = "medium"; phase = "Opening"; status = "open"; description = "Review and update commercial contract." },
    @{ title = "Litigation - $($client.name)"; client_id = $client.id; category = "Criminal Law"; priority = "high"; phase = "Investigation"; status = "in_progress"; description = "Ongoing litigation case." }
  )
  if ($client.id % 3 -eq 0) {
    $dossiers += @{ title = "Real Estate Transaction for $($client.name)"; client_id = $client.id; category = "Real Estate Law"; priority = "low"; phase = "Negotiation"; status = "on_hold"; description = "Assist with property transaction." }
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
