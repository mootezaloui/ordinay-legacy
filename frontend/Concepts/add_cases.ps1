$baseUrl = "http://localhost:3000/api/cases"

# List of dossiers (id, title, client_id) as returned by the API
$dossiers = @(
  @{ id = 1; title = "Contract Review for Alice Dupont"; client_id = 1 },
  @{ id = 2; title = "Litigation - Alice Dupont"; client_id = 1 },
  @{ id = 3; title = "Contract Review for Bernard Martin"; client_id = 2 },
  @{ id = 4; title = "Litigation - Bernard Martin"; client_id = 2 },
  @{ id = 5; title = "Contract Review for Claire Dubois"; client_id = 3 },
  @{ id = 6; title = "Litigation - Claire Dubois"; client_id = 3 },
  @{ id = 7; title = "Real Estate Transaction for Claire Dubois"; client_id = 3 },
  @{ id = 8; title = "Contract Review for David Lefevre"; client_id = 4 },
  @{ id = 9; title = "Litigation - David Lefevre"; client_id = 4 },
  @{ id = 10; title = "Contract Review for Emma Moreau"; client_id = 5 },
  @{ id = 11; title = "Litigation - Emma Moreau"; client_id = 5 },
  @{ id = 12; title = "Contract Review for François Petit"; client_id = 6 },
  @{ id = 13; title = "Litigation - François Petit"; client_id = 6 },
  @{ id = 14; title = "Real Estate Transaction for François Petit"; client_id = 6 },
  @{ id = 15; title = "Contract Review for Gabrielle Laurent"; client_id = 7 },
  @{ id = 16; title = "Litigation - Gabrielle Laurent"; client_id = 7 },
  @{ id = 17; title = "Contract Review for Hugo Girard"; client_id = 8 },
  @{ id = 18; title = "Litigation - Hugo Girard"; client_id = 8 },
  @{ id = 19; title = "Contract Review for Isabelle Renault"; client_id = 9 },
  @{ id = 20; title = "Litigation - Isabelle Renault"; client_id = 9 },
  @{ id = 21; title = "Real Estate Transaction for Isabelle Renault"; client_id = 9 },
  @{ id = 22; title = "Contract Review for Julien Faure"; client_id = 10 },
  @{ id = 23; title = "Litigation - Julien Faure"; client_id = 10 },
  @{ id = 24; title = "Contract Review for Karine Blanchard"; client_id = 11 },
  @{ id = 25; title = "Litigation - Karine Blanchard"; client_id = 11 },
  @{ id = 26; title = "Contract Review for Louis Chevalier"; client_id = 12 },
  @{ id = 27; title = "Litigation - Louis Chevalier"; client_id = 12 },
  @{ id = 28; title = "Real Estate Transaction for Louis Chevalier"; client_id = 12 },
  @{ id = 29; title = "Contract Review for Marie Lambert"; client_id = 13 },
  @{ id = 30; title = "Litigation - Marie Lambert"; client_id = 13 },
  @{ id = 31; title = "Contract Review for Nicolas Marchand"; client_id = 14 },
  @{ id = 32; title = "Litigation - Nicolas Marchand"; client_id = 14 },
  @{ id = 33; title = "Contract Review for Océane Perrin"; client_id = 15 },
  @{ id = 34; title = "Litigation - Océane Perrin"; client_id = 15 },
  @{ id = 35; title = "Real Estate Transaction for Océane Perrin"; client_id = 15 }
)

# Example values for required and optional fields
$statuses = @("open","in_progress","on_hold","closed")
$priorities = @("urgent","high","medium","low")
$phases = @("Opening","Investigation","Negotiation","Pleading","Judgment","Execution")

# Generate 1-3 cases per dossier, filling all fields
$cases = @()

foreach ($dossier in $dossiers) {
  $cases += @(
    @{ title = "Case 1 for $($dossier.title)"; dossier_id = $dossier.id; description = "First case for $($dossier.title)"; adversary = "Adversary A"; adversary_party = "Party A"; adversary_lawyer = "Lawyer A"; court = "Court A"; filing_date = "2026-01-13"; next_hearing = "2026-02-01"; reference_number = "REF-$(Get-Random -Minimum 1000 -Maximum 9999)"; status = "open"; priority = "medium"; opened_at = "2026-01-13T09:00:00Z"; closed_at = $null },
    @{ title = "Case 2 for $($dossier.title)"; dossier_id = $dossier.id; description = "Second case for $($dossier.title)"; adversary = "Adversary B"; adversary_party = "Party B"; adversary_lawyer = "Lawyer B"; court = "Court B"; filing_date = "2026-01-14"; next_hearing = "2026-02-10"; reference_number = "REF-$(Get-Random -Minimum 1000 -Maximum 9999)"; status = "in_progress"; priority = "high"; opened_at = "2026-01-14T09:00:00Z"; closed_at = $null }
  )
  if ($dossier.id % 3 -eq 0) {
    $cases += @{ title = "Case 3 for $($dossier.title)"; dossier_id = $dossier.id; description = "Third case for $($dossier.title)"; adversary = "Adversary C"; adversary_party = "Party C"; adversary_lawyer = "Lawyer C"; court = "Court C"; filing_date = "2026-01-15"; next_hearing = "2026-02-20"; reference_number = "REF-$(Get-Random -Minimum 1000 -Maximum 9999)"; status = "on_hold"; priority = "low"; opened_at = "2026-01-15T09:00:00Z"; closed_at = $null }
  }
}

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding Cases to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($case in $cases) {
  try {
    $json = $case | ConvertTo-Json -Depth 4
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($case.title) for dossier $($case.dossier_id)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($case.title) for dossier $($case.dossier_id) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 300
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
