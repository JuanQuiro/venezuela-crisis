const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const JAVA_HOME = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Temp', 'jdk17', 'jdk-17.0.13-lite');
const SDK_DIR = path.join(process.env.USERPROFILE, '.bubblewrap', 'android-sdk');
const PROJECT_DIR = path.join(ROOT, 'app');
const MANIFEST_PATH = path.join(ROOT, 'twa-manifest.json');

process.env.JAVA_HOME = JAVA_HOME;
process.env.PATH = `${JAVA_HOME}\\bin;${process.env.PATH}`;

const { Config, TwaManifest, TwaGenerator, GradleWrapper, ConsoleLog } = require('@bubblewrap/core');

const log = new ConsoleLog('Build');

async function installSdk() {
  if (fs.existsSync(path.join(SDK_DIR, 'platforms', 'android-35'))) {
    log.log('✓ Android SDK already set up for API 35');
    return;
  }

  if (!fs.existsSync(path.join(SDK_DIR, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat'))) {
    log.log('Downloading Android command-line tools...');
    fs.mkdirSync(SDK_DIR, { recursive: true });

    const zipPath = path.join(ROOT, 'cmdline-tools.zip');
    const url = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';

    if (!fs.existsSync(zipPath)) {
      log.log(`Downloading from ${url}...`);
      const { default: fetch } = await import('node-fetch');
      const resp = await fetch(url);
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(zipPath, buf);
      log.log(`Downloaded ${(buf.length / 1e6).toFixed(1)} MB`);
    }

    log.log('Extracting...');
    const { default: unzipper } = await import('unzipper');
    await new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: path.join(SDK_DIR, 'extracted') }))
        .on('close', resolve)
        .on('error', reject);
    });

    // Move from extracted/cmdline-tools to cmdline-tools/latest
    const extracted = path.join(SDK_DIR, 'extracted', 'cmdline-tools');
    const latest = path.join(SDK_DIR, 'cmdline-tools', 'latest');
    fs.mkdirSync(path.dirname(latest), { recursive: true });
    fs.renameSync(extracted, latest);
    fs.rmSync(path.join(SDK_DIR, 'extracted'), { recursive: true, force: true });
    fs.rmSync(zipPath);
    log.log('✓ Command-line tools installed');
  }

  log.log('Installing Android SDK platform and build tools...');
  const sdkManager = path.join(SDK_DIR, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
  
  // Accept licenses first
  execSync(`"${sdkManager}" --licenses --sdk_root="${SDK_DIR}"`, {
    stdio: 'inherit',
    env: { ...process.env, ANDROID_HOME: SDK_DIR },
  }).catch(() => {
    // License prompt; we need to pipe "y" to it
    const result = require('child_process').spawnSync(
      `"${sdkManager}"`, ['--licenses', `--sdk_root="${SDK_DIR}"`],
      { stdio: ['pipe', 'inherit', 'inherit'], env: { ...process.env, ANDROID_HOME: SDK_DIR } }
    );
    // If it auto-closed, try again with stdin pipe
  });

  // Install platform
  execSync(`"${sdkManager}" "platforms;android-35" "build-tools;35.0.0" --sdk_root="${SDK_DIR}"`, {
    stdio: 'inherit',
    env: { ...process.env, ANDROID_HOME: SDK_DIR },
    timeout: 300000,
  });

  log.log('✓ Android SDK ready');
}

async function build() {
  log.log('\n=== VENEZUELA CRISIS APK BUILDER ===\n');

  // 1. Install Android SDK if needed
  await installSdk();

  // 2. Load manifest
  const manifest = await TwaManifest.fromFile(MANIFEST_PATH);
  log.log(`✓ Manifest: ${manifest.name} (${manifest.packageId})`);

  // 3. Create config
  const config = new Config(JAVA_HOME, SDK_DIR);

  // 4. Generate TWA project
  const generator = new TwaGenerator(config, log);
  log.log('Creating TWA project...');
  if (fs.existsSync(PROJECT_DIR)) {
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  }
  await generator.createTwaProject(PROJECT_DIR, manifest);
  log.log('✓ Project created');

  // 5. Build with Gradle
  log.log('Building APK...');
  const gradle = new GradleWrapper(config);
  await gradle.assembleRelease(PROJECT_DIR);
  log.log('✓ Build complete');

  // 6. Find signed or unsigned APK
  const apkPaths = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.apk')) apkPaths.push(p);
    }
  };
  walk(PROJECT_DIR);

  if (apkPaths.length) {
    const dest = path.join(ROOT, 'VenezuelaCrisis.apk');
    fs.copyFileSync(apkPaths[0], dest);
    log.log(`\n✓ APK generado: ${dest}`);
    log.log(`  Tamaño: ${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
    log.log(`  Origen: ${apkPaths[0]}`);
  } else {
    log.log('\n✗ No APK found in project output');
  }
  
  log.log('\nDone!');
}

build().catch(err => {
  console.error('\n✗ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
