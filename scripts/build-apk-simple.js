const path = require('path');
const { execSync } = require('child_process');

const JAVA_HOME = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Temp', 'jdk17', 'jdk-17.0.13-lite');
const SDK_DIR = path.join(process.env.USERPROFILE, '.bubblewrap', 'android_sdk');
const ROOT = path.join(__dirname, '..');
const PROJECT_DIR = path.join(ROOT, 'app');
const MANIFEST_PATH = path.join(ROOT, 'twa-manifest.json');

process.env.JAVA_HOME = JAVA_HOME;
process.env.PATH = `${JAVA_HOME}\\bin;${process.env.PATH}`;
process.env.ANDROID_HOME = SDK_DIR;
process.env.ANDROID_SDK_ROOT = SDK_DIR;

const { Config, TwaManifest, TwaGenerator, GradleWrapper, ConsoleLog } = require('@bubblewrap/core');

const log = new ConsoleLog('Build');

async function main() {
  // 1. Load manifest
  const manifest = await TwaManifest.fromFile(MANIFEST_PATH);
  log.log(`Manifest: ${manifest.name} (${manifest.packageId})`);

  // 2. Build config
  const config = new Config(JAVA_HOME, SDK_DIR);

  // 3. Generate TWA project
  const generator = new TwaGenerator(config, log);
  log.log('Creating TWA project...');
  if (require('fs').existsSync(PROJECT_DIR)) {
    require('fs').rmSync(PROJECT_DIR, { recursive: true, force: true });
  }
  await generator.createTwaProject(PROJECT_DIR, manifest);
  log.log('Project created');

  // 4. Install platform via sdkmanager (newer version)
  const sm = path.join(SDK_DIR, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
  
  // Check what platform we need
  const buildGradle = require('fs').readFileSync(path.join(PROJECT_DIR, 'app', 'build.gradle'), 'utf8');
  const sdkMatch = buildGradle.match(/compileSdk\s+(\d+)/);
  const sdkVer = sdkMatch ? sdkMatch[1] : '34';
  log.log(`Target SDK: ${sdkVer}`);

  // Install platform
  log.log('Installing platform and build tools...');
  execSync(`"${sm}" "platforms;android-${sdkVer}" "build-tools;${sdkVer}.0.0" --sdk_root="${SDK_DIR}"`, {
    stdio: 'inherit',
    env: process.env,
    timeout: 600000,
  });

  // 5. Build with Gradle
  log.log('Building APK...');
  const gradle = new GradleWrapper(config);
  await gradle.assembleRelease(PROJECT_DIR);
  log.log('Build complete');

  // 6. Find APK
  const { globSync } = require('glob');
  const apks = globSync(path.join(PROJECT_DIR, '**', '*.apk'));
  if (apks.length > 0) {
    const dest = path.join(ROOT, 'VenezuelaCrisis.apk');
    require('fs').copyFileSync(apks[0], dest);
    log.log(`APK: ${dest} (${(require('fs').statSync(dest).size / 1e6).toFixed(1)} MB)`);
  } else {
    log.log('No APK found');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
