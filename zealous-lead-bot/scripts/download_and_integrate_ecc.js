const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting ECC v2.0 Download & Antigravity Integration...');

const TEMP_ZIP = path.join('C:\\Users\\dell\\AppData\\Local\\Temp', 'ecc_main.zip');
const EXTRACT_DIR = path.join('C:\\Users\\dell\\AppData\\Local\\Temp', 'ecc_extracted');
const PLUGIN_DIR = 'C:\\Users\\dell\\.gemini\\config\\plugins\\ecc-harness';
const WORKSPACE_AGENTS_DIR = path.join(__dirname, '../.agents');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`[*] Downloading ECC repository from: ${url}`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download: Status ${res.statusCode}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastPercent = 0;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const percent = Math.floor((downloaded / total) * 100);
          if (percent >= lastPercent + 20) {
            console.log(`[*] Download progress: ${percent}% (${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB)`);
            lastPercent = percent;
          }
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ Download complete! Saved to ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  try {
    // 1. Download ZIP
    await downloadFile('https://codeload.github.com/affaan-m/ECC/zip/refs/heads/main', TEMP_ZIP);

    // 2. Extract ZIP
    if (fs.existsSync(EXTRACT_DIR)) {
      console.log('[*] Cleaning old extraction directory...');
      fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });

    console.log('[*] Extracting ZIP archive via PowerShell...');
    execSync(`powershell -Command "Expand-Archive -Path '${TEMP_ZIP}' -DestinationPath '${EXTRACT_DIR}' -Force"`, { stdio: 'inherit' });
    console.log('✅ Extraction complete!');

    // Source folder is usually EXTRACT_DIR/ECC-main
    const sourceRoot = path.join(EXTRACT_DIR, 'ECC-main');
    if (!fs.existsSync(sourceRoot)) {
      throw new Error(`Source directory not found at ${sourceRoot}`);
    }

    // 3. Prepare Antigravity Plugin folder
    console.log(`[*] Preparing Antigravity Plugin Directory: ${PLUGIN_DIR}`);
    if (!fs.existsSync(PLUGIN_DIR)) {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
    }

    // Prepare Workspace .agents directory
    console.log(`[*] Preparing Workspace .agents Directory: ${WORKSPACE_AGENTS_DIR}`);
    if (!fs.existsSync(WORKSPACE_AGENTS_DIR)) {
      fs.mkdirSync(WORKSPACE_AGENTS_DIR, { recursive: true });
    }

    // 4. Copy and map Agents (71 agents)
    const srcAgents = path.join(sourceRoot, 'agents');
    const targetPluginAgents = path.join(PLUGIN_DIR, 'agents');
    const targetWorkspaceAgents = path.join(WORKSPACE_AGENTS_DIR, 'agents');
    fs.mkdirSync(targetPluginAgents, { recursive: true });
    fs.mkdirSync(targetWorkspaceAgents, { recursive: true });

    if (fs.existsSync(srcAgents)) {
      const agentFiles = fs.readdirSync(srcAgents).filter(f => f.endsWith('.md'));
      console.log(`[*] Processing and mapping ${agentFiles.length} agents to Gemini Flash Engine (Free of Cost)...`);
      
      for (const f of agentFiles) {
        let content = fs.readFileSync(path.join(srcAgents, f), 'utf8');
        // Map Claude models to Gemini Flash / Inherit for 100% free operation
        content = content.replace(/model:\s*(sonnet|opus|claude-3-5-sonnet|claude-3-opus|claude-3-7-sonnet)/gi, 'model: flash');
        content = content.replace(/model:\s*(haiku|claude-3-haiku|claude-3-5-haiku)/gi, 'model: flash_lite');
        
        fs.writeFileSync(path.join(targetPluginAgents, f), content, 'utf8');
        fs.writeFileSync(path.join(targetWorkspaceAgents, f), content, 'utf8');
      }
      console.log(`✅ ${agentFiles.length} agents successfully mapped to Gemini Flash!`);
    }

    // 5. Copy Skills (314 skills)
    const srcSkills = path.join(sourceRoot, 'skills');
    const targetPluginSkills = path.join(PLUGIN_DIR, 'skills');
    const targetWorkspaceSkills = path.join(WORKSPACE_AGENTS_DIR, 'skills');
    fs.mkdirSync(targetPluginSkills, { recursive: true });
    fs.mkdirSync(targetWorkspaceSkills, { recursive: true });

    if (fs.existsSync(srcSkills)) {
      console.log('[*] Copying 300+ skills to Antigravity plugin and workspace...');
      execSync(`powershell -Command "Copy-Item -Recurse -Force -Path '${srcSkills}\\*' -Destination '${targetPluginSkills}'"`, { stdio: 'inherit' });
      execSync(`powershell -Command "Copy-Item -Recurse -Force -Path '${srcSkills}\\*' -Destination '${targetWorkspaceSkills}'"`, { stdio: 'inherit' });
      console.log('✅ Skills successfully integrated into Antigravity!');
    }

    // 6. Copy Rules
    const srcRules = path.join(sourceRoot, 'rules');
    const targetPluginRules = path.join(PLUGIN_DIR, 'rules');
    const targetWorkspaceRules = path.join(WORKSPACE_AGENTS_DIR, 'rules');
    fs.mkdirSync(targetPluginRules, { recursive: true });
    fs.mkdirSync(targetWorkspaceRules, { recursive: true });

    if (fs.existsSync(srcRules)) {
      console.log('[*] Copying engineering rules...');
      execSync(`powershell -Command "Copy-Item -Recurse -Force -Path '${srcRules}\\*' -Destination '${targetPluginRules}'"`, { stdio: 'inherit' });
      execSync(`powershell -Command "Copy-Item -Recurse -Force -Path '${srcRules}\\*' -Destination '${targetWorkspaceRules}'"`, { stdio: 'inherit' });
      console.log('✅ Rules successfully integrated!');
    }

    // 7. Create plugin.json
    const pluginMeta = {
      name: "ecc-harness",
      version: "2.0.0",
      description: "ECC v2.0 - Universal AI Agent Harness with 314 skills and 71 specialized agents mapped to Gemini Flash for 100% free execution.",
      author: {
        name: "affaan-m (ECC) & Integrated for Biswajit"
      },
      homepage: "https://github.com/affaan-m/ECC",
      license: "MIT",
      engine: {
        defaultModel: "gemini-flash",
        billing: "free-tier"
      }
    };
    fs.writeFileSync(path.join(PLUGIN_DIR, 'plugin.json'), JSON.stringify(pluginMeta, null, 2), 'utf8');

    // 8. Clean up temp archive
    console.log('[*] Cleaning up temporary download files...');
    try {
      fs.unlinkSync(TEMP_ZIP);
      fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
    } catch (e) {}

    console.log('\n🎉 SUCCESS: ECC v2.0 IS FULLY INTEGRATED INTO ANTIGRAVITY 2.0 WITH GEMINI FLASH ENGINE!');
  } catch (err) {
    console.error('❌ Integration failed:', err.message);
    process.exit(1);
  }
}

main();
