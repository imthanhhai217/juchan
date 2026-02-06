# Script to convert SVG icons to PNG using sharp-cli
# Run: npm install -g sharp-cli

$icons = @("icon16", "icon32", "icon48", "icon128")

foreach ($icon in $icons) {
    $svgPath = ".\$icon.svg"
    $pngPath = ".\$icon.png"
    
    if (Test-Path $svgPath) {
        Write-Host "Converting $icon.svg to $icon.png..."
        sharp -i $svgPath -o $pngPath
    } else {
        Write-Host "File $svgPath not found!"
    }
}

Write-Host "Done! PNG icons created."
