$baseUrl = "http://localhost:3000/api/sessions"

# Current date/time (January 8, 2026)
$now = Get-Date

# Helper function to calculate scheduled dates
function Get-ScheduledDate {
  param([int]$hoursFromNow, [int]$minutes = 0)
  return ($now.AddHours($hoursFromNow).AddMinutes($minutes)).ToUniversalTime().ToString("o")
}

# 44 hearing records data (without date calculations in array)
$hearingsData = @(
  @{ hours=72; mins=30; title="First Instance Hearing - Copyright Infringement"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room A3"; judge="Judge Hassan Medjahed"; desc="First hearing on design copyright infringement claim"; did=1; cid=$null },
  @{ hours=144; mins=15; title="Expert Report Discussion - Architectural Similarities"; type="expertise"; status="scheduled"; location="Commercial Court of Tunis"; room="Expert Office"; judge=$null; desc="Presentation of expert architect's report"; did=$null; cid=1 },
  @{ hours=216; mins=45; title="Damages Assessment Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room A3"; judge="Judge Hassan Medjahed"; desc="Hearing on damages calculation"; did=$null; cid=2 },
  @{ hours=36; mins=30; title="Emergency Injunction Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room A1"; judge="Judge Khalil Ben Farraj"; desc="Emergency hearing for unlawful lease termination"; did=$null; cid=3 },
  @{ hours=96; mins=0; title="Preliminary Evidence Review"; type="expertise"; status="scheduled"; location="Labor Court of Tunis"; room="Conference Room"; judge=$null; desc="Review of work accident evidence"; did=$null; cid=4 },
  @{ hours=240; mins=30; title="Survey Hearing - Boundary Determination"; type="hearing"; status="scheduled"; location="Administrative Court"; room="Room B2"; judge="Judge Youssef Amri"; desc="Hearing on land boundary"; did=5; cid=$null },
  @{ hours=8; mins=30; title="URGENT: Pre-Trial Conference"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Judges' Chamber"; judge="Judge Hassan Medjahed"; desc="Emergency pre-trial conference"; did=$null; cid=5 },
  @{ hours=96; mins=30; title="Mediation Session"; type="mediation"; status="scheduled"; location="Tunis Mediation Center"; room="Room 3"; judge=$null; desc="Mediation for settlement discussion"; did=$null; cid=6 },
  @{ hours=192; mins=15; title="Appeal Hearing"; type="hearing"; status="scheduled"; location="Court of Appeal - Tunis"; room="Room C4"; judge="Judge Leila Khmiri"; desc="Appeal hearing on first instance decision"; did=$null; cid=7 },
  @{ hours=120; mins=0; title="Expert Witness Consultation"; type="expertise"; status="scheduled"; location="Commercial Court of Tunis"; room="Expert Office"; judge=$null; desc="Meeting with financial expert"; did=2; cid=$null },
  @{ hours=168; mins=45; title="Environmental Compliance Hearing"; type="hearing"; status="scheduled"; location="Administrative Court"; room="Room B3"; judge="Judge Sami Bouazizi"; desc="Hearing on environmental compliance"; did=7; cid=$null },
  @{ hours=240; mins=30; title="Jurisdiction Challenge Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room A2"; judge="Judge Mohamed Ben Ali"; desc="Hearing on jurisdiction challenges"; did=4; cid=$null },
  @{ hours=48; mins=30; title="Criminal Investigation Hearing"; type="hearing"; status="scheduled"; location="Criminal Court of Tunis"; room="Room D1"; judge="Judge Fatima Gharbi"; desc="Preliminary investigation hearing"; did=8; cid=$null },
  @{ hours=120; mins=0; title="Civil Liability Expert Review"; type="expertise"; status="scheduled"; location="Commercial Court of Tunis"; room="Conference Room"; judge=$null; desc="Expert assessment of liability"; did=$null; cid=8 },
  @{ hours=192; mins=30; title="Construction Defect Inspection"; type="inspection"; status="scheduled"; location="Property Site"; room="On-site"; judge=$null; desc="Court-ordered inspection"; did=9; cid=$null },
  @{ hours=144; mins=0; title="Settlement Conference"; type="mediation"; status="scheduled"; location="Tunis Mediation Center"; room="Room 2"; judge=$null; desc="Settlement negotiations"; did=$null; cid=9 },
  @{ hours=168; mins=30; title="Witness Examination"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room A1"; judge="Judge Khalil Ben Farraj"; desc="Cross-examination of witnesses"; did=$null; cid=10 },
  @{ hours=216; mins=45; title="Technical Expert Testimony"; type="expertise"; status="scheduled"; location="Commercial Court of Tunis"; room="Room A3"; judge=$null; desc="Software engineer testimony"; did=$null; cid=11 },
  @{ hours=240; mins=0; title="Final Arguments Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room C1"; judge="Judge Hassan Medjahed"; desc="Final oral arguments"; did=$null; cid=12 },
  @{ hours=312; mins=30; title="Judgment Reading"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Main Hall"; judge="Judge Hassan Medjahed"; desc="Reading of court judgment"; did=$null; cid=13 },
  @{ hours=336; mins=0; title="Post-Judgment Review Conference"; type="consultation"; status="scheduled"; location="Law Office"; room="Conference Room"; judge=$null; desc="Discuss judgment and appeal options"; did=$null; cid=14 },
  @{ hours=60; mins=30; title="Injunction Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room B1"; judge="Judge Youssef Amri"; desc="Hearing for preliminary injunction"; did=$null; cid=15 },
  @{ hours=132; mins=0; title="Trademark Opposition Hearing"; type="hearing"; status="scheduled"; location="INNORPI Office"; room="Hearing Room A"; judge=$null; desc="Hearing on trademark opposition"; did=$null; cid=16 },
  @{ hours=216; mins=30; title="Non-Compete Agreement Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room B2"; judge="Judge Leila Khmiri"; desc="Hearing on non-compete enforceability"; did=$null; cid=17 },
  @{ hours=84; mins=45; title="Highway Project Variation Hearing"; type="hearing"; status="scheduled"; location="Administrative Court"; room="Room C2"; judge="Judge Sami Bouazizi"; desc="Hearing on variation claims"; did=$null; cid=18 },
  @{ hours=156; mins=0; title="Labor Dispute Mediation"; type="mediation"; status="scheduled"; location="Labor Mediation Service"; room="Room 4"; judge=$null; desc="Labor dispute mediation"; did=6; cid=$null },
  @{ hours=228; mins=30; title="Workplace Accident Liability Hearing"; type="hearing"; status="scheduled"; location="Labor Court of Tunis"; room="Room A2"; judge="Judge Karim Taha"; desc="Hearing on accident liability"; did=$null; cid=19 },
  @{ hours=48; mins=0; title="Emergency Expert Consultation"; type="consultation"; status="scheduled"; location="Expert Office"; room="Room 1"; judge=$null; desc="Urgent expert consultation"; did=$null; cid=20 },
  @{ hours=96; mins=30; title="Occupational Health Assessment"; type="expertise"; status="scheduled"; location="Medical Clinic"; room="Examination Room"; judge=$null; desc="Medical expert assessment"; did=$null; cid=21 },
  @{ hours=216; mins=0; title="Intellectual Property Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room A1"; judge="Judge Mohamed Ben Ali"; desc="Hearing on IP infringement"; did=$null; cid=22 },
  @{ hours=12; mins=0; title="URGENT: Pre-Hearing Preparation"; type="consultation"; status="scheduled"; location="Law Office"; room="Conference Room"; judge=$null; desc="Emergency preparation meeting"; did=$null; cid=23 },
  @{ hours=84; mins=30; title="Architectural Design Copyright Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room B3"; judge="Judge Fatima Gharbi"; desc="Hearing on design copyright"; did=$null; cid=24 },
  @{ hours=240; mins=30; title="International Arbitration Pre-Hearing"; type="consultation"; status="scheduled"; location="Arbitration Center"; room="Meeting Room 2"; judge=$null; desc="Preparation for arbitration"; did=$null; cid=25 },
  @{ hours=72; mins=0; title="Supplier Contract Dispute Hearing"; type="hearing"; status="scheduled"; location="ICC Arbitration Center"; room="Hearing Room B"; judge=$null; desc="First arbitration hearing"; did=$null; cid=26 },
  @{ hours=120; mins=30; title="Expert Report Review Session"; type="expertise"; status="scheduled"; location="Commercial Court of Tunis"; room="Conference Room"; judge=$null; desc="Review of expert reports"; did=$null; cid=27 },
  @{ hours=168; mins=0; title="Damages Calculation Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room C3"; judge="Judge Khalil Ben Farraj"; desc="Hearing on damages quantification"; did=$null; cid=28 },
  @{ hours=144; mins=30; title="Commercial Practice Expert Opinion"; type="expertise"; status="scheduled"; location="Commercial Court of Tunis"; room="Expert Office"; judge=$null; desc="Expert opinion on practices"; did=$null; cid=29 },
  @{ hours=216; mins=0; title="Final Commercial Dispute Hearing"; type="hearing"; status="scheduled"; location="Court of Appeal - Tunis"; room="Room A1"; judge="Judge Hassan Medjahed"; desc="Appeal on dispute"; did=$null; cid=30 },
  @{ hours=288; mins=30; title="Post-Judgment Consultation"; type="consultation"; status="scheduled"; location="Law Office"; room="Conference Room"; judge=$null; desc="Discuss judgment with client"; did=$null; cid=31 },
  @{ hours=72; mins=30; title="Real Estate Dispute Hearing"; type="hearing"; status="scheduled"; location="Commercial Court of Tunis"; room="Room B1"; judge="Judge Youssef Amri"; desc="Hearing on property defect"; did=3; cid=$null },
  @{ hours=144; mins=0; title="Property Valuation Expert Report"; type="expertise"; status="scheduled"; location="Property Site"; room="On-site"; judge=$null; desc="Property valuation presentation"; did=$null; cid=32 },
  @{ hours=228; mins=30; title="Family Law Settlement Conference"; type="mediation"; status="scheduled"; location="Family Law Mediation Center"; room="Private Room"; judge=$null; desc="Family law mediation"; did=$null; cid=33 },
  @{ hours=72; mins=0; title="Custody and Support Hearing"; type="hearing"; status="scheduled"; location="Family Court of Tunis"; room="Room D2"; judge="Judge Leila Khmiri"; desc="Hearing on custody and support"; did=$null; cid=34 }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 44 Hearings/Sessions..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($hearingData in $hearingsData) {
  try {
    $hearing = @{
      title = $hearingData.title
      session_type = $hearingData.type
      status = $hearingData.status
      scheduled_at = Get-ScheduledDate $hearingData.hours $hearingData.mins
      duration = "2 hours"
      location = $hearingData.location
      court_room = $hearingData.room
      judge = $hearingData.judge
      description = $hearingData.desc
      dossier_id = $hearingData.did
      case_id = $hearingData.cid
      participants = "Relevant parties"
    }
    
    $json = $hearing | ConvertTo-Json
    $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
    $successCount++
    Write-Host "✓ Added: $($hearingData.title)" -ForegroundColor Green
  }
  catch {
    $failureCount++
    Write-Host "✗ Failed: $($hearingData.title) - $($_.Exception.Message)" -ForegroundColor Red
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
