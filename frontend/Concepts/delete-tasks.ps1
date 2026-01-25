# PowerShell script to delete all tasks by fetching and deleting each by ID
# Adjust the $baseUrl if your backend runs on a different host/port

$baseUrl = "http://localhost:3000/api/tasks"  # Update if needed

try {
    # Fetch all tasks
    $tasks = Invoke-RestMethod -Uri $baseUrl -Method Get
    if (-not $tasks -or $tasks.Count -eq 0) {
        Write-Host "No tasks found."
        return
    }

    $deleted = 0
    foreach ($task in $tasks) {
        $id = $task.id
        if ($id) {
            try {
                Invoke-RestMethod -Uri "$baseUrl/$id" -Method Delete
                Write-Host "Deleted task with ID: $id"
                $deleted++
            } catch {
                Write-Warning "Failed to delete task with ID: $id ($_)."
            }
        }
    }
    Write-Host "Deleted $deleted tasks."
} catch {
    Write-Error "Failed to delete tasks: $_"
}
