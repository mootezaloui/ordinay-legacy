/**
 * Comprehensive Icon Generation Script for Ordinay
 * =================================================
 * Generates platform-specific icon assets from the master SVG logo.
 *
 * Source: Logo_orgunia.svg (master icon - DO NOT MODIFY)
 *
 * Outputs:
 *   - Windows: Light_mode_icon.ico (16, 32, 48, 64, 128, 256px)
 *   - macOS:   icon.icns (16, 32, 64, 128, 256, 512, 1024px)
 *   - Linux:   icons/ directory with PNG files (16, 24, 32, 48, 64, 128, 256, 512px)
 *
 * Run with:
 *   npm run generate:icons
 *   node build/generate-icons.cjs
 *   node build/generate-icons.cjs --platform windows
 *   node build/generate-icons.cjs --platform mac
 *   node build/generate-icons.cjs --platform linux
 *
 * Requires: npm install --save-dev sharp png-to-ico
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// === Configuration ===
const BUILD_DIR = __dirname;
const SVG_SOURCE = path.join(BUILD_DIR, 'Logo_orgunia.svg');

// Platform-specific size requirements
const WINDOWS_SIZES = [256, 128, 64, 48, 32, 16];
const MACOS_SIZES = [1024, 512, 256, 128, 64, 32, 16];
const LINUX_SIZES = [512, 256, 128, 64, 48, 32, 24, 16];

// Output paths
const WINDOWS_ICO_PATH = path.join(BUILD_DIR, 'Light_mode_icon.ico');
const MACOS_ICNS_PATH = path.join(BUILD_DIR, 'icon.icns');
const LINUX_ICONS_DIR = path.join(BUILD_DIR, 'icons');

// ICNS format type codes
const ICNS_TYPES = {
  16: 'icp4',   // 16x16
  32: 'icp5',   // 32x32
  64: 'icp6',   // 64x64
  128: 'ic07',  // 128x128
  256: 'ic08',  // 256x256
  512: 'ic09',  // 512x512
  1024: 'ic10', // 1024x1024
};

// === Utility Functions ===

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return null;
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

async function loadSvg() {
  if (!fs.existsSync(SVG_SOURCE)) {
    throw new Error(`SVG source not found: ${SVG_SOURCE}`);
  }
  return fs.readFileSync(SVG_SOURCE);
}

/**
 * Pre-trimmed SVG buffer cache.
 * We render the SVG once at high resolution, trim transparent padding,
 * then use this trimmed image as the source for all sizes.
 */
let trimmedSourceCache = null;

async function getTrimmedSource(svgBuffer) {
  if (trimmedSourceCache) return trimmedSourceCache;

  // Render SVG at a high resolution first
  const highRes = await sharp(svgBuffer)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  // Trim transparent pixels around the logo
  trimmedSourceCache = await sharp(highRes)
    .trim()
    .png()
    .toBuffer();

  const meta = await sharp(trimmedSourceCache).metadata();
  console.log(`  Trimmed source: ${meta.width}x${meta.height} (padding removed)`);

  return trimmedSourceCache;
}

async function generatePng(svgBuffer, size) {
  const trimmed = await getTrimmedSource(svgBuffer);

  return sharp(trimmed)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true
    })
    .toBuffer();
}

// === Windows ICO Generation ===

async function generateWindowsIco(svgBuffer) {
  console.log('\n[Windows] Generating ICO file...');
  const pngToIco = (await import('png-to-ico')).default;

  const pngBuffers = [];
  for (const size of WINDOWS_SIZES) {
    const pngBuffer = await generatePng(svgBuffer, size);
    pngBuffers.push(pngBuffer);
    console.log(`  - ${size}x${size} PNG generated`);
  }

  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(WINDOWS_ICO_PATH, icoBuffer);

  const stats = fs.statSync(WINDOWS_ICO_PATH);
  console.log(`[Windows] ICO created: ${WINDOWS_ICO_PATH}`);
  console.log(`[Windows] File size: ${Math.round(stats.size / 1024)} KB`);
}

// === macOS ICNS Generation ===

/**
 * Generate ICNS file manually (cross-platform compatible)
 * ICNS format: magic bytes + icon entries
 */
