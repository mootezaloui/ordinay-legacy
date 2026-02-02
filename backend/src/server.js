const app = require("./app");
const { port } = require("./config/app.config");

// Named-pipe / Unix-socket mode (used by Electron to avoid opening a TCP port
// and triggering Windows Firewall prompts).  Falls back to TCP for standalone
// development or any context where ORDINAY_PIPE is not set.
const pipePath = process.env.ORDINAY_PIPE;
const httpPort = parseInt(process.env.PORT || "3000", 10);

if (pipePath) {
  // In Electron mode: listen on BOTH pipe (for IPC) and HTTP port (for SSE streaming)
  app.listen(pipePath, () => {
    console.log(`Ordinay backend listening on pipe ${pipePath}`);
  });

  // Also start HTTP server for streaming endpoints
  app.listen(httpPort, "127.0.0.1", () => {
    console.log(
      `Ordinay backend also listening on HTTP port ${httpPort} (for streaming)`,
    );
  });
} else {
  app.listen(port, () => {
    console.log(`Ordinay backend listening on port ${port}`);
  });
}
