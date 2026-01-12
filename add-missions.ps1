$baseUrl = "http://localhost:3000/api/missions"

# Current date/time (January 8, 2026)
$now = Get-Date

# Helper function to calculate due dates
function Get-DueDate {
  param([int]$hoursFromNow)
  return ($now.AddHours($hoursFromNow)).ToUniversalTime().ToString("o")
}

# Helper function to get random item from array
function Get-RandomItem {
  param([array]$items)
  return $items | Get-Random
}

# Mission types and configurations
$missionTypes = @("investigation", "expert_assessment", "audit", "inspection", "research", "valuation", "verification")
$statuses = @("planned", "in_progress", "completed", "cancelled")

# 28 missions distributed across dossiers and cases
# Dossier IDs: 1-15, Case IDs: 1-34
# We'll create 2 missions per dossier, and some linked to specific cases

$missions = @(
  # DOS-2026-001 (Ahmed Ben Salem, tax evasion)
  @{
    reference = "MISS-2026-001"
    title = "Financial records investigation - comprehensive audit of business accounts"
    mission_type = "investigation"
    status = "in_progress"
    priority = "urgent"
    dossier_id = 1
    case_id = $null
    officer_id = 5
    due_date = Get-DueDate 48
  },
  @{
    reference = "MISS-2026-002"
    title = "Digital forensics analysis of accounting software and transactions"
    mission_type = "expert_assessment"
    status = "planned"
    priority = "urgent"
    dossier_id = 1
    case_id = $null
    officer_id = 1
    due_date = Get-DueDate 72
  },
  
  # DOS-2026-002 (TechnoSoft Solutions, IP dispute)
  @{
    reference = "MISS-2026-003"
    title = "Software code analysis and originality verification for copyright claim"
    mission_type = "expert_assessment"
    status = "in_progress"
    priority = "high"
    dossier_id = 2
    case_id = $null
    officer_id = 8
    due_date = Get-DueDate 96
  },
  @{
    reference = "MISS-2026-004"
    title = "Intellectual property valuation for damages calculation"
    mission_type = "valuation"
    status = "planned"
    priority = "high"
    dossier_id = 2
    case_id = $null
    officer_id = 6
    due_date = Get-DueDate 120
  },
  
  # DOS-2026-003 (Fatima Mansour, divorce/property)
  @{
    reference = "MISS-2026-005"
    title = "Real property valuation and market analysis for asset division"
    mission_type = "valuation"
    status = "planned"
    priority = "high"
    dossier_id = 3
    case_id = $null
    officer_id = 2
    due_date = Get-DueDate 144
  },
  @{
    reference = "MISS-2026-006"
    title = "Investigation of hidden assets and financial records review"
    mission_type = "investigation"
    status = "planned"
    priority = "medium"
    dossier_id = 3
    case_id = $null
    officer_id = 5
    due_date = Get-DueDate 168
  },
  
  # DOS-2026-004 (Mediterranean Trading, commercial dispute)
  @{
    reference = "MISS-2026-007"
    title = "Contract interpretation and commercial practice expert assessment"
    mission_type = "expert_assessment"
    status = "planned"
    priority = "high"
    dossier_id = 4
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 84
  },
  @{
    reference = "MISS-2026-008"
    title = "International trade compliance audit and documentation verification"
    mission_type = "audit"
    status = "planned"
    priority = "high"
    dossier_id = 4
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 96
  },
  
  # DOS-2026-005 (Karim Trabelsi, boundary dispute)
  @{
    reference = "MISS-2026-009"
    title = "Land survey audit and historical boundary documentation review"
    mission_type = "inspection"
    status = "planned"
    priority = "high"
    dossier_id = 5
    case_id = $null
    officer_id = 2
    due_date = Get-DueDate 120
  },
  @{
    reference = "MISS-2026-010"
    title = "Cadastral records investigation and expert testimony preparation"
    mission_type = "research"
    status = "planned"
    priority = "medium"
    dossier_id = 5
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 168
  },
  
  # DOS-2026-006 (Leila Gharbi, labor dispute)
  @{
    reference = "MISS-2026-011"
    title = "Medical examination for work-related injury assessment"
    mission_type = "expert_assessment"
    status = "planned"
    priority = "urgent"
    dossier_id = 6
    case_id = $null
    officer_id = 3
    due_date = Get-DueDate 36
  },
  @{
    reference = "MISS-2026-012"
    title = "Employment contract audit and labor law compliance verification"
    mission_type = "audit"
    status = "planned"
    priority = "high"
    dossier_id = 6
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 84
  },
  
  # DOS-2026-007 (Green Energy Tunisie, environmental)
  @{
    reference = "MISS-2026-013"
    title = "Environmental compliance audit and regulatory assessment"
    mission_type = "audit"
    status = "in_progress"
    priority = "high"
    dossier_id = 7
    case_id = $null
    officer_id = 7
    due_date = Get-DueDate 144
  },
  @{
    reference = "MISS-2026-014"
    title = "Solar facility inspection and operational assessment report"
    mission_type = "inspection"
    status = "planned"
    priority = "medium"
    dossier_id = 7
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 192
  },
  
  # DOS-2026-008 (Youssef Amri, criminal matter)
  @{
    reference = "MISS-2026-015"
    title = "Forensic investigation and evidence collection analysis"
    mission_type = "investigation"
    status = "in_progress"
    priority = "urgent"
    dossier_id = 8
    case_id = $null
    officer_id = 1
    due_date = Get-DueDate 48
  },
  @{
    reference = "MISS-2026-016"
    title = "Witness statement verification and credibility assessment"
    mission_type = "investigation"
    status = "planned"
    priority = "high"
    dossier_id = 8
    case_id = $null
    officer_id = 4
    due_date = Get-DueDate 72
  },
  
  # DOS-2026-009 (Atlas Construction, construction dispute)
  @{
    reference = "MISS-2026-017"
    title = "Construction audit and project specification compliance review"
    mission_type = "audit"
    status = "in_progress"
    priority = "high"
    dossier_id = 9
    case_id = $null
    officer_id = 2
    due_date = Get-DueDate 96
  },
  @{
    reference = "MISS-2026-018"
    title = "Building inspection and structural assessment for defects"
    mission_type = "inspection"
    status = "planned"
    priority = "high"
    dossier_id = 9
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 120
  },
  
  # DOS-2026-010 (Sami Bouazizi, commercial licensing)
  @{
    reference = "MISS-2026-019"
    title = "Commercial registration audit and licensing compliance verification"
    mission_type = "audit"
    status = "planned"
    priority = "medium"
    dossier_id = 10
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 72
  },
  @{
    reference = "MISS-2026-020"
    title = "Business continuity assessment and operational review"
    mission_type = "research"
    status = "planned"
    priority = "medium"
    dossier_id = 10
    case_id = $null
    officer_id = $null
    due_date = Get-DueDate 168
  },
  
  # Additional missions for cases (linked to specific PRO-2026 cases)
  @{
    reference = "MISS-2026-021"
    title = "Software licensing compliance verification - detailed code audit"
    mission_type = "expert_assessment"
    status = "in_progress"
    priority = "urgent"
    dossier_id = $null
    case_id = 6
    officer_id = 8
    due_date = Get-DueDate 48
  },
  @{
    reference = "MISS-2026-022"
    title = "Damages calculation - lost revenue and business impact assessment"
    mission_type = "valuation"
    status = "planned"
    priority = "high"
    dossier_id = $null
    case_id = 7
    officer_id = 5
    due_date = Get-DueDate 120
  },
  @{
    reference = "MISS-2026-023"
    title = "Trademark registration verification and market use documentation"
    mission_type = "research"
    status = "planned"
    priority = "medium"
    dossier_id = $null
    case_id = 12
    officer_id = 6
    due_date = Get-DueDate 96
  },
  @{
    reference = "MISS-2026-024"
    title = "Comparative law research on non-compete enforceability"
    mission_type = "research"
    status = "planned"
    priority = "medium"
    dossier_id = $null
    case_id = 15
    officer_id = $null
    due_date = Get-DueDate 144
  },
  @{
    reference = "MISS-2026-025"
    title = "Expert engineer testimony - highway project variation analysis"
    mission_type = "expert_assessment"
    status = "in_progress"
    priority = "high"
    dossier_id = $null
    case_id = 18
    officer_id = 2
    due_date = Get-DueDate 84
  },
  @{
    reference = "MISS-2026-026"
    title = "Medical expert assessment - occupational health impact evaluation"
    mission_type = "expert_assessment"
    status = "planned"
    priority = "urgent"
    dossier_id = $null
    case_id = 21
    officer_id = 3
    due_date = Get-DueDate 36
  },
  @{
    reference = "MISS-2026-027"
    title = "Architectural expert opinion - design copyright and originality analysis"
    mission_type = "expert_assessment"
    status = "planned"
    priority = "high"
    dossier_id = $null
    case_id = 24
    officer_id = $null
    due_date = Get-DueDate 108
  },
  @{
    reference = "MISS-2026-028"
    title = "International arbitration expert support - cross-border procedural guidance"
    mission_type = "research"
    status = "planned"
    priority = "high"
    dossier_id = $null
    case_id = 28
    officer_id = $null
    due_date = Get-DueDate 192
  }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 28 Missions..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($mission in $missions) {
  try {
    $json = $mission | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($mission.reference) - $($mission.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($mission.reference) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
