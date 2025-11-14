const express = require('express');
const multer = require('multer');
const path = require('path');
const { nanoid } = require('nanoid');
const fs = require('fs');
const { convertWithLibreoffice } = require('../lib/libreoffice');
const { createJobDir, safeDeleteDir } = require('../lib/jobManager');
const { checkQuota } = require('../lib/quota');

const router = express.Router();
const upload = multer({ dest: '/tmp/neunovapdf/uploads' });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'anon';
    if (!checkQuota(ip, 10)) return res.status(429).json({ error: 'quota exceeded' });

    if (!req.file) return res.status(400).json({ error: 'file required' });
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const inputPath = path.join(jobDir, req.file.originalname);
    fs.renameSync(req.file.path, inputPath);

    // determine output format (simple mapping)
    const target = (req.body.target || 'pdf').toLowerCase();
    const mapping = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx' };
    const outfmt = mapping[target] || target;

    await convertWithLibreoffice(inputPath, jobDir, outfmt);
    // find produced file
    const files = fs.readdirSync(jobDir).filter(f => f !== path.basename(inputPath));
    const outFile = files.length ? path.join(jobDir, files[0]) : null;
    if (!outFile) throw new Error('output not found');

    res.download(outFile, err => {
      // immediate cleanup
      try { safeDeleteDir(jobDir); } catch(e){}
      if (err) console.error('download error', err);
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
