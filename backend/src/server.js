const app = require('./app');
const { port } = require('./config/app.config');

app.listen(port, () => {
  console.log(`Ordinay backend listening on port ${port}`);
});
