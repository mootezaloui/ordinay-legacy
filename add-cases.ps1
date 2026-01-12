$baseUrl = "http://localhost:3000/api/cases"

$cases = @(
  # Dossier 1 - Cases (3 cases)
  @{
    case_number = "PRO-2026-001-A"
    dossier_id = 1
    title = "First Instance Hearing - Design Copyright Infringement"
    description = "First hearing before Commercial Court of Tunis. Preliminary arguments on design copyright protection and damages calculation. Expert report on architectural similarities to be presented."
    adversary = "Silva Architecture & Design"
    adversary_party = "Silva Architecture & Design"
    adversary_lawyer = "Maitre Hassan Belhaj"
    court = "Commercial Court of Tunis"
    filing_date = "2025-12-20"
    next_hearing = "2026-02-18T09:00:00Z"
    reference_number = "2025/1847/A"
    status = "in_progress"
    priority = "high"
    opened_at = "2025-12-20T10:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-001-B"
    dossier_id = 1
    title = "Expert Report Review - Architectural Similarities"
    description = "Review and discussion of expert engineer's report on design similarities. Technical analysis of alleged infringement details."
    adversary = "Silva Architecture & Design"
    adversary_party = "Silva Architecture & Design"
    adversary_lawyer = "Maitre Hassan Belhaj"
    court = "Commercial Court of Tunis"
    filing_date = "2026-01-15"
    next_hearing = "2026-03-10T14:00:00Z"
    reference_number = "2025/1847/B"
    status = "open"
    priority = "high"
    opened_at = "2026-01-15T11:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-001-C"
    dossier_id = 1
    title = "Damages Calculation - Final Assessment"
    description = "Final hearing on quantum of damages. Financial expert to present compensation calculations based on lost contracts and reputation damage."
    adversary = "Silva Architecture & Design"
    adversary_party = "Silva Architecture & Design"
    adversary_lawyer = "Maitre Hassan Belhaj"
    court = "Commercial Court of Tunis"
    filing_date = "2026-02-01"
    next_hearing = "2026-04-05T10:30:00Z"
    reference_number = "2025/1847/C"
    status = "open"
    priority = "medium"
    opened_at = "2026-02-01T09:00:00Z"
    closed_at = $null
  },
  
  # Dossier 2 - Cases (2 cases)
  @{
    case_number = "PRO-2026-002-A"
    dossier_id = 2
    title = "Civil Court - Property Survey Appointment"
    description = "Court hearing to appoint official surveyor for boundary determination. Both parties to present survey evidence and property deeds."
    adversary = "Hassan Makni"
    adversary_party = "Hassan Makni"
    adversary_lawyer = "Maitre Karim Zahra"
    court = "Civil Court of Ariana"
    filing_date = "2026-01-05"
    next_hearing = "2026-02-15T10:00:00Z"
    reference_number = "2025/1912/A"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-01-05T11:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-002-B"
    dossier_id = 2
    title = "Boundary Determination Hearing - Survey Results"
    description = "Hearing on official survey results determining actual property boundary. Expert surveyor testimony and measurement validation."
    adversary = "Hassan Makni"
    adversary_party = "Hassan Makni"
    adversary_lawyer = "Maitre Karim Zahra"
    court = "Civil Court of Ariana"
    filing_date = "2026-03-01"
    next_hearing = "2026-04-20T14:00:00Z"
    reference_number = "2025/1912/B"
    status = "open"
    priority = "high"
    opened_at = "2026-03-01T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 3 - Cases (3 cases)
  @{
    case_number = "PRO-2026-003-A"
    dossier_id = 3
    title = "Emergency: Preliminary Injunction Motion"
    description = "Urgent hearing for preliminary injunction to prevent former CTO from soliciting company clients and accessing trade secrets."
    adversary = "Abdelkader Ghazi"
    adversary_party = "Abdelkader Ghazi"
    adversary_lawyer = "Cabinet Ghazi & Associates"
    court = "Commercial Court of Tunis"
    filing_date = "2025-11-22"
    next_hearing = "2025-11-30T14:00:00Z"
    reference_number = "2025/2103/A"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-11-22T14:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-003-B"
    dossier_id = 3
    title = "Non-Compete Violation - Evidence Hearing"
    description = "Presentation of evidence of non-compete violations: client solicitation attempts, competitive activities, trade secret access."
    adversary = "Abdelkader Ghazi"
    adversary_party = "Abdelkader Ghazi"
    adversary_lawyer = "Cabinet Ghazi & Associates"
    court = "Commercial Court of Tunis"
    filing_date = "2025-12-10"
    next_hearing = "2026-01-20T10:00:00Z"
    reference_number = "2025/2103/B"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-12-10T10:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-003-C"
    dossier_id = 3
    title = "Damages and Injunction - Final Decision"
    description = "Final hearing on permanent injunction and damages. Assessment of financial impact from lost clients and competitive harm."
    adversary = "Abdelkader Ghazi"
    adversary_party = "Abdelkader Ghazi"
    adversary_lawyer = "Cabinet Ghazi & Associates"
    court = "Commercial Court of Tunis"
    filing_date = "2026-01-25"
    next_hearing = "2026-03-15T11:00:00Z"
    reference_number = "2025/2103/C"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-01-25T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 4 - Cases (2 cases)
  @{
    case_number = "PRO-2026-004-A"
    dossier_id = 4
    title = "Pre-litigation: Cease and Desist Notice"
    description = "Pre-court proceedings. Cease and desist letter sent with evidence of unauthorized software use. Awaiting response with 30-day deadline."
    adversary = "Digital Solutions Tunisie"
    adversary_party = "Digital Solutions Tunisie"
    adversary_lawyer = "Maitre Yassine Khodja"
    court = $null
    filing_date = $null
    next_hearing = "2026-02-28T17:00:00Z"
    reference_number = $null
    status = "open"
    priority = "high"
    opened_at = "2025-12-28T16:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-004-B"
    dossier_id = 4
    title = "Commercial Court - Copyright Infringement Claim"
    description = "Filing copyright infringement claim if cease and desist ignored. Audit documentation showing 45 unlicensed installations worth 45,000 TND."
    adversary = "Digital Solutions Tunisie"
    adversary_party = "Digital Solutions Tunisie"
    adversary_lawyer = "Maitre Yassine Khodja"
    court = "Commercial Court of Tunis"
    filing_date = "2026-03-01"
    next_hearing = "2026-04-15T10:00:00Z"
    reference_number = "2026/XXXX/A"
    status = "open"
    priority = "medium"
    opened_at = "2026-03-01T09:00:00Z"
    closed_at = $null
  },
  
  # Dossier 5 - Cases (3 cases)
  @{
    case_number = "PRO-2026-005-A"
    dossier_id = 5
    title = "Family Court - Divorce Petition Filing"
    description = "Initial filing of divorce petition. Mediation attempt required before trial. Custody arrangement discussion scheduled."
    adversary = "Mehdi Mansour"
    adversary_party = "Mehdi Mansour"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    court = "Family Court of Sfax"
    filing_date = "2025-11-08"
    next_hearing = "2026-01-20T10:00:00Z"
    reference_number = "FA/2025/1645/A"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-11-08T09:30:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-005-B"
    dossier_id = 5
    title = "Mediation Session - Custody and Support"
    description = "Court-ordered mediation session. Discussion of custody arrangement for two children (ages 7 and 10), alimony, and property division."
    adversary = "Mehdi Mansour"
    adversary_party = "Mehdi Mansour"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    court = "Family Court of Sfax"
    filing_date = "2026-01-10"
    next_hearing = "2026-02-15T14:00:00Z"
    reference_number = "FA/2025/1645/B"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2026-01-10T10:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-005-C"
    dossier_id = 5
    title = "Child Custody Determination Hearing"
    description = "Court-appointed child psychologist presents assessment. Final hearing on custody determination and alimony arrangements (1,500 TND/month)."
    adversary = "Mehdi Mansour"
    adversary_party = "Mehdi Mansour"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    court = "Family Court of Sfax"
    filing_date = "2026-02-05"
    next_hearing = "2026-03-20T09:00:00Z"
    reference_number = "FA/2025/1645/C"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-02-05T11:00:00Z"
    closed_at = $null
  },
  
  # Dossier 6 - Cases (2 cases)
  @{
    case_number = "PRO-2026-006-A"
    dossier_id = 6
    title = "Administrative Tribunal - Tariff Classification Appeal"
    description = "Appeal against Customs Authority tariff classification decision. Expert economist engaged to prove misclassification of imported textiles."
    adversary = "Tunisian Customs Authority"
    adversary_party = "Tunisian Customs Authority"
    adversary_lawyer = "Cabinet Ministériel des Douanes"
    court = "Administrative Tribunal of Tunis"
    filing_date = "2025-11-02"
    next_hearing = "2026-02-20T11:00:00Z"
    reference_number = "ADM/2025/2201/A"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-11-02T13:45:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-006-B"
    dossier_id = 6
    title = "Customs Review - Expert Evidence Hearing"
    description = "Presentation of economic expert report on comparable products and proper tariff classification. Technical analysis of tariff codes."
    adversary = "Tunisian Customs Authority"
    adversary_party = "Tunisian Customs Authority"
    adversary_lawyer = "Cabinet Ministériel des Douanes"
    court = "Administrative Tribunal of Tunis"
    filing_date = "2026-02-01"
    next_hearing = "2026-03-25T14:00:00Z"
    reference_number = "ADM/2025/2201/B"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-02-01T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 7 - Cases (2 cases)
  @{
    case_number = "PRO-2026-007-A"
    dossier_id = 7
    title = "ICC Arbitration - Initial Hearing"
    description = "International commercial arbitration under ICC rules. Arbitration seat: Paris. Initial hearing on supplier contract breach and damages."
    adversary = "Eurotech Manufacturing S.p.A."
    adversary_party = "Eurotech Manufacturing S.p.A."
    adversary_lawyer = "Studio Legale Romano"
    court = "ICC International Arbitration Court"
    filing_date = "2025-12-12"
    next_hearing = "2026-04-15T09:00:00Z"
    reference_number = "ARB/25/2089/A"
    status = "open"
    priority = "high"
    opened_at = "2025-12-12T15:30:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-007-B"
    dossier_id = 7
    title = "Arbitration - Evidence and Witness Hearing"
    description = "Presentation of evidence on delayed shipment and production losses. Witness testimony from supply chain manager and financial expert."
    adversary = "Eurotech Manufacturing S.p.A."
    adversary_party = "Eurotech Manufacturing S.p.A."
    adversary_lawyer = "Studio Legale Romano"
    court = "ICC International Arbitration Court"
    filing_date = "2026-02-15"
    next_hearing = "2026-05-20T10:00:00Z"
    reference_number = "ARB/25/2089/B"
    status = "open"
    priority = "high"
    opened_at = "2026-02-15T11:00:00Z"
    closed_at = $null
  },
  
  # Dossier 8 - Cases (3 cases)
  @{
    case_number = "PRO-2026-008-A"
    dossier_id = 8
    title = "Civil Court - Fraud Rescission Claim"
    description = "Action for contract rescission based on fraudulent concealment of structural defects. Building expert engaged for damage assessment."
    adversary = "Nabil Hamza"
    adversary_party = "Nabil Hamza"
    adversary_lawyer = "Maitre Dina El-Ouaer"
    court = "Civil Court of Sfax"
    filing_date = "2025-12-05"
    next_hearing = "2026-01-30T14:00:00Z"
    reference_number = "2025/1756/A"
    status = "in_progress"
    priority = "high"
    opened_at = "2025-12-05T10:30:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-008-B"
    dossier_id = 8
    title = "Structural Assessment Report Hearing"
    description = "Presentation of building expert's report. Damage assessment estimating repair costs at 180,000 TND. Discussion of hidden defects found."
    adversary = "Nabil Hamza"
    adversary_party = "Nabil Hamza"
    adversary_lawyer = "Maitre Dina El-Ouaer"
    court = "Civil Court of Sfax"
    filing_date = "2026-02-01"
    next_hearing = "2026-03-15T11:00:00Z"
    reference_number = "2025/1756/B"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-02-01T10:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-008-C"
    dossier_id = 8
    title = "Fraud and Damages - Final Judgment"
    description = "Final hearing on contract rescission and restitution of purchase price (350,000 TND) plus repair costs. Assessment of seller's liability."
    adversary = "Nabil Hamza"
    adversary_party = "Nabil Hamza"
    adversary_lawyer = "Maitre Dina El-Ouaer"
    court = "Civil Court of Sfax"
    filing_date = "2026-03-10"
    next_hearing = "2026-04-25T13:00:00Z"
    reference_number = "2025/1756/C"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-03-10T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 9 - Cases (2 cases)
  @{
    case_number = "PRO-2026-009-A"
    dossier_id = 9
    title = "Labor Court - Wrongful Dismissal Filing"
    description = "Labor court proceedings for wrongful termination after 8 years as senior physician. Hospital violated mandatory layoff procedures."
    adversary = "Hospital Anis Ibn Sina"
    adversary_party = "Hospital Anis Ibn Sina"
    adversary_lawyer = "Cabinet RH Juridique Tunisie"
    court = "Labor Court of Tunis"
    filing_date = "2025-12-08"
    next_hearing = "2026-02-10T15:00:00Z"
    reference_number = "LD/2025/1823/A"
    status = "in_progress"
    priority = "high"
    opened_at = "2025-12-08T11:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-009-B"
    dossier_id = 9
    title = "Medical Expert Evidence - Health Impact"
    description = "Medical expert testimony on stress-related health impacts from wrongful dismissal. Documentation of professional reputation damage."
    adversary = "Hospital Anis Ibn Sina"
    adversary_party = "Hospital Anis Ibn Sina"
    adversary_lawyer = "Cabinet RH Juridique Tunisie"
    court = "Labor Court of Tunis"
    filing_date = "2026-02-15"
    next_hearing = "2026-03-20T10:30:00Z"
    reference_number = "LD/2025/1823/B"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-02-15T11:00:00Z"
    closed_at = $null
  },
  
  # Dossier 10 - Cases (2 cases)
  @{
    case_number = "PRO-2026-010-A"
    dossier_id = 10
    title = "ANPE Administrative Compliance Review"
    description = "Administrative proceeding before ANPE for environmental audit findings on solar facility. Response to potential compliance violations."
    adversary = "ANPE Tunisia"
    adversary_party = "ANPE Tunisia"
    adversary_lawyer = "Cabinet Juridique de l'ANPE"
    court = "ANPE Administrative Office"
    filing_date = "2026-01-07"
    next_hearing = "2026-02-20T10:00:00Z"
    reference_number = "ENV/2025/2165/A"
    status = "open"
    priority = "medium"
    opened_at = "2026-01-07T09:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-010-B"
    dossier_id = 10
    title = "Environmental Compliance Documentation Review"
    description = "Review of facility compliance documentation. Discussion of emissions monitoring and corrective actions if violations found."
    adversary = "ANPE Tunisia"
    adversary_party = "ANPE Tunisia"
    adversary_lawyer = "Cabinet Juridique de l'ANPE"
    court = "ANPE Administrative Office"
    filing_date = "2026-02-10"
    next_hearing = "2026-03-25T14:00:00Z"
    reference_number = "ENV/2025/2165/B"
    status = "open"
    priority = "medium"
    opened_at = "2026-02-10T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 11 - Cases (3 cases)
  @{
    case_number = "PRO-2026-011-A"
    dossier_id = 11
    title = "Preliminary Injunction - Lease Termination"
    description = "Seeking preliminary injunction against unlawful lease termination. Client invested 2M TND in solar infrastructure on property."
    adversary = "Habib Loubbi Estate"
    adversary_party = "Habib Loubbi Estate"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    court = "Civil Court of Ariana"
    filing_date = "2025-11-28"
    next_hearing = "2026-01-10T13:00:00Z"
    reference_number = "2025/2145/A"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-11-28T14:30:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-011-B"
    dossier_id = 11
    title = "Economic Damages Assessment"
    description = "Economic expert analysis of financial losses from early lease termination. Investment recovery and lost revenue calculations."
    adversary = "Habib Loubbi Estate"
    adversary_party = "Habib Loubbi Estate"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    court = "Civil Court of Ariana"
    filing_date = "2026-01-20"
    next_hearing = "2026-02-25T11:00:00Z"
    reference_number = "2025/2145/B"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-01-20T10:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-011-C"
    dossier_id = 11
    title = "Lease Contract Enforcement - Final Injunction"
    description = "Final hearing on permanent injunction enforcing lease contract terms. Decision on damages and specific performance."
    adversary = "Habib Loubbi Estate"
    adversary_party = "Habib Loubbi Estate"
    adversary_lawyer = "Maitre Rashid Al-Mansouri"
    court = "Civil Court of Ariana"
    filing_date = "2026-03-01"
    next_hearing = "2026-04-10T14:00:00Z"
    reference_number = "2025/2145/C"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-03-01T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 12 - Cases (2 cases)
  @{
    case_number = "PRO-2026-012-A"
    dossier_id = 12
    title = "Trademark Registration - AmriShop Application"
    description = "Trademark application filing before INNORPI. Protection for brand name and logo. Searching for conflicting marks."
    adversary = $null
    adversary_party = $null
    adversary_lawyer = $null
    court = "INNORPI - Tunis"
    filing_date = "2026-01-09"
    next_hearing = "2026-02-15T10:00:00Z"
    reference_number = "TM/2026/0245/A"
    status = "open"
    priority = "medium"
    opened_at = "2026-01-09T10:00:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-012-B"
    dossier_id = 12
    title = "Company Registration & Legal Structure"
    description = "Formation of e-commerce company. Legal documentation, articles of association, privacy policy, and terms & conditions preparation."
    adversary = $null
    adversary_party = $null
    adversary_lawyer = $null
    court = "INNORPI - Tunis"
    filing_date = "2026-01-15"
    next_hearing = "2026-02-28T15:00:00Z"
    reference_number = "TM/2026/0245/B"
    status = "open"
    priority = "medium"
    opened_at = "2026-01-15T11:00:00Z"
    closed_at = $null
  },
  
  # Dossier 13 - Cases (2 cases)
  @{
    case_number = "PRO-2026-013-A"
    dossier_id = 13
    title = "Administrative Court - Variation Order Appeal"
    description = "Administrative action against Ministry of Public Works for refusing legitimate variation orders on 20M TND highway project."
    adversary = "Ministry of Public Works"
    adversary_party = "Ministry of Public Works"
    adversary_lawyer = "Cabinet Juridique Ministériel"
    court = "Administrative Court of Tunis"
    filing_date = "2025-10-18"
    next_hearing = "2026-03-15T10:30:00Z"
    reference_number = "ADM/2025/1934/A"
    status = "in_progress"
    priority = "urgent"
    opened_at = "2025-10-18T08:30:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-013-B"
    dossier_id = 13
    title = "Expert Engineering Analysis - Variation Necessity"
    description = "Expert engineer testimony on technical necessity of variation orders. Documentation of soil conditions requiring changes."
    adversary = "Ministry of Public Works"
    adversary_party = "Ministry of Public Works"
    adversary_lawyer = "Cabinet Juridique Ministériel"
    court = "Administrative Court of Tunis"
    filing_date = "2026-02-10"
    next_hearing = "2026-04-10T14:00:00Z"
    reference_number = "ADM/2025/1934/B"
    status = "in_progress"
    priority = "high"
    opened_at = "2026-02-10T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 14 - Cases (2 cases)
  @{
    case_number = "PRO-2026-014-A"
    dossier_id = 14
    title = "Commercial Court - Mechanic's Lien Filing"
    description = "Subcontractors exercising mechanic's lien for unpaid invoices (850K TND). Steel and concrete work on commercial complex."
    adversary = "Nabeul Commercial Properties Ltd"
    adversary_party = "Nabeul Commercial Properties Ltd"
    adversary_lawyer = "Maitre Karim Zahra"
    court = "Commercial Court of Nabeul"
    filing_date = "2025-12-23"
    next_hearing = "2026-02-10T11:00:00Z"
    reference_number = "2025/2044/A"
    status = "open"
    priority = "high"
    opened_at = "2025-12-23T14:15:00Z"
    closed_at = $null
  },
  @{
    case_number = "PRO-2026-014-B"
    dossier_id = 14
    title = "Quality Audit & Dispute Resolution"
    description = "Independent quality auditor validates work completion standards. Project owner contesting quality claims. Settlement negotiations."
    adversary = "Nabeul Commercial Properties Ltd"
    adversary_party = "Nabeul Commercial Properties Ltd"
    adversary_lawyer = "Maitre Karim Zahra"
    court = "Commercial Court of Nabeul"
    filing_date = "2026-01-15"
    next_hearing = "2026-03-05T13:00:00Z"
    reference_number = "2025/2044/B"
    status = "open"
    priority = "high"
    opened_at = "2026-01-15T10:00:00Z"
    closed_at = $null
  },
  
  # Dossier 15 - Cases (1 case - already closed)
  @{
    case_number = "PRO-2024-015-A"
    dossier_id = 15
    title = "Civil Court - Defamation Judgment (CLOSED)"
    description = "Defamation case successfully resolved. Court ordered newspaper to publish retraction and apology. Case settled favorably."
    adversary = "Tunis Daily Newspaper"
    adversary_party = "Tunis Daily Newspaper"
    adversary_lawyer = "Maitre Tariq Ibn Salem"
    court = "Civil Court of Tunis"
    filing_date = "2024-07-12"
    next_hearing = $null
    reference_number = "2024/1523/A"
    status = "closed"
    priority = "medium"
    opened_at = "2024-07-12T10:00:00Z"
    closed_at = "2025-10-22T16:30:00Z"
  }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 38 Cases (2-3 per dossier)..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($case in $cases) {
  try {
    $json = $case | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($case.case_number) - $($case.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($case.case_number) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
