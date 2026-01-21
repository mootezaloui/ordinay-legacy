# Build Resources

This folder contains resources used during Electron packaging:

- `icon.ico` - Windows application icon (256x256 recommended)
- `icon.icns` - macOS application icon
- `icons/` - Linux icons in various sizes

## Creating Icons

### Windows (.ico)
Convert the SVG into a multi-size ICO using ImageMagick:
```bash
./generate-icons.ps1
```

Or run ImageMagick directly:
```bash
magick convert icon.svg -background none -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### macOS (.icns)
Use iconutil or an online converter:
```bash
mkdir icon.iconset
# Create PNGs in various sizes (16, 32, 64, 128, 256, 512, 1024)
iconutil -c icns icon.iconset
```

### Linux
Create PNG files in standard sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512
Place them in the `icons/` subfolder.
