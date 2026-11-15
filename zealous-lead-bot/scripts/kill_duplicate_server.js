const { execSync } = require('child_process');

try {
  const out = execSync('wmic process get ProcessId,CommandLine /format:csv', { encoding: 'utf8' });
  const lines = out.split('\n');
  for (const line of lines) {
    if (line.includes('src/server.js') || line.includes('src\\server.js')) {
      const parts = line.trim().split(',');
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(Number(pid)) && Number(pid) !== process.pid) {
        console.log('Killing old server process PID:', pid);
        try {
          execSync(`taskkill /F /PID ${pid}`);
          console.log('Successfully killed PID:', pid);
        } catch (e) {
          console.log('Could not kill PID:', pid, e.message);
        }
      }
    }
  }
} catch (err) {
  console.error('Error finding processes:', err.message);
}
