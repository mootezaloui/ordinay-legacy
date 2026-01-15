# PowerShell script to delete all clients by fetching and deleting each by ID
# Adjust the $baseUrl if your backend runs on a different host/port

$baseUrl = "http://localhost:3000/api/clients"  # Update if needed

try {
    # Fetch all clients
    $clients = Invoke-RestMethod -Uri $baseUrl -Method Get
    if (-not $clients -or $clients.Count -eq 0) {
        Write-Host "No clients found."
        return
    }

    $deleted = 0
    foreach ($client in $clients) {
        $id = $client.id
        if ($id) {
            try {
                Invoke-RestMethod -Uri "$baseUrl/$id" -Method Delete
                Write-Host "Deleted client with ID: $id"
                $deleted++
            } catch {
                Write-Warning "Failed to delete client with ID: $id ($_)."
            }
        }
    }
    Write-Host "Deleted $deleted clients."
} catch {
    Write-Error "Failed to delete clients: $_"
}
