/**
 * Icon Generation Script
 * Converts icon.svg to icon.ico with multiple resolutions
 *
 * Run with: node build/generate-icons.cjs
 *
 * Requires: npm install --save-dev sharp png-to-ico
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [256, 128, 64, 48, 32, 16];
const BUILD_DIR = __dirname;
const SVG_PATH = path.join(BUILD_DIR, 'icon.svg');
const ICO_PATH = path.join(BUILD_DIR, 'icon.ico');

async function generateIcon() {
  // Dynamic import for ES module
  const pngToIco = (await import('png-to-ico')).default;

  console.log('Reading SVG from:', SVG_PATH);

  if (!fs.existsSync(SVG_PATH)) {
    console.error('Error: icon.svg not found at', SVG_PATH);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);
  const pngBuffers = [];

  console.log('Generating PNG files at sizes:', SIZES.join(', '));

  for (const size of SIZES) {
    const pngBuffer = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();

    pngBuffers.push(pngBuffer);
    console.log(`  - ${size}x${size} OK`);
  }

  console.log('Creating ICO file...');
  const icoBuffer = await pngToIco(pngBuffers);

  fs.writeFileSync(ICO_PATH, icoBuffer);
  console.log('Icon generated successfully:', ICO_PATH);

  const stats = fs.statSync(ICO_PATH);
  console.log('File size:', Math.round(stats.size / 1024), 'KB');
}

generateIcon().catch(err => {
  console.error('Error generating icon:', err);
  process.exit(1);
});
