$baseUrl = "http://localhost:3000/api/officers"

# 8 specialized officers/experts that can be assigned to missions
$officers = @(
  @{
    name = "Dr. Mohamed Ben Ali"
    email = "m.benali@forensic-experts.tn"
    phone = "+216 71 234 567"
    agency = "National Forensic Investigation Center"
    specialization = "digital_forensics"
    registration_number = "FOR-TN-2024-001"
  },
  @{
    name = "Ing. Fatima Gharbi"
    email = "f.gharbi@engineering-audit.tn"
    phone = "+216 71 345 678"
    agency = "Independent Engineering Consultants"
    specialization = "construction_audit"
    registration_number = "ENG-TN-2024-002"
  },
  @{
    name = "Dr. Karim Taha"
    email = "k.taha@medical-expertise.tn"
    phone = "+216 71 456 789"
    agency = "Medical Expertise Bureau"
    specialization = "medical_assessment"
    registration_number = "MED-TN-2024-003"
  },
  @{
    name = "Youssef Mansouri"
    email = "y.mansouri@investigative-services.tn"
    phone = "+216 98 567 890"
    agency = "Private Investigation Services Ltd"
    specialization = "fraud_investigation"
    registration_number = "INV-TN-2024-004"
  },
  @{
    name = "Dr. Leila Khmiri"
    email = "l.khmiri@accounting-experts.tn"
    phone = "+216 71 678 901"
    agency = "Expert Accountants Association"
    specialization = "financial_audit"
    registration_number = "ACC-TN-2024-005"
  },
  @{
    name = "Sami Bouguerra"
    email = "s.bouguerra@ip-specialists.tn"
    phone = "+216 71 789 012"
    agency = "Intellectual Property Specialists"
    specialization = "ip_valuation"
    registration_number = "IPR-TN-2024-006"
  },
  @{
    name = "Noor Al-Rashid"
    email = "n.rashid@environmental-audit.tn"
    phone = "+216 71 890 123"
    agency = "Environmental Assessment Services"
    specialization = "environmental_compliance"
    registration_number = "ENV-TN-2024-007"
  },
  @{
    name = "Ahmed Salameh"
    email = "a.salameh@software-audit.tn"
    phone = "+216 71 901 234"
    agency = "Software Licensing Compliance Bureau"
    specialization = "software_licensing"
    registration_number = "SFT-TN-2024-008"
  }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 8 Officers/Experts..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($officer in $officers) {
  try {
    $json = $officer | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($officer.name) - $($officer.specialization)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($officer.name) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
