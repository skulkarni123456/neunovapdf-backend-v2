const fs = require('fs');
const path = require('path');

function createJobDir(jobId){
  const dir = path.join('/tmp/neunovapdf', jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeDeleteDir(dir){
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e){}
}

module.exports = { createJobDir, safeDeleteDir };
