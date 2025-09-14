const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();
app.use(compression());
app.use(express.static('public'));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OK en puerto ${PORT}`));
