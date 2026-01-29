param(
    [int]$Count = 5,
    [int]$DaysInactive = 90,
    [string]$BaseUrl = "http://localhost:3000/api",
    [string]$DbPath = "backend/ordinay.db"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DbPath)) {
    throw "Database not found at path: $DbPath"
}

$createdIds = @()
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$joinDate = (Get-Date).AddDays(-($DaysInactive + 5)).ToString("yyyy-MM-dd")

Write-Host "Creating $Count client(s) via API..." -ForegroundColor Cyan

for ($i = 1; $i -le $Count; $i++) {
    $client = @{
        name = "Inactive Client $timestamp $i"
        email = "inactive+$timestamp+$i@example.com"
        phone = "+33 1 55 55 55 $i"
        address = "Test Address $i"
        status = "active"
        join_date = $joinDate
        notes = "Seeded for inactive-client notification test"
    }

    $response = Invoke-RestMethod -Uri "$BaseUrl/clients" -Method Post -ContentType "application/json" -Body ($client | ConvertTo-Json -Depth 4)
    if ($response.id) {
        $createdIds += $response.id
        Write-Host "✓ Added client ID $($response.id)" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to add client (no id returned)" -ForegroundColor Red
    }
}

if ($createdIds.Count -eq 0) {
    throw "No clients created; cannot continue."
}

$targetDate = (Get-Date).AddDays(-$DaysInactive).ToString("yyyy-MM-ddTHH:mm:ss")
$idsJson = $createdIds | ConvertTo-Json -Compress
$dbFullPath = (Resolve-Path $DbPath).Path

Write-Host "Backdating updated_at to $targetDate for created clients..." -ForegroundColor Cyan

Push-Location backend
try {
    $env:CLIENT_IDS = $idsJson
    $env:DB_PATH = $dbFullPath
    $env:TARGET_DATE = $targetDate

    @'
const Database = require("better-sqlite3");

const ids = JSON.parse(process.env.CLIENT_IDS || "[]");
const dbPath = process.env.DB_PATH || "ordinay.db";
const target = process.env.TARGET_DATE;

if (!ids.length) {
  console.log("No client IDs provided.");
  process.exit(0);
}

const db = new Database(dbPath);
const stmt = db.prepare("UPDATE clients SET updated_at = @target WHERE id = @id");
const run = db.transaction(() => {
  ids.forEach((id) => stmt.run({ id, target }));
});

run();

const placeholders = ids.map(() => "?").join(",");
const updated = db
  .prepare(`SELECT id, name, updated_at, status FROM clients WHERE id IN (${placeholders})`)
  .all(...ids);

console.log(JSON.stringify(updated, null, 2));
'@ | node
} finally {
    Pop-Location
    Remove-Item Env:CLIENT_IDS, Env:DB_PATH, Env:TARGET_DATE -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done. Reload the app or open Notification Center to see client inactivity notifications." -ForegroundColor Green
