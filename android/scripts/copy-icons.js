const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const baseDir = path.join(__dirname, '..', 'app', 'src', 'main');

async function copy() {
  for (const [dir, size] of Object.entries(sizes)) {
    const outDir = path.join(baseDir, dir);
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(path.join(__dirname, '..', '..', 'docs', 'icons', 'icon-512.png'))
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, 'ic_launcher.png'));
    console.log(`  ✓ ${dir}/ic_launcher.png (${size}x${size})`);
  }
  console.log('Iconos copiados.');
}

copy();
