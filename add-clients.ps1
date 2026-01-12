$baseUrl = "http://localhost:3000/api/clients"

$clients = @(
  @{
    name = "Ahmed Ben Salem"
    email = "ahmed.bensalem@email.com"
    phone = "+216 98 123 456"
    alternate_phone = "+216 71 234 567"
    address = "15 Avenue Habib Bourguiba, Tunis 1000"
    status = "active"
    cin = "12345678"
    date_of_birth = "1985-03-15"
    profession = "Architect"
    company = $null
    tax_id = $null
    notes = "Referred by previous client. Prefers morning appointments."
    join_date = "2026-01-05"
  },
  @{
    name = "TechnoSoft Solutions SARL"
    email = "contact@technosoft.tn"
    phone = "+216 71 890 123"
    alternate_phone = "+216 98 456 789"
    address = "Immeuble Business Center, Lac 2, Tunis"
    status = "active"
    cin = $null
    date_of_birth = $null
    profession = $null
    company = "TechnoSoft Solutions SARL"
    tax_id = "1234567A"
    notes = "IT consulting company. Main contact: Director Mohamed Jlassi."
    join_date = "2026-01-03"
  },
  @{
    name = "Fatima Mansour"
    email = "fatima.mansour@gmail.com"
    phone = "+216 22 345 678"
    alternate_phone = $null
    address = "42 Rue de Marseille, Sfax 3000"
    status = "active"
    cin = "87654321"
    date_of_birth = "1990-07-22"
    profession = "Teacher"
    company = $null
    tax_id = $null
    notes = "Divorce case. Sensitive matter, handle with care."
    join_date = "2026-01-07"
  },
  @{
    name = "Mediterranean Trading Company"
    email = "legal@medtrade.com"
    phone = "+216 73 456 789"
    alternate_phone = "+216 98 765 432"
    address = "Zone Industrielle, Sousse 4000"
    status = "active"
    cin = $null
    date_of_birth = $null
    profession = $null
    company = "Mediterranean Trading Company"
    tax_id = "7891234B"
    notes = "Import/Export business. Needs regular contract reviews."
    join_date = "2025-12-20"
  },
  @{
    name = "Karim Trabelsi"
    email = "k.trabelsi@yahoo.com"
    phone = "+216 95 678 901"
    alternate_phone = "+216 71 567 890"
    address = "8 Rue de la Liberté, Ariana 2080"
    status = "active"
    cin = "23456789"
    date_of_birth = "1978-11-30"
    profession = "Engineer"
    company = $null
    tax_id = $null
    notes = "Real estate dispute. High priority client."
    join_date = "2026-01-02"
  },
  @{
    name = "Leila Gharbi"
    email = "leila.gharbi@outlook.com"
    phone = "+216 24 789 012"
    alternate_phone = $null
    address = "27 Avenue de la République, Monastir 5000"
    status = "active"
    cin = "34567890"
    date_of_birth = "1988-05-14"
    profession = "Doctor"
    company = $null
    tax_id = $null
    notes = "Employment contract dispute. Speaks French and English."
    join_date = "2026-01-06"
  },
  @{
    name = "Green Energy Tunisie SA"
    email = "info@greenenergy.tn"
    phone = "+216 70 123 456"
    alternate_phone = "+216 98 234 567"
    address = "Technopole El Ghazala, Ariana 2088"
    status = "active"
    cin = $null
    date_of_birth = $null
    profession = $null
    company = "Green Energy Tunisie SA"
    tax_id = "4567890C"
    notes = "Renewable energy sector. Regular compliance requirements."
    join_date = "2025-12-15"
  },
  @{
    name = "Youssef Amri"
    email = "youssef.amri@email.tn"
    phone = "+216 29 345 678"
    alternate_phone = "+216 75 456 789"
    address = "103 Rue Mongi Slim, Nabeul 8000"
    status = "active"
    cin = "45678901"
    date_of_birth = "1995-09-08"
    profession = "Entrepreneur"
    company = $null
    tax_id = $null
    notes = "Business formation and trademark registration."
    join_date = "2026-01-08"
  },
  @{
    name = "Atlas Construction Group"
    email = "legal@atlasconstruction.com"
    phone = "+216 71 555 666"
    alternate_phone = "+216 98 777 888"
    address = "45 Boulevard 7 Novembre, Tunis 1002"
    status = "active"
    cin = $null
    date_of_birth = $null
    profession = $null
    company = "Atlas Construction Group"
    tax_id = "6789012D"
    notes = "Large construction company. Multiple ongoing contracts."
    join_date = "2025-11-30"
  },
  @{
    name = "Sami Bouazizi"
    email = "sami.bouazizi@hotmail.com"
    phone = "+216 26 890 123"
    alternate_phone = $null
    address = "67 Avenue Farhat Hached, Bizerte 7000"
    status = "inActive"
    cin = "56789012"
    date_of_birth = "1982-12-25"
    profession = "Journalist"
    company = $null
    tax_id = $null
    notes = "Case closed. Set to inactive but keeping records for reference."
    join_date = "2025-10-15"
  }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 10 Clients to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($client in $clients) {
  try {
    $json = $client | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($client.name)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($client.name) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
