
# PowerShell script to delete all personal tasks by fetching and deleting each by ID
# Adjust the $baseUrl if your backend runs on a different host/port

$baseUrl = "http://localhost:3000/api/personal-tasks"  # Update if needed

try {
    # Fetch all personal tasks
    $tasks = Invoke-RestMethod -Uri $baseUrl -Method Get
    if (-not $tasks -or $tasks.Count -eq 0) {
        Write-Host "No personal tasks found."
        return
    }

    $deleted = 0
    foreach ($task in $tasks) {
        $id = $task.id
        if ($id) {
            try {
                Invoke-RestMethod -Uri "$baseUrl/$id" -Method Delete
                Write-Host "Deleted personal task with ID: $id"
                $deleted++
            } catch {
                Write-Warning "Failed to delete personal task with ID: $id ($_)."
            }
        }
    }
    Write-Host "Deleted $deleted personal tasks."
} catch {
    Write-Error "Failed to delete personal tasks: $_"
}
