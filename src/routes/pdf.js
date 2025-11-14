const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const { createJobDir, safeDeleteDir } = require('../lib/jobManager');
const { checkQuota } = require('../lib/quota');
const { spawn } = require('child_process');
const archiver = require('archiver');

const router = express.Router();
const upload = multer({ dest: '/tmp/neunovapdf/uploads' });

// Merge PDFs
router.post('/merge', upload.array('files'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 20)) return res.status(429).json({ error: 'quota exceeded' });

    if (!req.files || req.files.length < 2) return res.status(400).json({ error: 'upload at least 2 pdf files' });
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const mergedPdf = await PDFDocument.create();
    for (const f of req.files){
      const bytes = fs.readFileSync(f.path);
      const pdf = await PDFDocument.load(bytes);
      const copied = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copied.forEach(p => mergedPdf.addPage(p));
    }
    const outBytes = await mergedPdf.save();
    const outPath = path.join(jobDir, 'merged.pdf');
    fs.writeFileSync(outPath, outBytes);
    res.download(outPath, 'merged.pdf', err => { safeDeleteDir(jobDir); });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Split PDF - extract pages into separate files (zipped)
router.post('/split', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 20)) return res.status(429).json({ error: 'quota exceeded' });

    if (!req.file) return res.status(400).json({ error: 'file required' });
    const bytes = fs.readFileSync(req.file.path);
    const pdf = await PDFDocument.load(bytes);
    const num = pdf.getPageCount();
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const outFiles = [];
    for (let i=0;i<num;i++){
      const doc = await PDFDocument.create();
      const [copied] = await doc.copyPages(pdf, [i]);
      doc.addPage(copied);
      const out = await doc.save();
      const p = path.join(jobDir, `page-${i+1}.pdf`);
      fs.writeFileSync(p, out);
      outFiles.push(p);
    }
    // create zip
    const outZip = path.join(jobDir, 'pages.zip');
    const output = fs.createWriteStream(outZip);
    const archive = archiver('zip');
    archive.pipe(output);
    outFiles.forEach(f=> archive.file(f, { name: path.basename(f) }));
    await archive.finalize();
    output.on('close', ()=> res.download(outZip, 'pages.zip', ()=> safeDeleteDir(jobDir)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Rotate PDF (angle in degrees, page indices optional)
router.post('/rotate', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 20)) return res.status(429).json({ error: 'quota exceeded' });
    const angle = parseInt(req.body.angle||'90',10);
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const bytes = fs.readFileSync(req.file.path);
    const pdf = await PDFDocument.load(bytes);
    const num = pdf.getPageCount();
    for (let i=0;i<num;i++){
      const page = pdf.getPage(i);
      page.setRotation({ angle: (page.getRotation().angle + angle) % 360 });
    }
    const out = await pdf.save();
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const outPath = path.join(jobDir, 'rotated.pdf');
    fs.writeFileSync(outPath, out);
    res.download(outPath, 'rotated.pdf', ()=> safeDeleteDir(jobDir));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Compress PDF using ghostscript (gs)
router.post('/compress', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 20)) return res.status(429).json({ error: 'quota exceeded' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const inPath = req.file.path;
    const outPath = path.join(jobDir, 'compressed.pdf');
    // ghostscript command
    const args = ['-sDEVICE=pdfwrite','-dCompatibilityLevel=1.4','-dPDFSETTINGS=/ebook','-dNOPAUSE','-dQUIET','-dBATCH',`-sOutputFile=${outPath}`, inPath];
    const gs = spawn('gs', args);
    gs.on('close', code => {
      if (code === 0) res.download(outPath, 'compressed.pdf', ()=> safeDeleteDir(jobDir));
      else res.status(500).json({ error: 'ghostscript failed' });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PDF -> JPG (uses pdftoppm)
router.post('/to-jpg', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 20)) return res.status(429).json({ error: 'quota exceeded' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const inPath = req.file.path;
    const outPrefix = path.join(jobDir, 'page');
    const args = ['-jpeg', inPath, outPrefix];
    const pdftoppm = spawn('pdftoppm', args);
    pdftoppm.on('close', code => {
      if (code !== 0) return res.status(500).json({ error: 'pdftoppm failed' });
      // zip results
      const outZip = path.join(jobDir, 'images.zip');
      const output = fs.createWriteStream(outZip);
      const archive = archiver('zip');
      archive.pipe(output);
      const files = fs.readdirSync(jobDir).filter(f=> f.startsWith('page') && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('-1.jpg')));
      files.forEach(f=> archive.file(path.join(jobDir,f), { name: f }));
      archive.finalize();
      output.on('close', ()=> res.download(outZip, 'images.zip', ()=> safeDeleteDir(jobDir)));
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// JPG -> PDF
router.post('/from-jpg', upload.array('files'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 50)) return res.status(429).json({ error: 'quota exceeded' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'files required' });
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const pdfDoc = await PDFDocument.create();
    for (const f of req.files){
      const imgBytes = fs.readFileSync(f.path);
      const img = await pdfDoc.embedJpg(imgBytes).catch(async ()=> await pdfDoc.embedPng(imgBytes));
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x:0, y:0, width: img.width, height: img.height });
    }
    const out = await pdfDoc.save();
    const outPath = path.join(jobDir, 'from-images.pdf');
    fs.writeFileSync(outPath, out);
    res.download(outPath, 'from-images.pdf', ()=> safeDeleteDir(jobDir));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Protect PDF (add password) using qpdf
router.post('/protect', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 20)) return res.status(429).json({ error: 'quota exceeded' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const password = req.body.password || 'secret';
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const outPath = path.join(jobDir, 'protected.pdf');
    const args = ['--encrypt', password, password, '256', '--', req.file.path, outPath];
    const qpdf = spawn('qpdf', args);
    qpdf.on('close', code => {
      if (code === 0) res.download(outPath, 'protected.pdf', ()=> safeDeleteDir(jobDir));
      else res.status(500).json({ error: 'qpdf failed' });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Unlock PDF (remove password) using qpdf
router.post('/unlock', upload.single('file'), async (req, res) => {
  try {
    const ip = req.ip || 'anon';
    if (!checkQuota(ip, 20)) return res.status(429).json({ error: 'quota exceeded' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const password = req.body.password || '';
    const jobId = nanoid();
    const jobDir = createJobDir(jobId);
    const outPath = path.join(jobDir, 'unlocked.pdf');
    const args = ['--password=' + password, '--decrypt', req.file.path, outPath];
    const qpdf = spawn('qpdf', args);
    qpdf.on('close', code => {
      if (code === 0) res.download(outPath, 'unlocked.pdf', ()=> safeDeleteDir(jobDir));
      else res.status(500).json({ error: 'qpdf failed' });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
