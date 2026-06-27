const path = require('path');
const fs = require('fs');

// Config
const JAVA_HOME = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Temp', 'jdk17', 'jdk-17.0.13-lite');
const SDK_DIR = path.join(process.env.USERPROFILE, '.bubblewrap', 'android-sdk');
const ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'twa-manifest.json');
const PROJECT_DIR = path.join(ROOT, 'app');

process.env.JAVA_HOME = JAVA_HOME;
process.env.PATH = `${JAVA_HOME}\\bin;${process.env.PATH}`;

const { Config, TwaManifest, TwaGenerator, GradleWrapper, ConsoleLog } = require('@bubblewrap/core');
const { AndroidSdkToolsInstaller } = require(path.join(process.env.APPDATA, 'npm', 'node_modules', '@bubblewrap', 'cli', 'dist', 'lib', 'AndroidSdkToolsInstaller'));
const { InquirerPrompt } = require(path.join(process.env.APPDATA, 'npm', 'node_modules', '@bubblewrap', 'cli', 'dist', 'lib', 'Prompt'));

const log = new ConsoleLog('Build');
const prompt = new InquirerPrompt();

class DummyProcess {
  get platform() { return 'win32'; }
  get env() { return process.env; }
  cwd() { return process.cwd(); }
}

async function installSdk() {
  if (fs.existsSync(path.join(SDK_DIR, 'platforms'))) {
    log.log('✓ Android SDK already installed');
    return;
  }
  
  log.log('Downloading Android SDK command-line tools...');
  fs.mkdirSync(SDK_DIR, { recursive: true });
  
  const installer = new AndroidSdkToolsInstaller(new DummyProcess(), prompt);
  await installer.install(SDK_DIR);
  log.log('✓ SDK command-line tools downloaded');
  
  log.log('Installing platform and build tools...');
  const sdkTools = new (require('@bubblewrap/core').AndroidSdkTools)(new DummyProcess(), new Config({}), null, log);
  
  // Use sdkmanager to install required packages
  const { execSync } = require('child_process');
  const sdkManager = path.join(SDK_DIR, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
  if (!fs.existsSync(sdkManager)) {
    // Try older path
    const sdkManagerOld = path.join(SDK_DIR, 'tools', 'bin', 'sdkmanager');
    if (fs.existsSync(sdkManagerOld + '.bat')) {
      execSync(`"${sdkManagerOld}" "platforms;android-35" "build-tools;35.0.0"`, {
        cwd: SDK_DIR,
        stdio: 'inherit',
        env: { ...process.env, ANDROID_HOME: SDK_DIR }
      });
    }
  } else {
    execSync(`"${sdkManager}" "platforms;android-35" "build-tools;35.0.0"`, {
      cwd: SDK_DIR,
      stdio: 'inherit',
      env: { ...process.env, ANDROID_HOME: SDK_DIR }
    });
  }
  
  log.log('✓ Android SDK ready');
  return true;
}

async function build() {
  log.log('\n=== VENEZUELA CRISIS APK BUILDER ===\n');
  
  // 1. Load manifest
  const manifest = TwaManifest.fromFile(MANIFEST_PATH);
  log.log(`✓ Manifest: ${manifest.name}`);
  
  // 2. Install SDK if needed
  await installSdk();
  
  // 3. Build
  const config = new Config({ jdkPath: JAVA_HOME, androidSdkPath: SDK_DIR });
  const generator = new TwaGenerator(config, log);
  
  log.log('\nCreating TWA project...');
  if (fs.existsSync(PROJECT_DIR)) {
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
  }
  await generator.createTwaProject(PROJECT_DIR, manifest);
  log.log('✓ Project created');
  
  log.log('\nBuilding APK...');
  const gradle = new GradleWrapper(config);
  await gradle.assembleRelease(PROJECT_DIR);
  log.log('✓ Build complete');
  
  // 4. Find the APK
  const apkPath = path.join(PROJECT_DIR, 'launcher', 'build', 'outputs', 'apk', 'release');
  const apkName = 'app-release-unsigned.apk';
  const apkFile = path.join(apkPath, apkName);
  
  if (fs.existsSync(apkFile)) {
    const dest = path.join(ROOT, 'VenezuelaCrisis.apk');
    fs.copyFileSync(apkFile, dest);
    log.log(`\n✓ APK generado: ${dest}`);
    log.log(`  Tamaño: ${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
  } else {
    // Search recursively
    const results = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.apk')) results.push(p);
      }
    };
    walk(PROJECT_DIR);
    if (results.length) {
      const dest = path.join(ROOT, 'VenezuelaCrisis.apk');
      fs.copyFileSync(results[0], dest);
      log.log(`\n✓ APK encontrado: ${results[0]}`);
      log.log(`  Copiado a: ${dest}`);
    } else {
      log.log('\n✗ No se encontró el APK');
    }
  }
}

build().catch(err => {
  console.error('\n✗ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
