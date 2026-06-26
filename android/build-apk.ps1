param(
    [switch]$SetupOnly
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor DarkRed
Write-Host "║   VENEZUELA CRISIS - Build APK        ║" -ForegroundColor DarkRed
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor DarkRed
Write-Host ""

# 1. Check Java
$javaOk = $false
try {
    $javaVer = java -version 2>&1 | Select-String "version"
    if ($javaVer -match '"(\d+)') {
        $ver = [int]$Matches[1]
        if ($ver -ge 17) { $javaOk = $true }
    }
} catch {}
if (-not $javaOk) {
    Write-Host "✗ Java 17+ no encontrado." -ForegroundColor Yellow
    Write-Host "  Descargá e instalá Eclipse Temurin 17 de:" -ForegroundColor Gray
    Write-Host "  https://adoptium.net/temurin/releases/?version=17"
    Write-Host "  O ejecutá: scoop bucket add java && scoop install temurin17-jdk`n"
    exit 1
}
Write-Host "✓ JDK 17+ encontrado" -ForegroundColor Green

# 2. Check Android SDK
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) { $androidHome = $env:ANDROID_SDK_ROOT }
if (-not $androidHome -or -not (Test-Path $androidHome)) {
    $defaultPath = "$env:LOCALAPPDATA\Android\Sdk"
    if (Test-Path $defaultPath) { $androidHome = $defaultPath }
}

if (-not $androidHome -or -not (Test-Path $androidHome)) {
    Write-Host "✗ Android SDK no encontrado." -ForegroundColor Yellow
    Write-Host "  Instalá Android Studio desde:" -ForegroundColor Gray
    Write-Host "  https://developer.android.com/studio" -ForegroundColor Gray
    Write-Host "  Luego abrí este proyecto en Android Studio y buildé desde ahí.`n"
    Write-Host "  O configurá ANDROID_HOME apuntando al SDK.`n"
    exit 1
}
Write-Host "✓ Android SDK encontrado: $androidHome" -ForegroundColor Green

$env:ANDROID_HOME = $androidHome

# 3. Download Gradle wrapper if needed
$wrapperJar = "$ROOT\gradle\wrapper\gradle-wrapper.jar"
if (-not (Test-Path $wrapperJar) -or (Get-Item $wrapperJar).Length -eq 0) {
    Write-Host "Descargando Gradle Wrapper..." -ForegroundColor Cyan
    $gradleVersion = "8.11.1"
    $wrapperUrl = "https://raw.githubusercontent.com/gradle/gradle/v${gradleVersion}/gradle/wrapper/gradle-wrapper.jar"
    try {
        Invoke-WebRequest -Uri $wrapperUrl -OutFile $wrapperJar -ErrorAction Stop
        Write-Host "✓ Gradle Wrapper descargado" -ForegroundColor Green
    } catch {
        Write-Host "✗ No se pudo descargar Gradle Wrapper." -ForegroundColor Yellow
        Write-Host "  El proyecto se puede abrir directamente en Android Studio.`n"
        exit 1
    }
}

# 4. Generate required SDK components
Write-Host "Verificando SDK components..." -ForegroundColor Cyan
$sdkManager = "$androidHome\cmdline-tools\latest\bin\sdkmanager.bat"
if (-not (Test-Path $sdkManager)) {
    $sdkManager = "$androidHome\tools\bin\sdkmanager.bat"
}
if (-not (Test-Path $sdkManager)) {
    Write-Host "✗ sdkmanager no encontrado." -ForegroundColor Yellow
    Write-Host "  Instalá Android SDK Command-line Tools desde Android Studio.`n"
    Write-Host "  O abrí el proyecto en Android Studio que se encarga automáticamente.`n"
    exit 1
}

# 5. Build
Write-Host "`nConstruyendo APK..." -ForegroundColor Cyan
Push-Location $ROOT
try {
    .\gradlew.bat assembleRelease --no-daemon 2>&1
    $apkPath = "$ROOT\app\build\outputs\apk\release\app-release.apk"
    if (Test-Path $apkPath) {
        Write-Host ""
        Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║   APK LISTO!                           ║" -ForegroundColor Green
        Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green
        Write-Host "  $apkPath" -ForegroundColor White
        Write-Host "  Tamaño: $((Get-Item $apkPath).Length / 1MB -as [int]) MB" -ForegroundColor Gray
        Write-Host "`n  Compartilo con la gente!" -ForegroundColor DarkRed
    } else {
        Write-Host "✗ No se generó el APK. Revisá errores arriba." -ForegroundColor Red
    }
} finally {
    Pop-Location
}
