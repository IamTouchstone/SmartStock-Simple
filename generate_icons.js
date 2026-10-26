const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'public', 'icons');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

const srcLogo = path.join(iconsDir, 'icon-512.png');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function run() {
  console.log(`Reading source icon from: ${srcLogo}`);
  const baseImg = await Jimp.read(srcLogo);

  // 1. Generate standard square icon sizes
  for (const size of sizes) {
    const resized = baseImg.clone().resize({ w: size, h: size });
    await resized.write(path.join(iconsDir, `icon-${size}.png`));
    console.log(`✓ icon-${size}.png (${size}x${size})`);
  }

  // 2. Generate adaptive-icon.png (1024x1024 #0A2E24 canvas, 680x680 centered logo for Android safe zone)
  const adaptiveCanvas = new Jimp({ width: 1024, height: 1024, color: 0x0A2E24FF });
  const adaptiveLogo = baseImg.clone().resize({ w: 680, h: 680 });
  adaptiveCanvas.composite(adaptiveLogo, Math.round((1024 - 680) / 2), Math.round((1024 - 680) / 2));
  await adaptiveCanvas.write(path.join(iconsDir, 'adaptive-icon.png'));
  console.log(`✓ adaptive-icon.png (1024x1024 with safe zone margin)`);

  // 3. Generate app_icon.png and splash_icon.png in public/
  await baseImg.clone().resize({ w: 512, h: 512 }).write(path.join(publicDir, 'app_icon.png'));
  await baseImg.clone().resize({ w: 512, h: 512 }).write(path.join(publicDir, 'splash_icon.png'));
  console.log(`✓ public/app_icon.png and public/splash_icon.png`);

  console.log('\nAll Android & Web icons successfully regenerated in public/icons/!');
}

run().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
