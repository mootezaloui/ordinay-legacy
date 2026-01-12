$baseUrl = "http://localhost:3000/api/dossiers"

$dossiers = @(
  @{
    reference = "DOS-2026-001"
    client_id = 1
    title = "Apartment Building Design Copyright Dispute"
    description = "Client claims an architecture firm used their design without permission for a residential complex in La Marsa. Claims damages of 50,000 TND."
    category = "intellectual_property"
    phase = "negotiation"
    adversary_party = "Silva Architecture & Design"
    adversary_lawyer = "Maitre Hassan Belhaj"
    estimated_value = 50000
    court_reference = "TUN/2025/1847"
    assigned_lawyer = "Maitre Amira Ben Slimane"
    status = "in_progress"
    priority = "high"
    opened_at = "2025-12-15T09:00:00Z"
    next_deadline = "2026-02-15T17:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-002"
    client_id = 1
    title = "Land Boundary Dispute - Ariana"
    description = "Property line dispute with neighbor regarding shared wall. Neighbor claims client's building encroaches 2 meters into their land."
    category = "real_estate"
    phase = "litigation"
    adversary_party = "Hassan Makni"
    adversary_lawyer = "Maitre Karim Zahra"
    estimated_value = 35000
    court_reference = "TUN/2025/1912"
    assigned_lawyer = "Maitre Mohammed Al-Farsi"
    status = "open"
    priority = "high"
    opened_at = "2026-01-02T10:30:00Z"
    next_deadline = "2026-03-20T14:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-003"
    client_id = 2
    title = "Former Employee Breaching Non-Compete Agreement"
    description = "Former CTO joined competitor immediately after leaving. Allegedly soliciting company clients. Seeking injunction and damages of 100,000 TND."
    category = "employment"
    phase = "litigation"
    adversary_party = "Abdelkader Ghazi"
    adversary_lawyer = "Cabinet Ghazi & Associates"
    estimated_value = 100000
    court_reference = "TUN/2025/2103"
    assigned_lawyer = "Maitre Sonia Benslama"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-11-20T11:00:00Z"
    next_deadline = "2026-01-25T16:30:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-004"
    client_id = 2
    title = "Unauthorized Use of Proprietary Software"
    description = "Local tech company using client's licensed software without proper licensing. Identified through audit. Claiming damages and seeking license compliance."
    category = "intellectual_property"
    phase = "negotiation"
    adversary_party = "Digital Solutions Tunisie"
    adversary_lawyer = "Maitre Yassine Khodja"
    estimated_value = 45000
    court_reference = $null
    assigned_lawyer = "Maitre Amira Ben Slimane"
    status = "open"
    priority = "medium"
    opened_at = "2025-12-28T14:20:00Z"
    next_deadline = "2026-02-10T15:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-005"
    client_id = 3
    title = "Divorce Proceedings with Child Custody"
    description = "Client seeking divorce after 12 years of marriage. Two minor children. Dispute over child custody, alimony (1,500 TND/month requested), and marital property division."
    category = "family_law"
    phase = "litigation"
    adversary_party = "Mehdi Mansour"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    estimated_value = 80000
    court_reference = "TUN/2025/1645"
    assigned_lawyer = "Maitre Leila Boughdiri"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-11-05T09:45:00Z"
    next_deadline = "2026-02-05T10:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-006"
    client_id = 4
    title = "Import Tariff Classification Appeal"
    description = "Customs authority incorrectly classified imported textiles resulting in 250,000 TND additional duties. Appealing classification decision administratively."
    category = "administrative_law"
    phase = "litigation"
    adversary_party = "Tunisian Customs Authority"
    adversary_lawyer = "Cabinet Ministériel des Douanes"
    estimated_value = 250000
    court_reference = "TUN/2025/2201"
    assigned_lawyer = "Maitre Hichem Nasr"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-10-30T08:15:00Z"
    next_deadline = "2026-03-15T14:30:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-007"
    client_id = 4
    title = "Supplier Contract Breach - Delayed Shipment"
    description = "Italian supplier failed to deliver 500 tons of raw materials on agreed date. Caused production delays and loss of 150,000 TND in revenue. Demanding damages."
    category = "commercial"
    phase = "negotiation"
    adversary_party = "Eurotech Manufacturing S.p.A."
    adversary_lawyer = "Studio Legale Romano"
    estimated_value = 150000
    court_reference = $null
    assigned_lawyer = "Maitre Sonia Benslama"
    status = "open"
    priority = "high"
    opened_at = "2025-12-10T13:00:00Z"
    next_deadline = "2026-02-28T17:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-008"
    client_id = 5
    title = "Property Purchase Fraud - Hidden Structural Defects"
    description = "Client purchased villa in Skhira for 350,000 TND. Discovered significant foundation issues within weeks. Seller concealed defects. Seeking contract rescission and full refund."
    category = "real_estate"
    phase = "litigation"
    adversary_party = "Nabil Hamza"
    adversary_lawyer = "Maitre Dina El-Ouaer"
    estimated_value = 350000
    court_reference = "TUN/2025/1756"
    assigned_lawyer = "Maitre Mohammed Al-Farsi"
    status = "in_progress"
    priority = "high"
    opened_at = "2025-12-01T11:30:00Z"
    next_deadline = "2026-02-20T15:45:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-009"
    client_id = 6
    title = "Wrongful Termination from Hospital Position"
    description = "Client terminated without proper cause after 8 years as senior physician. Hospital claims restructuring but followed improper procedure. Claiming 18 months severance (75,000 TND) and damages."
    category = "employment"
    phase = "litigation"
    adversary_party = "Hospital Anis Ibn Sina"
    adversary_lawyer = "Cabinet RH Juridique Tunisie"
    estimated_value = 75000
    court_reference = "TUN/2025/1823"
    assigned_lawyer = "Maitre Sonia Benslama"
    status = "in_progress"
    priority = "high"
    opened_at = "2025-12-05T10:00:00Z"
    next_deadline = "2026-03-10T11:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-010"
    client_id = 7
    title = "Environmental Authority Compliance Review"
    description = "ANPE (National Agency for Environmental Protection) conducting audit of solar facility. Client requesting legal support for compliance documentation and potential violations response."
    category = "regulatory"
    phase = "negotiation"
    adversary_party = "ANPE Tunisia"
    adversary_lawyer = "Cabinet Juridique de l'ANPE"
    estimated_value = 50000
    court_reference = $null
    assigned_lawyer = "Maitre Hichem Nasr"
    status = "open"
    priority = "medium"
    opened_at = "2026-01-06T09:30:00Z"
    next_deadline = "2026-02-06T17:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-011"
    client_id = 7
    title = "Agricultural Land Lease Termination Dispute"
    description = "Land owner attempting to terminate 25-year lease early. Client invested 2 million TND in solar infrastructure. Seeking specific performance and damages."
    category = "real_estate"
    phase = "litigation"
    adversary_party = "Habib Loubbi Estate"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    estimated_value = 2000000
    court_reference = "TUN/2025/2145"
    assigned_lawyer = "Maitre Mohammed Al-Farsi"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-11-25T14:00:00Z"
    next_deadline = "2026-02-28T14:30:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-012"
    client_id = 8
    title = "E-commerce Startup Formation & IP Protection"
    description = "Client forming new online retail company. Needs company registration, trademark protection for brand name 'AmriShop', privacy policy, terms & conditions, and supplier agreements."
    category = "commercial"
    phase = "negotiation"
    adversary_party = $null
    adversary_lawyer = $null
    estimated_value = 5000
    court_reference = $null
    assigned_lawyer = "Maitre Amira Ben Slimane"
    status = "in_progress"
    priority = "medium"
    opened_at = "2026-01-08T10:15:00Z"
    next_deadline = "2026-01-31T17:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-013"
    client_id = 9
    title = "Public Works Contract - Variation Order Dispute"
    description = "20 million TND highway construction project. Government refusing to authorize 3 million TND in legitimate variation orders. Work delayed 6 months. Claiming cost overruns and damages."
    category = "commercial"
    phase = "litigation"
    adversary_party = "Ministry of Public Works"
    adversary_lawyer = "Cabinet Juridique Ministériel"
    estimated_value = 3000000
    court_reference = "TUN/2025/1934"
    assigned_lawyer = "Maitre Hichem Nasr"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-10-15T08:00:00Z"
    next_deadline = "2026-04-15T15:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-014"
    client_id = 9
    title = "Unpaid Subcontractor Invoices - Lien Rights"
    description = "Two subcontractors claiming 850,000 TND unpaid for steel reinforcement and concrete work on commercial complex. Exercising mechanic's lien. Project owner disputing quality of work."
    category = "commercial"
    phase = "negotiation"
    adversary_party = "Nabeul Commercial Properties Ltd"
    adversary_lawyer = "Maitre Karim Zahra"
    estimated_value = 850000
    court_reference = $null
    assigned_lawyer = "Maitre Sonia Benslama"
    status = "open"
    priority = "high"
    opened_at = "2025-12-20T13:45:00Z"
    next_deadline = "2026-02-15T12:00:00Z"
    closed_at = $null
  },
  @{
    reference = "DOS-2026-015"
    client_id = 10
    title = "Online Defamation - Reputation Damage"
    description = "Newspaper published false allegations about client's journalism. Court ordered retraction and published apology. Case resolved."
    category = "media_law"
    phase = "closed"
    adversary_party = "Tunis Daily Newspaper"
    adversary_lawyer = "Maitre Tariq Ibn Salem"
    estimated_value = 25000
    court_reference = "TUN/2024/1523"
    assigned_lawyer = "Maitre Leila Boughdiri"
    status = "closed"
    priority = "medium"
    opened_at = "2024-07-10T09:00:00Z"
    next_deadline = $null
    closed_at = "2025-10-20T16:00:00Z"
  }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 15 Dossiers to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($dossier in $dossiers) {
  try {
    $json = $dossier | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($dossier.reference) - $($dossier.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($dossier.reference) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
