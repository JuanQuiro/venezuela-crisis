const sharp = require('sharp');
const path = require('path');

const outDir = path.join(__dirname, '..', 'docs', 'icons');

async function gen(size) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size*0.15}" fill="#1a1a2e"/>
      <circle cx="${size/2}" cy="${size*0.38}" r="${size*0.18}" fill="#e74c3c"/>
      <rect x="${size*0.25}" y="${size*0.56}" width="${size*0.5}" height="${size*0.04}" rx="${size*0.01}" fill="#e74c3c"/>
      <rect x="${size*0.33}" y="${size*0.62}" width="${size*0.34}" height="${size*0.04}" rx="${size*0.01}" fill="#f39c12"/>
      <rect x="${size*0.22}" y="${size*0.68}" width="${size*0.56}" height="${size*0.04}" rx="${size*0.01}" fill="#27ae60"/>
      <rect x="${size*0.28}" y="${size*0.74}" width="${size*0.44}" height="${size*0.04}" rx="${size*0.01}" fill="#3498db"/>
    </svg>`;

  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`  ✓ icon-${size}.png`);
}

(async () => {
  console.log('Generando íconos PWA...');
  await Promise.all([gen(192), gen(512)]);
  console.log('Listo.');
})();
