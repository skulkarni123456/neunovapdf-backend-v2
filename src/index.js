const express = require('express');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const path = require('path');

const convertRoutes = require('./routes/convert');
const imageRoutes = require('./routes/images');
const contactRoutes = require('./routes/contact');
const pdfRoutes = require('./routes/pdf');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// logging
const logDir = path.join(__dirname, '..', 'logs');
const fs = require('fs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const accessLogStream = rfs.createStream('access.log', { interval: '1d', path: logDir });
app.use(morgan('combined', { stream: accessLogStream }));

app.use('/api/convert', convertRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/pdf', pdfRoutes);

// static placeholders
app.use('/policies', express.static(path.join(__dirname, '..', '..', 'docs', 'policies')));
app.use('/sitemap.xml', (req,res)=> res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'public', 'sitemap.xml')));
app.use('/robots.txt', (req,res)=> res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'public', 'robots.txt')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));
