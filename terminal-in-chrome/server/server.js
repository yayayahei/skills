const express = require('express');
const expressWs = require('express-ws');
const os = require('os');
const pty = require('node-pty');
const cors = require('cors');
const url = require('url');
const pidusage = require('pidusage');

const app = express();
expressWs(app);
app.use(cors()); // Allow connections from any website
app.use(express.json());

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

// Store terminal instances by URL
// { url: { ptyProcess, history, clients: Set<ws> } }
const terminalInstances = new Map();

app.ws('/terminal', (ws, req) => {
  const query = url.parse(req.url, true).query;
  const pageUrl = query.url || 'default';
  const theme = query.theme || 'dark';
  const cwd = query.cwd || process.env.HOME;
  const initCmd = query.cmd || '';

  console.log(`[WebSocket] Terminal client connected for URL: ${pageUrl}`);

  let instance = terminalInstances.get(pageUrl);

  if (!instance) {
    // Create new terminal instance for this URL
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd,
      env: { ...process.env, COLORFGBG: theme === 'light' ? '15;0' : 'default' }
    });

    instance = {
      ptyProcess,
      history: '',
      clients: new Set()
    };

    terminalInstances.set(pageUrl, instance);

    if (initCmd) {
      // Small delay to ensure shell is ready before writing command
      setTimeout(() => {
        ptyProcess.write(`${initCmd}\r`);
      }, 500);
    }

    ptyProcess.onData((data) => {
      instance.history += data;
      // Keep history from getting too large
      if (instance.history.length > 100000) {
        instance.history = instance.history.slice(instance.history.length - 100000);
      }
      
      // Broadcast to all clients on this URL
      instance.clients.forEach(clientWs => {
        if (clientWs.readyState === 1) {
          clientWs.send(data);
        }
      });
    });
  }

  // Add this client to the instance
  instance.clients.add(ws);

  // Send history to new client
  const cleanHistory = instance.history
    .replace(/\x1b\]1[01];\?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[>?]*[0-9]*c/g, '')
    .replace(/\x1b\[6n/g, '');
    
  ws.send(cleanHistory);

  ws.on('message', (msg) => {
    try {
      // JSON.parse successfully parses numbers (like "1"), so we must check if it's an object
      const data = JSON.parse(msg);
      if (data && typeof data === 'object' && data.type === 'resize') {
        instance.ptyProcess.resize(data.cols, data.rows);
        return;
      }
    } catch (e) {
      // Ignore parse errors (regular terminal input)
    }
    // If we didn't return, it's terminal input
    instance.ptyProcess.write(msg);
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Terminal client disconnected from URL: ${pageUrl}`);
    instance.clients.delete(ws);

    // We no longer kill the process here.
    // The terminal will persist even if all clients disconnect.
    // It will only be cleared when the server is restarted.
  });
});

// API endpoint to get terminal instances
app.get('/api/terminals', async (req, res) => {
  const instances = [];

  for (const [pageUrl, instance] of terminalInstances.entries()) {
    try {
      const stats = await pidusage(instance.ptyProcess.pid);
      instances.push({
        url: pageUrl,
        pid: instance.ptyProcess.pid,
        clientsCount: instance.clients.size,
        cpu: stats.cpu, // percentage (from 0 to 100*vcore)
        memory: stats.memory, // bytes
        elapsed: stats.elapsed, // ms since process start
        timestamp: stats.timestamp // ms since epoch
      });
    } catch (e) {
      console.error(`Error getting stats for pid ${instance.ptyProcess.pid}:`, e);
      instances.push({
        url: pageUrl,
        pid: instance.ptyProcess.pid,
        clientsCount: instance.clients.size,
        cpu: 0,
        memory: 0,
        error: e.message
      });
    }
  }

  res.json(instances);
});

// API endpoint to kill a terminal instance
app.delete('/api/terminals/:url', (req, res) => {
  const targetUrl = decodeURIComponent(req.params.url);
  const instance = terminalInstances.get(targetUrl);

  if (!instance) {
    return res.status(404).json({ error: 'Terminal instance not found' });
  }

  try {
    // Notify clients that the terminal is being closed
    instance.clients.forEach(clientWs => {
      if (clientWs.readyState === 1) {
        clientWs.send('\r\n\r\n\x1b[31m[Server] Terminal instance killed by management console.\x1b[0m\r\n');
        clientWs.close();
      }
    });

    // Kill the process
    instance.ptyProcess.kill();

    // Remove from map
    terminalInstances.delete(targetUrl);

    res.json({ success: true, message: 'Terminal instance killed' });
  } catch (e) {
    console.error(`Error killing terminal instance for ${targetUrl}:`, e);
    res.status(500).json({ error: 'Failed to kill terminal instance' });
  }
});

const PORT = process.env.PORT || process.env.WEB_TERMINAL_PORT || 8989;
app.listen(PORT, () => {
  console.log(`Server listening on ws://localhost:${PORT}/terminal`);
});
