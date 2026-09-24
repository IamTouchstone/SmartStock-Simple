const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

const srcImage = path.join(iconsDir, 'icon-transparent.png');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function run() {
  console.log(`Reading source icon from: ${srcImage}`);
  const baseImg = await Jimp.read(srcImage);

  // 1. Generate standard square icon sizes
  for (const size of sizes) {
    const resized = baseImg.clone().resize({ w: size, h: size });
    await resized.write(path.join(iconsDir, `icon-${size}.png`));
    console.log(`✓ icon-${size}.png (${size}x${size})`);
  }

  // 2. Generate adaptive-icon.png (1024x1024 transparent canvas, 720x720 centered logo for Android safe zone)
  const adaptiveCanvas = new Jimp({ width: 1024, height: 1024, color: 0x00000000 });
  const adaptiveLogo = baseImg.clone().resize({ w: 720, h: 720 });
  adaptiveCanvas.composite(adaptiveLogo, 152, 152);
  await adaptiveCanvas.write(path.join(iconsDir, 'adaptive-icon.png'));
  console.log(`✓ adaptive-icon.png (1024x1024 transparent with safe zone margin)`);

  // 3. Generate splash.png (1024x1024 #090D16 dark background with centered logo)
  const splashCanvas = new Jimp({ width: 1024, height: 1024, color: 0x090D16FF });
  const splashLogo = baseImg.clone().resize({ w: 480, h: 480 });
  splashCanvas.composite(splashLogo, 272, 272);
  await splashCanvas.write(path.join(iconsDir, 'splash.png'));
  console.log(`✓ splash.png (1024x1024 #090D16 dark splash screen)`);

  console.log('\nAll Android & Web icons successfully regenerated in public/icons/!');
}

run().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
