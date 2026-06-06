const express = require('express');
const expressWs = require('express-ws');
const os = require('os');
const pty = require('node-pty');
const cors = require('cors');

const app = express();
expressWs(app);
app.use(cors()); // Allow connections from any website

let defaultShell = '/bin/bash';
if (os.platform() === 'win32') {
  defaultShell = 'powershell.exe';
} else {
  try {
    defaultShell = os.userInfo().shell || '/bin/bash';
  } catch (e) {
    defaultShell = '/bin/bash';
  }
}
const shell = process.env.SHELL || defaultShell;

// Maintain a global history for persistence across page reloads
let terminalHistory = '';

app.ws('/terminal', (ws, req) => {
  console.log('[WebSocket] Terminal client connected from extension');
  
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env
  });

  // Strip OSC queries from history to prevent garbage input on reload
  const cleanHistory = terminalHistory
    .replace(/\x1b\]1[01];\?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[>?]*[0-9]*c/g, '')
    .replace(/\x1b\[6n/g, '');
    
  ws.send(cleanHistory);

  ptyProcess.onData((data) => {
    terminalHistory += data;
    // Keep history from getting too large (e.g., keep last 100k chars)
    if (terminalHistory.length > 100000) {
      terminalHistory = terminalHistory.slice(terminalHistory.length - 100000);
    }
    if (ws.readyState === 1) {
      ws.send(data);
    }
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'resize') {
        ptyProcess.resize(data.cols, data.rows);
      }
    } catch (e) {
      // If it's not JSON, it's terminal input
      ptyProcess.write(msg);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Terminal client disconnected');
    ptyProcess.kill();
  });
});

const PORT = process.env.PORT || process.env.WEB_TERMINAL_PORT || 8989;
app.listen(PORT, () => {
  console.log(`Server listening on ws://localhost:${PORT}/terminal`);
});
