$baseUrl = "http://localhost:3000/api/financial"
$now = Get-Date

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Adding 26 Financial Entries..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$successCount = 0
$failureCount = 0

# 10 client income entries
$entries = @(
  @{ scope="client"; entry_type="income"; status="pending"; amount=8500; currency="TND"; occurred_at=$now.AddHours(-24).ToUniversalTime().ToString("o"); due_date=$now.ToUniversalTime().ToString("o"); paid_at=$null; client_id=1; dossier_id=1; case_id=$null; mission_id=$null; title="Initial retainer - DOS-2026-001"; notes="Initial retainer fee" },
  @{ scope="client"; entry_type="income"; status="pending"; amount=6200; currency="TND"; occurred_at=$now.AddHours(-48).ToUniversalTime().ToString("o"); due_date=$now.AddHours(24).ToUniversalTime().ToString("o"); paid_at=$null; client_id=2; dossier_id=2; case_id=$null; mission_id=$null; title="Monthly services - TechnoSoft"; notes="Monthly legal services" },
  @{ scope="client"; entry_type="income"; status="confirmed"; amount=5500; currency="TND"; occurred_at=$now.AddDays(-5).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-5).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-2).ToUniversalTime().ToString("o"); client_id=3; dossier_id=3; case_id=$null; mission_id=$null; title="Consultation fees - Fatima Mansour"; notes="Consultation fees" },
  @{ scope="client"; entry_type="income"; status="confirmed"; amount=7200; currency="TND"; occurred_at=$now.AddDays(-8).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-8).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-4).ToUniversalTime().ToString("o"); client_id=4; dossier_id=4; case_id=$null; mission_id=$null; title="Commercial dispute - Mediterranean Trading"; notes="Commercial dispute" },
  @{ scope="client"; entry_type="income"; status="pending"; amount=4800; currency="TND"; occurred_at=$now.AddHours(-12).ToUniversalTime().ToString("o"); due_date=$now.AddHours(48).ToUniversalTime().ToString("o"); paid_at=$null; client_id=5; dossier_id=5; case_id=$null; mission_id=$null; title="Hourly billing - Boundary case"; notes="Hourly billing" },
  @{ scope="client"; entry_type="income"; status="confirmed"; amount=3900; currency="TND"; occurred_at=$now.AddDays(-3).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-3).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-1).ToUniversalTime().ToString("o"); client_id=6; dossier_id=6; case_id=$null; mission_id=$null; title="Employment law - Leila Gharbi"; notes="Employment consultation" },
  @{ scope="client"; entry_type="income"; status="pending"; amount=9200; currency="TND"; occurred_at=$now.AddHours(-30).ToUniversalTime().ToString("o"); due_date=$now.AddHours(72).ToUniversalTime().ToString("o"); paid_at=$null; client_id=7; dossier_id=7; case_id=$null; mission_id=$null; title="Environmental case - Green Energy"; notes="Environmental compliance" },
  @{ scope="client"; entry_type="income"; status="confirmed"; amount=4500; currency="TND"; occurred_at=$now.AddDays(-7).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-7).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-5).ToUniversalTime().ToString("o"); client_id=8; dossier_id=8; case_id=$null; mission_id=$null; title="Criminal defense - Youssef Amri"; notes="Criminal defense" },
  @{ scope="client"; entry_type="income"; status="pending"; amount=3800; currency="TND"; occurred_at=$now.AddHours(-20).ToUniversalTime().ToString("o"); due_date=$now.AddHours(48).ToUniversalTime().ToString("o"); paid_at=$null; client_id=9; dossier_id=9; case_id=$null; mission_id=$null; title="Construction dispute - Atlas Construction"; notes="Construction dispute" },
  @{ scope="client"; entry_type="income"; status="confirmed"; amount=2900; currency="TND"; occurred_at=$now.AddDays(-12).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-12).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-10).ToUniversalTime().ToString("o"); client_id=10; dossier_id=10; case_id=$null; mission_id=$null; title="Commercial licensing - Sami Bouazizi"; notes="Commercial licensing" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=2500; currency="TND"; occurred_at=$now.AddDays(-2).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-2).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-1).ToUniversalTime().ToString("o"); client_id=$null; dossier_id=1; case_id=$null; mission_id=1; title="Forensic investigation - MISS-2026-001"; notes="Forensic investigation" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=3200; currency="TND"; occurred_at=$now.AddHours(-6).ToUniversalTime().ToString("o"); due_date=$now.AddHours(72).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=2; case_id=$null; mission_id=3; title="Software analysis - MISS-2026-003"; notes="Software code analysis" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=1800; currency="TND"; occurred_at=$now.AddHours(-18).ToUniversalTime().ToString("o"); due_date=$now.AddHours(48).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=8; case_id=$null; mission_id=15; title="Evidence analysis - MISS-2026-015"; notes="Evidence analysis" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=2100; currency="TND"; occurred_at=$now.AddDays(-4).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-4).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-2).ToUniversalTime().ToString("o"); client_id=$null; dossier_id=9; case_id=$null; mission_id=17; title="Construction audit - MISS-2026-017"; notes="Construction audit" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=800; currency="TND"; occurred_at=$now.AddHours(-4).ToUniversalTime().ToString("o"); due_date=$now.AddHours(24).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=$null; case_id=1; mission_id=$null; title="Court filing fees - PRO-2026-001-A"; notes="Court filing fees" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=550; currency="TND"; occurred_at=$now.AddDays(-6).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-6).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-5).ToUniversalTime().ToString("o"); client_id=$null; dossier_id=$null; case_id=9; mission_id=$null; title="Cadastral fees - PRO-2026-009-A"; notes="Cadastral fees" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=1200; currency="TND"; occurred_at=$now.AddHours(-36).ToUniversalTime().ToString("o"); due_date=$now.AddHours(96).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=$null; case_id=11; mission_id=$null; title="Appeal fees - PRO-2026-011-A"; notes="Court appeal fees" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=450; currency="TND"; occurred_at=$now.AddDays(-10).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-10).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-8).ToUniversalTime().ToString("o"); client_id=$null; dossier_id=$null; case_id=14; mission_id=$null; title="Labor court fees - PRO-2026-014-A"; notes="Labor court fees" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=950; currency="TND"; occurred_at=$now.AddHours(-8).ToUniversalTime().ToString("o"); due_date=$now.AddHours(60).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=7; case_id=$null; mission_id=13; title="Travel expenses - MISS-2026-013"; notes="Travel expenses" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=1350; currency="TND"; occurred_at=$now.AddDays(-3).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-3).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-2).ToUniversalTime().ToString("o"); client_id=$null; dossier_id=9; case_id=$null; mission_id=17; title="Accommodation - MISS-2026-017"; notes="Accommodation costs" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=680; currency="TND"; occurred_at=$now.AddHours(-12).ToUniversalTime().ToString("o"); due_date=$now.AddHours(84).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=5; case_id=$null; mission_id=9; title="Travel - MISS-2026-009"; notes="Travel reimbursement" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=420; currency="TND"; occurred_at=$now.AddHours(-2).ToUniversalTime().ToString("o"); due_date=$now.AddHours(36).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=4; case_id=$null; mission_id=$null; title="Document translation - DOS-2026-004"; notes="Document translation" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=340; currency="TND"; occurred_at=$now.AddDays(-5).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-5).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-4).ToUniversalTime().ToString("o"); client_id=$null; dossier_id=2; case_id=$null; mission_id=$null; title="Report translation - DOS-2026-002"; notes="Report translation" },
  @{ scope="internal"; entry_type="expense"; status="pending"; amount=280; currency="TND"; occurred_at=$now.AddHours(-14).ToUniversalTime().ToString("o"); due_date=$now.AddHours(72).ToUniversalTime().ToString("o"); paid_at=$null; client_id=$null; dossier_id=7; case_id=$null; mission_id=$null; title="Regulation translation - DOS-2026-007"; notes="Regulation translation" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=150; currency="TND"; occurred_at=$now.AddDays(-1).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-1).ToUniversalTime().ToString("o"); paid_at=$now.ToUniversalTime().ToString("o"); client_id=$null; dossier_id=$null; case_id=$null; mission_id=$null; title="Database subscription"; notes="Legal database" },
  @{ scope="internal"; entry_type="expense"; status="confirmed"; amount=200; currency="TND"; occurred_at=$now.AddDays(-30).ToUniversalTime().ToString("o"); due_date=$now.AddDays(-30).ToUniversalTime().ToString("o"); paid_at=$now.AddDays(-29).ToUniversalTime().ToString("o"); client_id=$null; dossier_id=$null; case_id=$null; mission_id=$null; title="Case law tool subscription"; notes="Case law subscription" }
)

foreach ($entry in $entries) {
  try {
    $json = $entry | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($entry.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($entry.title) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Cyan
