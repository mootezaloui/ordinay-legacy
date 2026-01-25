# PowerShell script to delete all hearings (sessions of type 'hearing') by fetching all sessions and deleting those with type 'hearing'
# Adjust the $baseUrl if your backend runs on a different host/port

$baseUrl = "http://localhost:3000/api/sessions"  # Update if needed

try {
    # Fetch all sessions
    $sessions = Invoke-RestMethod -Uri $baseUrl -Method Get
    if (-not $sessions -or $sessions.Count -eq 0) {
        Write-Host "No sessions found."
        return
    }

    $deleted = 0
    foreach ($session in $sessions) {
        if ($session.session_type -eq "hearing") {
            $id = $session.id
            if ($id) {
                try {
                    Invoke-RestMethod -Uri "$baseUrl/$id" -Method Delete
                    Write-Host "Deleted hearing (session) with ID: $id"
                    $deleted++
                } catch {
                    Write-Warning "Failed to delete hearing (session) with ID: $id ($_)."
                }
            }
        }
    }
    Write-Host "Deleted $deleted hearings."
} catch {
    Write-Error "Failed to delete hearings: $_"
}
