$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$source = "icon.svg"
$output = "icon.ico"

if (-not (Test-Path $source)) {
  Write-Error "Missing $source in $scriptDir"
}

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  Write-Error "ImageMagick not found. Install it and ensure 'magick' is on PATH."
}

Write-Host "Generating $output from $source..."
magick convert $source -background none -define icon:auto-resize=256,128,64,48,32,16 $output
Write-Host "Done."
