# Build Resources

This folder contains resources used during Electron packaging.

## Icon Configuration Overview

Windows icons are configured in three places to ensure Organia branding appears everywhere:

| Location | Purpose | File |
|----------|---------|------|
| `electron-builder.json` → `win.icon` | Embeds icon into .exe (Start Menu, Desktop, Explorer) | `build/icon.ico` |
| `electron-builder.json` → `nsis.*Icon` | Icon for installer/uninstaller .exe | `build/icon.ico` |
| `main.cjs` → `BrowserWindow.icon` | Runtime icon for taskbar and window thumbnail | Loaded from resources |

## Files

- `icon.svg` - Source SVG icon (used to generate other formats)
- `icon.ico` - Windows application icon (multi-resolution: 16, 32, 48, 64, 128, 256px)
- `icon.icns` - macOS application icon (not yet generated)
- `icons/` - Linux icons in various sizes (not yet created)
- `generate-icons.ps1` - PowerShell script to regenerate icon.ico from icon.svg

## Windows Icon Sizes

The icon.ico file must contain multiple resolutions for proper display:

| Size | Usage |
|------|-------|
| 16x16 | Small icon view in Explorer, system tray |
| 32x32 | Default icon view, dialogs |
| 48x48 | Large icon view |
| 64x64 | Extra-large icon view |
| 128x128 | Thumbnail view |
| 256x256 | Extra-large thumbnail, high-DPI displays |

## Regenerating Icons

### Windows (.ico)
Run the PowerShell script (requires ImageMagick):
```powershell
./generate-icons.ps1
```

Or run ImageMagick directly:
```bash
magick convert icon.svg -background none -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### macOS (.icns)
Use iconutil:
```bash
mkdir icon.iconset
sips -z 16 16     icon.svg --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.svg --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.svg --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.svg --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.svg --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.svg --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.svg --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.svg --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.svg --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.svg --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

### Linux
Create PNG files and place them in `icons/` subfolder:
```bash
mkdir -p icons
for size in 16 32 48 64 128 256 512; do
  magick convert icon.svg -resize ${size}x${size} icons/${size}x${size}.png
done
```
