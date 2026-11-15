const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('[*] Generating clean Desktop ZIP archive...');

const psScript = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dest1 = 'C:\\Users\\dell\\OneDrive\\Desktop\\zealous-lead-bot.zip'
$dest2 = 'C:\\Users\\dell\\Desktop\\zealous-lead-bot.zip'
$stage = 'C:\\Users\\dell\\AppData\\Local\\Temp\\zealous_stage_zip_adv'

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item -Recurse -Path 'src' -Destination "$stage\\src"
if (Test-Path 'scripts') { Copy-Item -Recurse -Path 'scripts' -Destination "$stage\\scripts" }
Copy-Item -Path 'package.json', 'package-lock.json', '.env.example', 'README.md', 'test_syntax.js', 'test_features_drip_pdf_modes.js', 'start_live_cloudflare.bat', 'CLOUDFLARE_LAPTOP_SETUP.md', 'ORACLE_CLOUD_FREE_SETUP.md', 'ecosystem.config.js', '.gitignore' -Destination $stage -ErrorAction SilentlyContinue

# Ensure direct desktop launcher is placed on desktops
if (Test-Path 'start_live_cloudflare.bat') {
  if (Test-Path 'C:\\Users\\dell\\OneDrive\\Desktop') {
    Copy-Item 'start_live_cloudflare.bat' -Destination 'C:\\Users\\dell\\OneDrive\\Desktop\\start_live_cloudflare.bat' -Force
  }
  if (Test-Path 'C:\\Users\\dell\\Desktop') {
    Copy-Item 'start_live_cloudflare.bat' -Destination 'C:\\Users\\dell\\Desktop\\start_live_cloudflare.bat' -Force
  }
}

if (Test-Path $dest1) { Remove-Item -Force $dest1 }
if (Test-Path $dest2) { Remove-Item -Force $dest2 }

[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $dest2)
if (Test-Path 'C:\\Users\\dell\\OneDrive\\Desktop') {
  Copy-Item $dest2 -Destination $dest1 -Force
}

Remove-Item -Recurse -Force $stage

if (Test-Path $dest1) {
  Write-Output "✅ Archive created on OneDrive Desktop: $dest1"
  Get-Item $dest1 | Select-Object Name, Length, LastWriteTime
}
if (Test-Path $dest2) {
  Write-Output "✅ Archive created on Local Desktop: $dest2"
}
`;

const tempPs = path.join(__dirname, 'temp_archive.ps1');
fs.writeFileSync(tempPs, psScript);
const res = spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', tempPs], { encoding: 'utf8' });
if (res.stdout) console.log(res.stdout);
if (res.stderr) console.error(res.stderr);
try { fs.unlinkSync(tempPs); } catch (e) {}
