/**
 * Icon Generation Script
 * Converts an SVG to an ICO with multiple resolutions
 *
 * Run with:
 *   node build/generate-icons.cjs
 *   node build/generate-icons.cjs --input path/to/input.svg --output path/to/output.ico
 *
 * Requires: npm install --save-dev sharp png-to-ico
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [256, 128, 64, 48, 32, 16];
const BUILD_DIR = __dirname;

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return null;
}

const inputArg = getArgValue('--input') || getArgValue('-i');
const outputArg = getArgValue('--output') || getArgValue('-o');

const defaultSvgPath = path.join(BUILD_DIR, 'Light_mode_icon.svg');
const defaultIcoPath = path.join(BUILD_DIR, 'Light_mode_icon.ico');

const SVG_PATH = inputArg ? path.resolve(process.cwd(), inputArg) : defaultSvgPath;
const ICO_PATH = outputArg ? path.resolve(process.cwd(), outputArg) : defaultIcoPath;

async function generateIcon() {
  // Dynamic import for ES module
  const pngToIco = (await import('png-to-ico')).default;

  console.log('Reading SVG from:', SVG_PATH);

  if (!fs.existsSync(SVG_PATH)) {
    console.error('Error: SVG not found at', SVG_PATH);
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

  fs.mkdirSync(path.dirname(ICO_PATH), { recursive: true });
  fs.writeFileSync(ICO_PATH, icoBuffer);
  console.log('Icon generated successfully:', ICO_PATH);

  const stats = fs.statSync(ICO_PATH);
  console.log('File size:', Math.round(stats.size / 1024), 'KB');
}

generateIcon().catch(err => {
  console.error('Error generating icon:', err);
  process.exit(1);
});
