const app = require('./app');
const { port } = require('./config/app.config');

app.listen(port, () => {
  console.log(`Organia backend listening on port ${port}`);
});
