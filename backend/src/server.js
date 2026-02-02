const app = require('./app');
const { port } = require('./config/app.config');

// Named-pipe / Unix-socket mode (used by Electron to avoid opening a TCP port
// and triggering Windows Firewall prompts).  Falls back to TCP for standalone
// development or any context where ORDINAY_PIPE is not set.
const pipePath = process.env.ORDINAY_PIPE;

if (pipePath) {
  app.listen(pipePath, () => {
    console.log(`Ordinay backend listening on pipe ${pipePath}`);
  });
} else {
  app.listen(port, () => {
    console.log(`Ordinay backend listening on port ${port}`);
  });
}
