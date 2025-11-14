const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  const { name, email, message } = req.body;
  console.log('Contact form:', { name, email, message });
  // In production: send email or store in DB.
  res.json({ ok: true, message: 'Contact received' });
});

module.exports = router;
