# PowerShell script to delete all financial entries by fetching and deleting each by ID
# Adjust the $baseUrl if your backend runs on a different host/port

$baseUrl = "http://localhost:3000/api/financial"  # Update if needed

try {
    # Fetch all financial entries
    $entries = Invoke-RestMethod -Uri $baseUrl -Method Get
    if (-not $entries -or $entries.Count -eq 0) {
        Write-Host "No financial entries found."
        return
    }

    $deleted = 0
    foreach ($entry in $entries) {
        $id = $entry.id
        if ($id) {
            try {
                # You can add -Body @{reason="Bulk delete"; forceHardDelete=$true} if needed
                Invoke-RestMethod -Uri "$baseUrl/$id" -Method Delete
                Write-Host "Deleted financial entry with ID: $id"
                $deleted++
            } catch {
                Write-Warning "Failed to delete financial entry with ID: $id ($_)."
            }
        }
    }
    Write-Host "Deleted $deleted financial entries."
} catch {
    Write-Error "Failed to delete financial entries: $_"
}
