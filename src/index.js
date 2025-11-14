// Express core
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const path = require('path');
const fs = require('fs');

// Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

// Routes
const convertRoutes = require('./routes/convert');
const imageRoutes = require('./routes/images');
const contactRoutes = require('./routes/contact');
const pdfRoutes = require('./routes/pdf');

const app = express();

/* -------------------------------
   FIX 1: Enable CORS globally
-------------------------------- */
app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  })
);

/* -------------------------------
   FIX 2: Increase upload size
-------------------------------- */
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

/* -------------------------------
   Logging
-------------------------------- */
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const accessLogStream = rfs.createStream('access.log', {
  interval: '1d',
  path: logDir,
});

app.use(morgan('combined', { stream: accessLogStream }));

/* -------------------------------
   FIX 3: Health check route
-------------------------------- */
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

/* -------------------------------
   Swagger Documentation
-------------------------------- */
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "NeunovaPDF Backend API",
      version: "1.0.0",
      description: "Documentation for all PDF & Image processing tools",
    },
  },
  apis: ["./routes/*.js"], // <-- swagger annotations inside routes
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Swagger UI Path = https://neunovapdf-backend-v2.onrender.com/api-docs

/* -------------------------------
   API Routes
-------------------------------- */
app.use('/api/convert', convertRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/pdf', pdfRoutes);

/* -------------------------------
   Static Files
-------------------------------- */
app.use(
  '/policies',
  express.static(path.join(__dirname, '..', '..', 'docs', 'policies'))
);

app.use('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'public', 'sitemap.xml'));
});

app.use('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'public', 'robots.txt'));
});

/* -------------------------------
   Start Server
-------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
