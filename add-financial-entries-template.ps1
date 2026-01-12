$baseUrl = "http://localhost:3000/api/tasks"

# Current date/time (January 8, 2026)
$now = Get-Date

# Helper function to calculate due dates
function Get-DueDate {
  param([int]$hoursFromNow)
  return ($now.AddHours($hoursFromNow)).ToUniversalTime().ToString("o")
}

# 45 tasks distributed across 15 dossiers (3 per dossier, some linked to cases)
$tasks = @(
  # Dossier 1 - Intellectual Property (3 tasks)
  @{
    title = "Review architectural design documentation"
    description = "Collect and organize all architectural plans, drawings, and technical specifications for expert analysis"
    dossier_id = 1
    case_id = $null
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 3
    assigned_to = $null
  },
  @{
    title = "Prepare expert witness report outline"
    description = "Draft structure for architectural similarity expert report with key comparison points and findings"
    dossier_id = $null
    case_id = 1
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 24
    assigned_to = $null
  },
  @{
    title = "Gather financial loss documentation"
    description = "Compile all invoices, contracts, and correspondence showing lost business opportunities and financial damages"
    dossier_id = $null
    case_id = 2
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 48
    assigned_to = $null
  },
  
  # Dossier 2 - Real Estate (3 tasks)
  @{
    title = "Request property survey from court-appointed surveyor"
    description = "Follow up with Civil Court of Ariana to obtain status and timeline for official property boundary survey"
    dossier_id = $null
    case_id = 3
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 2
    assigned_to = $null
  },
  @{
    title = "Review and compare boundary deeds"
    description = "Analyze all historical property deeds and boundary documents to identify discrepancies with current survey"
    dossier_id = 2
    case_id = $null
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 72
    assigned_to = $null
  },
  @{
    title = "Prepare boundary dispute evidence presentation"
    description = "Organize evidence for court hearing including maps, historical documents, and expert testimony"
    dossier_id = $null
    case_id = 4
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 120
    assigned_to = $null
  },
  
  # Dossier 3 - Non-Compete Violation (3 tasks)
  @{
    title = "URGENT: File preliminary injunction motion"
    description = "Immediately file motion for emergency preliminary injunction to prevent client solicitation and trade secret access"
    dossier_id = $null
    case_id = 5
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 2
    assigned_to = $null
  },
  @{
    title = "Document client solicitation attempts"
    description = "Compile evidence of former CTO's attempts to contact and solicit company clients including emails, calls, meeting notes"
    dossier_id = $null
    case_id = 5
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 6
    assigned_to = $null
  },
  @{
    title = "Serve cease and desist letter"
    description = "Prepare and serve formal cease and desist letter with evidence of trade secret violations and competitive activities"
    dossier_id = $null
    case_id = 6
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 12
    assigned_to = $null
  },
  
  # Dossier 4 - Intellectual Property (3 tasks)
  @{
    title = "Conduct software audit for unlicensed installations"
    description = "Perform comprehensive IT audit to identify and document all unlicensed software installations with serial numbers and locations"
    dossier_id = $null
    case_id = 7
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 5
    assigned_to = $null
  },
  @{
    title = "Send cease and desist notice"
    description = "Draft and send formal cease and desist letter with audit results and 30-day deadline for response"
    dossier_id = 4
    case_id = $null
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 8
    assigned_to = $null
  },
  @{
    title = "Prepare copyright infringement court filing"
    description = "Draft complaint for copyright infringement action with audit documentation and damages calculation (45,000 TND)"
    dossier_id = $null
    case_id = 8
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 144
    assigned_to = $null
  },
  
  # Dossier 5 - Family Law (3 tasks)
  @{
    title = "Prepare custody arrangement proposal"
    description = "Develop detailed custody proposal including schedule, holiday arrangements, and decision-making authority"
    dossier_id = $null
    case_id = 9
    status = "todo"
    priority = "urgent"
    due_date = Get-DueDate 4
    assigned_to = $null
  },
  @{
    title = "Gather financial documentation for alimony"
    description = "Collect income statements, tax returns, bank statements, and asset documentation for alimony/support calculation"
    dossier_id = $null
    case_id = 9
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 36
    assigned_to = $null
  },
  @{
    title = "Prepare mediation strategy and talking points"
    description = "Develop strategy for court-ordered mediation session including priority issues and acceptable compromises"
    dossier_id = $null
    case_id = 10
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 96
    assigned_to = $null
  },
  
  # Dossier 6 - Administrative Law (3 tasks)
  @{
    title = "Hire tariff classification expert"
    description = "Identify and engage expert economist to review tariff classification and provide technical opinion on misclassification"
    dossier_id = $null
    case_id = 11
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 7
    assigned_to = $null
  },
  @{
    title = "Prepare comparison tariff analysis"
    description = "Analyze comparable products with similar specifications and their tariff classifications to support misclassification argument"
    dossier_id = $null
    case_id = 11
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 72
    assigned_to = $null
  },
  @{
    title = "Submit written response to Customs Authority"
    description = "Prepare formal written response to Customs Authority with documentation and expert analysis challenging tariff decision"
    dossier_id = $null
    case_id = 12
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 120
    assigned_to = $null
  },
  
  # Dossier 7 - International Arbitration (3 tasks)
  @{
    title = "Prepare statement of claim for ICC arbitration"
    description = "Draft comprehensive claim statement detailing supplier contract breach, delayed shipments, and production losses with damages"
    dossier_id = $null
    case_id = 13
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 96
    assigned_to = $null
  },
  @{
    title = "Gather evidence of production losses"
    description = "Collect documentation of supply delays impact: production records, lost orders, customer complaints, financial losses"
    dossier_id = $null
    case_id = 13
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 84
    assigned_to = $null
  },
  @{
    title = "Coordinate with witness experts"
    description = "Contact supply chain manager and financial expert to confirm availability and prepare for ICC arbitration hearing"
    dossier_id = $null
    case_id = 14
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 168
    assigned_to = $null
  },
  
  # Dossier 8 - Real Estate Fraud (3 tasks)
  @{
    title = "Hire structural engineering expert"
    description = "Engage independent building expert to inspect property and prepare damage assessment report on structural defects"
    dossier_id = $null
    case_id = 15
    status = "in_progress"
    priority = "high"
    due_date = Get-DueDate 10
    assigned_to = $null
  },
  @{
    title = "Document all property defects discovered"
    description = "Compile photographic evidence, inspection records, and written descriptions of all structural and mechanical defects"
    dossier_id = $null
    case_id = 15
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 48
    assigned_to = $null
  },
  @{
    title = "Prepare fraud and damages complaint"
    description = "Draft civil complaint for contract rescission and fraud with expert report findings and damages calculation (180,000 TND repairs)"
    dossier_id = $null
    case_id = 16
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 120
    assigned_to = $null
  },
  
  # Dossier 9 - Labor Law (3 tasks)
  @{
    title = "Gather wrongful dismissal documentation"
    description = "Collect employment contract, performance reviews, medical records, and all correspondence related to dismissal"
    dossier_id = $null
    case_id = 17
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 24
    assigned_to = $null
  },
  @{
    title = "Engage medical expert for health impact assessment"
    description = "Retain physician expert to evaluate stress-related health impacts from wrongful dismissal and prepare expert testimony"
    dossier_id = $null
    case_id = 17
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 60
    assigned_to = $null
  },
  @{
    title = "Prepare labor court complaint and damages claim"
    description = "Draft complaint for wrongful termination with medical expert findings and claim for 18 months severance (approximately 135,000 TND)"
    dossier_id = $null
    case_id = 18
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 96
    assigned_to = $null
  },
  
  # Dossier 10 - Environmental Law (3 tasks)
  @{
    title = "Respond to ANPE compliance investigation"
    description = "Prepare written response to ANPE administrative investigation addressing all audit findings and compliance violations alleged"
    dossier_id = $null
    case_id = 19
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 14
    assigned_to = $null
  },
  @{
    title = "Submit emissions monitoring documentation"
    description = "Gather all facility emissions reports, monitoring records, and compliance certificates for solar facility operations"
    dossier_id = $null
    case_id = 19
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 18
    assigned_to = $null
  },
  @{
    title = "Prepare compliance correction action plan"
    description = "If violations found, develop detailed plan for corrective actions with timeline and responsible parties"
    dossier_id = $null
    case_id = 20
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 168
    assigned_to = $null
  },
  
  # Dossier 11 - Real Estate/Commercial (3 tasks)
  @{
    title = "URGENT: File preliminary injunction application"
    description = "Immediately file motion for preliminary injunction against unlawful lease termination with supporting evidence of investment"
    dossier_id = $null
    case_id = 21
    status = "in_progress"
    priority = "urgent"
    due_date = Get-DueDate 4
    assigned_to = $null
  },
  @{
    title = "Engage economic expert for damages calculation"
    description = "Retain economist to calculate financial losses from early lease termination including investment recovery and lost revenue"
    dossier_id = $null
    case_id = 21
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 48
    assigned_to = $null
  },
  @{
    title = "Prepare lease enforcement and injunction brief"
    description = "Draft legal brief arguing for permanent injunction enforcing lease terms with economic analysis and case law support"
    dossier_id = $null
    case_id = 22
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 144
    assigned_to = $null
  },
  
  # Dossier 12 - Corporate/IP (3 tasks)
  @{
    title = "Prepare trademark application for INNORPI"
    description = "Prepare and file trademark application for AmriShop brand with logo, specifications, and goods/services classification"
    dossier_id = $null
    case_id = 23
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 36
    assigned_to = $null
  },
  @{
    title = "Draft company formation documents"
    description = "Prepare articles of association, bylaws, shareholder agreements, and privacy policy for e-commerce company formation"
    dossier_id = $null
    case_id = 24
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 48
    assigned_to = $null
  },
  @{
    title = "Register company with relevant authorities"
    description = "File company registration documents with Commercial Registry and obtain legal entity status confirmation"
    dossier_id = $null
    case_id = 24
    status = "todo"
    priority = "medium"
    due_date = Get-DueDate 72
    assigned_to = $null
  },
  
  # Dossier 13 - Administrative/Construction (3 tasks)
  @{
    title = "Hire construction expert engineer"
    description = "Engage expert engineer familiar with highway projects to review variation orders and validate technical necessity"
    dossier_id = $null
    case_id = 25
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 20
    assigned_to = $null
  },
  @{
    title = "Compile soil and site condition documentation"
    description = "Gather geological reports, site surveys, photographic evidence, and engineering assessments showing unexpected conditions"
    dossier_id = $null
    case_id = 25
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 60
    assigned_to = $null
  },
  @{
    title = "Prepare administrative court petition"
    description = "Draft petition for administrative court challenging Ministry rejection of variation orders with expert engineering report and cost analysis"
    dossier_id = $null
    case_id = 26
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 120
    assigned_to = $null
  },
  
  # Dossier 14 - Construction/Commercial (3 tasks)
  @{
    title = "Engage independent quality auditor"
    description = "Hire independent auditor to conduct quality assessment of steel and concrete work on commercial complex"
    dossier_id = $null
    case_id = 27
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 12
    assigned_to = $null
  },
  @{
    title = "Compile unpaid invoices and payment documentation"
    description = "Organize all invoices, receipts, time records, and correspondence showing 850,000 TND in unpaid subcontractor work"
    dossier_id = $null
    case_id = 27
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 24
    assigned_to = $null
  },
  @{
    title = "File mechanic's lien notice with court"
    description = "Prepare and file formal mechanic's lien notice with Commercial Court of Nabeul securing subcontractor rights"
    dossier_id = $null
    case_id = 28
    status = "todo"
    priority = "high"
    due_date = Get-DueDate 36
    assigned_to = $null
  },
  
  # Dossier 15 - Media/Defamation (1 task - closed dossier)
  @{
    title = "Monitor publication of retraction and apology"
    description = "Verify that newspaper published full retraction and apology with same prominence as original defamatory article - CLOSED"
    dossier_id = 15
    case_id = $null
    status = "done"
    priority = "medium"
    due_date = Get-DueDate -48
    assigned_to = $null
  }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 43 Tasks (2-3 per dossier/case)..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($task in $tasks) {
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