async function generateMacosIcns(svgBuffer) {
  console.log('\n[macOS] Generating ICNS file...');

  const iconEntries = [];

  for (const size of MACOS_SIZES) {
    const typeCode = ICNS_TYPES[size];
    if (!typeCode) continue;

    const pngBuffer = await generatePng(svgBuffer, size);
    iconEntries.push({ type: typeCode, data: pngBuffer, size });
    console.log(`  - ${size}x${size} PNG generated (${typeCode})`);
  }

  // Calculate total file size
  // Header: 4 bytes magic + 4 bytes file size
  // Each entry: 4 bytes type + 4 bytes entry size + data
  let totalSize = 8; // ICNS header
  for (const entry of iconEntries) {
    totalSize += 8 + entry.data.length;
  }

  // Build ICNS file
  const icnsBuffer = Buffer.alloc(totalSize);
  let offset = 0;

  // Write ICNS magic number
  icnsBuffer.write('icns', offset);
  offset += 4;

  // Write total file size (big-endian)
  icnsBuffer.writeUInt32BE(totalSize, offset);
  offset += 4;

  // Write each icon entry
  for (const entry of iconEntries) {
    // Type code (4 bytes)
    icnsBuffer.write(entry.type, offset);
    offset += 4;

    // Entry size (4 bytes type + 4 bytes size + data length, big-endian)
    icnsBuffer.writeUInt32BE(8 + entry.data.length, offset);
    offset += 4;

    // PNG data
    entry.data.copy(icnsBuffer, offset);
    offset += entry.data.length;
  }

  fs.writeFileSync(MACOS_ICNS_PATH, icnsBuffer);

  const stats = fs.statSync(MACOS_ICNS_PATH);
  console.log(`[macOS] ICNS created: ${MACOS_ICNS_PATH}`);
  console.log(`[macOS] File size: ${Math.round(stats.size / 1024)} KB`);
}

// === Linux PNG Icons Generation ===

async function generateLinuxIcons(svgBuffer) {
  console.log('\n[Linux] Generating PNG icons...');

  // Ensure icons directory exists
  if (fs.existsSync(LINUX_ICONS_DIR)) {
    // Clean existing icons
    const files = fs.readdirSync(LINUX_ICONS_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(LINUX_ICONS_DIR, file));
    }
  } else {
    fs.mkdirSync(LINUX_ICONS_DIR, { recursive: true });
  }

  for (const size of LINUX_SIZES) {
    const pngBuffer = await generatePng(svgBuffer, size);
    const pngPath = path.join(LINUX_ICONS_DIR, `${size}x${size}.png`);
    fs.writeFileSync(pngPath, pngBuffer);
    console.log(`  - ${size}x${size}.png generated`);
  }

  console.log(`[Linux] Icons created in: ${LINUX_ICONS_DIR}`);
}

// === Main Entry Point ===

async function main() {
  console.log('='.repeat(60));
  console.log('Ordinay Icon Generation Script');
  console.log('='.repeat(60));
  console.log(`Source: ${SVG_SOURCE}`);

  try {
    const svgBuffer = await loadSvg();
    console.log('SVG loaded successfully');

    const platform = getArgValue('--platform') || getArgValue('-p');
    const generateAll = !platform || platform === 'all';

    if (generateAll || platform === 'windows' || platform === 'win') {
      await generateWindowsIco(svgBuffer);
    }

    if (generateAll || platform === 'mac' || platform === 'macos') {
      await generateMacosIcns(svgBuffer);
    }

    if (generateAll || platform === 'linux') {
      await generateLinuxIcons(svgBuffer);
    }

    console.log('\n' + '='.repeat(60));
    console.log('Icon generation completed successfully!');
    console.log('='.repeat(60));

    // Summary
    console.log('\nGenerated files:');
    if (fs.existsSync(WINDOWS_ICO_PATH)) {
      console.log(`  [Windows] ${WINDOWS_ICO_PATH}`);
    }
    if (fs.existsSync(MACOS_ICNS_PATH)) {
      console.log(`  [macOS]   ${MACOS_ICNS_PATH}`);
    }
    if (fs.existsSync(LINUX_ICONS_DIR)) {
      const files = fs.readdirSync(LINUX_ICONS_DIR);
      console.log(`  [Linux]   ${LINUX_ICONS_DIR}/ (${files.length} files)`);
    }

  } catch (error) {
    console.error('\nError generating icons:', error.message);
    process.exit(1);
  }
}

main();
