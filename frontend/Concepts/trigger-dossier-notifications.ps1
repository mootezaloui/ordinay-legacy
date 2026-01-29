param(
    [string]$BaseUrl = "http://localhost:3000/api",
    [string]$DbPath = "backend/ordinay.db",
    [int]$DaysInactive = 20,
    [int]$DaysReview = 7,
    [ValidateSet("High", "Medium", "Low")]
    [string]$ReviewPriority = "High",
    [int]$CountPerType = 5
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DbPath)) {
    throw "Database not found at path: $DbPath"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "Creating a seed client..." -ForegroundColor Cyan
$clientPayload = @{
    name = "Dossier Notif Client $timestamp"
    email = "dossier-notif+$timestamp@example.com"
    status = "active"
}
$client = Invoke-RestMethod -Uri "$BaseUrl/clients" -Method Post -ContentType "application/json" -Body ($clientPayload | ConvertTo-Json -Depth 4)
if (-not $client.id) {
    throw "Client creation failed."
}

$dossierTypes = @(
    @{ type = "inactivity"; baseTitle = "Dossier Inactivity $timestamp"; priority = "low"; daysBack = $DaysInactive },
    @{ type = "review"; baseTitle = "Dossier Review $timestamp"; priority = $ReviewPriority; daysBack = $DaysReview }
)

$created = @()

Write-Host "Creating dossiers..." -ForegroundColor Cyan
foreach ($entry in $dossierTypes) {
    for ($i = 1; $i -le $CountPerType; $i++) {
        $variantIndex = ($i - 1) % 5
        $payload = @{
            title = "$($entry.baseTitle) #$i"
            client_id = $client.id
            status = "open"
            priority = $entry.priority
            description = "Seeded for dossier notification test; variantIndex=$variantIndex"
        }
        $dossier = Invoke-RestMethod -Uri "$BaseUrl/dossiers" -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 4)
        if ($dossier.id) {
            $created += @{
                id = $dossier.id
                type = $entry.type
                priority = $entry.priority
                daysBack = $entry.daysBack
            }
            Write-Host "✓ Added dossier ID $($dossier.id) ($($entry.type) #$i)" -ForegroundColor Green
        } else {
            Write-Host "✗ Failed to add dossier ($($entry.type) #$i)" -ForegroundColor Red
        }
    }
}

if ($created.Count -eq 0) {
    throw "No dossiers created; cannot continue."
}

$now = Get-Date

$updates = @()
foreach ($item in $created) {
    $updatedAt = $now.AddDays(-$item.daysBack)

    $updates += @{
        id = $item.id
        updated_at = $updatedAt.ToString("yyyy-MM-ddTHH:mm:ss")
    }
}

$updatesJson = $updates | ConvertTo-Json -Compress
$dbFullPath = (Resolve-Path $DbPath).Path

Write-Host "Applying dossier updates (updated_at)..." -ForegroundColor Cyan
Push-Location backend
try {
    $env:DOSSIER_UPDATES = $updatesJson
    $env:DB_PATH = $dbFullPath

    @'
const Database = require("better-sqlite3");

const updates = JSON.parse(process.env.DOSSIER_UPDATES || "[]");
const dbPath = process.env.DB_PATH || "ordinay.db";

if (!updates.length) {
  console.log("No dossier updates provided.");
  process.exit(0);
}

const db = new Database(dbPath);
const stmt = db.prepare(
  "UPDATE dossiers SET next_deadline = NULL, updated_at = @updated_at WHERE id = @id"
);

const run = db.transaction(() => {
  updates.forEach((u) => {
    stmt.run({
      id: u.id,
      updated_at: u.updated_at,
    });
  });
});

run();

const ids = updates.map((u) => u.id);
const placeholders = ids.map(() => "?").join(",");
const rows = db
  .prepare(`SELECT id, reference, next_deadline, updated_at, status, priority FROM dossiers WHERE id IN (${placeholders})`)
  .all(...ids);

console.log(JSON.stringify(rows, null, 2));
'@ | node
} finally {
    Pop-Location
    Remove-Item Env:DOSSIER_UPDATES, Env:DB_PATH -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done. Reload the app and open Notification Center to see dossier notifications." -ForegroundColor Green
