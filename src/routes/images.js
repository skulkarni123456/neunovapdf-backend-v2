const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const { createJobDir, safeDeleteDir } = require('../lib/jobManager');
const { checkQuota } = require('../lib/quota');

const router = express.Router();
const upload = multer({ dest: '/tmp/neunovapdf/uploads' });

router.post('/resize', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'anon';
    if (!checkQuota(ip, 50)) return res.status(429).json({ error: 'quota exceeded' });

    if (!req.file) return res.status(400).json({ error: 'file required' });
    const mode = req.body.mode || 'fit';
    const w = parseInt(req.body.width, 10) || 800;
    const h = parseInt(req.body.height, 10) || 600;
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const inputPath = path.join(jobDir, req.file.originalname);
    fs.renameSync(req.file.path, inputPath);

    let transformer = sharp(inputPath).rotate();
    if (mode === 'cover') transformer = transformer.resize(w, h, { fit: 'cover' });
    else if (mode === 'contain') transformer = transformer.resize(w, h, { fit: 'contain', background: { r:255,g:255,b:255 }});
    else if (mode === 'crop') transformer = transformer.resize(w, h, { fit: 'cover', position: 'centre' });
    else if (mode === 'pad') transformer = transformer.resize(w, h, { fit: 'contain', background: { r:255,g:255,b:255 }});
    else transformer = transformer.resize(w, h, { fit: 'inside' });

    const outPath = path.join(jobDir, 'resized.jpg');
    await transformer.toFile(outPath);
    res.download(outPath, 'resized.jpg', err => {
      try { safeDeleteDir(jobDir); } catch(e){}
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
