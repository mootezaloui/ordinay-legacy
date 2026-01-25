# PowerShell script to delete all dossiers by fetching and deleting each by ID
# Adjust the $baseUrl if your backend runs on a different host/port

$baseUrl = "http://localhost:3000/api/dossiers"  # Update if needed

try {
    # Fetch all dossiers
    $dossiers = Invoke-RestMethod -Uri $baseUrl -Method Get
    if (-not $dossiers -or $dossiers.Count -eq 0) {
        Write-Host "No dossiers found."
        return
    }

    $deleted = 0
    foreach ($dossier in $dossiers) {
        $id = $dossier.id
        if ($id) {
            try {
                Invoke-RestMethod -Uri "$baseUrl/$id" -Method Delete
                Write-Host "Deleted dossier with ID: $id"
                $deleted++
            } catch {
                Write-Warning "Failed to delete dossier with ID: $id ($_)."
            }
        }
    }
    Write-Host "Deleted $deleted dossiers."
} catch {
    Write-Error "Failed to delete dossiers: $_"
}
