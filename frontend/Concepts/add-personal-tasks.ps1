$baseUrl = "http://localhost:3000/api/personal-tasks"

# Current date/time (January 8, 2026)
$now = Get-Date

# Helper function to calculate due dates
function Get-DueDate {
  param([int]$hoursFromNow)
  return ($now.AddHours($hoursFromNow)).ToUniversalTime().ToString("o")
}

# 35 personal tasks (for the lawyers themselves, not case-specific)
$personalTasks = @(
  # Urgent personal tasks (2-4 hours)
  @{
    title = "Prepare preliminary injunction brief - urgent filing today"
    description = "Finalize emergency injunction motion for non-compete case, ready for filing"
    category = "case_preparation"
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 2
  },
  @{
    title = "Call expert architect for testimony availability"
    description = "Confirm architectural expert can testify next week on design copyright case"
    category = "communication"
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 3
  },
  @{
    title = "Review court documents for emergency hearing tomorrow"
    description = "Complete review of court file for emergency injunction hearing at 8:30 AM"
    category = "case_preparation"
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 8
  },
  @{
    title = "Follow up on medical expert engagement"
    description = "Contact physician expert regarding labor case health impact assessment schedule"
    category = "communication"
    status = "todo"
    priority = "urgent"
    due_date = Get-DueDate 6
  },
  
  # High priority - within 24 hours
  @{
    title = "Prepare client briefing memo for boundary case"
    description = "Draft detailed memo on survey hearing procedures and expected timeline"
    category = "case_preparation"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 12
  },
  @{
    title = "Research recent case law on tariff classifications"
    description = "Gather precedent cases on administrative law tariff determination disputes"
    category = "research"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 18
  },
  @{
    title = "Draft mediation proposal for family law case"
    description = "Prepare structured custody and support proposal for divorce mediation session"
    category = "case_preparation"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 15
  },
  @{
    title = "Organize financial documentation for real estate fraud case"
    description = "Compile purchase contracts, invoices, inspection reports for property defect claim"
    category = "document_organization"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 24
  },
  
  # High priority - within 48 hours
  @{
    title = "Prepare statement of claim for ICC arbitration"
    description = "Complete comprehensive statement of claim for international supplier contract dispute"
    category = "case_preparation"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 48
  },
  @{
    title = "Review expert engineer reports for construction variation case"
    description = "Analyze soil condition reports and engineer assessments for highway project variations"
    category = "case_preparation"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 42
  },
  @{
    title = "Schedule depositions with expert witnesses"
    description = "Coordinate testimony schedules with financial, medical, and technical experts for multiple cases"
    category = "communication"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 36
  },
  @{
    title = "Prepare questions for opposing counsel regarding software audit"
    description = "Draft discovery interrogatories on unlicensed software installations and licensing history"
    category = "case_preparation"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 48
  },
  
  # Medium priority - within 1 week
  @{
    title = "Research ICC arbitration procedures and evidence rules"
    description = "Study international arbitration best practices and ICC-specific procedural requirements"
    category = "research"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 72
  },
  @{
    title = "Draft response to cease and desist demand from opponent"
    description = "Prepare counter-argument response to opposing party's cease and desist letter"
    category = "case_preparation"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 84
  },
  @{
    title = "Compile client loss documentation for damages calculations"
    description = "Gather all evidence of financial losses, lost contracts, and business impact"
    category = "document_organization"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 96
  },
  @{
    title = "Prepare trademark application supporting documents"
    description = "Gather logo files, product samples, and classification lists for INNORPI filing"
    category = "document_organization"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 72
  },
  @{
    title = "Draft company formation bylaws and shareholder agreement"
    description = "Prepare legal documents for new e-commerce entity incorporation"
    category = "case_preparation"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 84
  },
  
  # Medium priority - within 2 weeks
  @{
    title = "Prepare witness examination plan for arbitration hearing"
    description = "Develop strategy and questions for supply chain manager and financial expert testimony"
    category = "case_preparation"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 144
  },
  @{
    title = "Research environmental law and ANPE compliance standards"
    description = "Study Tunisian environmental regulations applicable to solar facility operations"
    category = "research"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 120
  },
  @{
    title = "Prepare lease termination injunction brief"
    description = "Draft comprehensive brief on unlawful lease termination with case law support"
    category = "case_preparation"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 168
  },
  @{
    title = "Organize client files and create case summary index"
    description = "Consolidate all case documents and create quick reference index for all 15 dossiers"
    category = "document_organization"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 336
  },
  
  # Low priority - long term
  @{
    title = "Continue legal education - update on administrative law"
    description = "Complete CLE credits on recent administrative court precedent and tariff law"
    category = "professional_development"
    status = "todo"
    priority = "low"
    due_date = Get-DueDate 336
  },
  @{
    title = "Review and update office procedures and templates"
    description = "Update case management templates and procedures based on lessons learned"
    category = "administrative"
    status = "todo"
    priority = "low"
    due_date = Get-DueDate 336
  },
  @{
    title = "Schedule regular client update calls"
    description = "Prepare schedules for bi-weekly status calls with key clients"
    category = "communication"
    status = "scheduled"
    priority = "medium"
    due_date = Get-DueDate 168
  },
  @{
    title = "Prepare year-end case analysis and billing summary"
    description = "Compile case outcomes and financial summaries for annual review"
    category = "administrative"
    status = "todo"
    priority = "low"
    due_date = Get-DueDate 336
  },
  @{
    title = "Develop marketing materials on specialized case successes"
    description = "Create case studies on successful outcomes for firm website and publications"
    category = "professional_development"
    status = "todo"
    priority = "low"
    due_date = Get-DueDate 336
  },
  @{
    title = "Complete client intake interviews for new potential cases"
    description = "Schedule and conduct intake sessions for three promising new client leads"
    category = "business_development"
    status = "scheduled"
    priority = "medium"
    due_date = Get-DueDate 240
  },
  @{
    title = "Prepare discovery requests for copyright infringement case"
    description = "Draft formal discovery interrogatories on software licensing and installation records"
    category = "case_preparation"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 60
  },
  @{
    title = "Research Tunisian labor law on wrongful dismissal procedures"
    description = "Review latest amendments to labor code on termination and severance requirements"
    category = "research"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 96
  },
  @{
    title = "Coordinate expert witness scheduling across all cases"
    description = "Create master schedule coordinating all expert testimony dates and hearing preparation"
    category = "communication"
    status = "in_progress"
    priority = "high"
    due_date = Get-DueDate 72
  },
  @{
    title = "Prepare damages calculation framework for complex cases"
    description = "Develop standardized approach for calculating damages across multiple case types"
    category = "case_preparation"
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 120
  },
  @{
    title = "Draft settlement negotiation strategy for non-compete case"
    description = "Prepare range of acceptable settlement terms and negotiation talking points"
    category = "case_preparation"
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 84
  }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 33 Personal Tasks..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($task in $personalTasks) {
  try {
    $json = $task | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($task.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($task.title) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
