const { spawn } = require('child_process');

async function convertWithLibreoffice(inputPath, outputDir, outputFormat) {
  return new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', outputFormat, '--outdir', outputDir, inputPath];
    const proc = spawn('soffice', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve(true);
      else reject(new Error('libreoffice failed: ' + stderr));
    });
  });
}

module.exports = { convertWithLibreoffice };
