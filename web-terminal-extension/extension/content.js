let terminalVisible = false;
let terminalContainer = null;
let terminal = null;
let fitAddon = null;
let ws = null;
let wsUrl = 'ws://localhost:8989/terminal';
let isResizing = false;
let startY;
let startHeight;

let isFullscreen = false;
let previousHeight = 0;

function injectTerminalHTML() {
  if (document.getElementById('web-terminal-ext-container')) return;

  const container = document.createElement('div');
  container.id = 'web-terminal-ext-container';
  
  const resizer = document.createElement('div');
  resizer.id = 'web-terminal-ext-resizer';
  
  const header = document.createElement('div');
  header.id = 'web-terminal-ext-header';
  
  const title = document.createElement('span');
  title.id = 'web-terminal-ext-title';
  title.innerText = 'Local Terminal';
  
  const closeBtn = document.createElement('button');
  closeBtn.id = 'web-terminal-ext-close';
  closeBtn.innerText = '×';
  closeBtn.addEventListener('click', () => toggleTerminal(false));
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  const host = document.createElement('div');
  host.id = 'web-terminal-ext-host';
  
  container.appendChild(resizer);
  container.appendChild(header);
  container.appendChild(host);
  
  document.body.appendChild(container);
  terminalContainer = container;

  // Setup Resizer
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = container.getBoundingClientRect().height;
    resizer.classList.add('active');
    document.body.style.cursor = 'ns-resize';
  });

  // Double click header to toggle full height
  header.addEventListener('dblclick', () => {
    if (isFullscreen) {
      // Restore previous height
      container.style.height = `${previousHeight}px`;
      isFullscreen = false;
    } else {
      // Save current height and make full screen
      previousHeight = container.getBoundingClientRect().height;
      container.style.height = '100vh';
      isFullscreen = true;
    }
    
    // Save state
    chrome.storage.local.set({ 
      terminalHeight: container.getBoundingClientRect().height,
      terminalIsFullscreen: isFullscreen,
      terminalPreviousHeight: previousHeight
    });

    if (fitAddon && ws && ws.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        fitAddon.fit();
        ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }, 50); // Small delay to allow CSS transition if any
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dy = startY - e.clientY;
    container.style.height = `${startHeight + dy}px`;
    if (fitAddon) fitAddon.fit();
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      
      // If manually resized, we are no longer in fullscreen mode
      isFullscreen = false;
      
      // Save height to local storage
      chrome.storage.local.set({ 
        terminalHeight: container.getBoundingClientRect().height,
        terminalIsFullscreen: false
      });

      if (fitAddon && ws && ws.readyState === WebSocket.OPEN) {
        fitAddon.fit();
        ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    }
  });

  // Restore height
  chrome.storage.local.get(['terminalHeight', 'terminalIsFullscreen', 'terminalPreviousHeight'], (result) => {
    if (result.terminalIsFullscreen !== undefined) {
      isFullscreen = result.terminalIsFullscreen;
    }
    if (result.terminalPreviousHeight) {
      previousHeight = result.terminalPreviousHeight;
    }
    if (result.terminalHeight) {
      container.style.height = `${result.terminalHeight}px`;
    }
  });
}

function initTerminal() {
  if (terminal) return;
  
  const host = document.getElementById('web-terminal-ext-host');
  
  terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 14,
    theme: { background: '#000000', foreground: '#e6edf3' }
  });
  
  // Use the FitAddon constructor we exposed globally via the script injection
  fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  
  terminal.open(host);
  
  setTimeout(() => {
    fitAddon.fit();
    connectWebSocket();
  }, 10);
  
  window.addEventListener('resize', () => {
    if (terminalVisible && fitAddon) {
      fitAddon.fit();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    }
  });
}

function connectWebSocket() {
  // Use origin + pathname as the unique identifier for the terminal instance
  const pageUrl = encodeURIComponent(window.location.origin + window.location.pathname);
  const connectUrl = `${wsUrl}?url=${pageUrl}`;
  ws = new WebSocket(connectUrl);
  
  ws.onopen = () => {
    console.log('[WebTerminal] Connected to local server');
    ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    
    terminal.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  };
  
  ws.onmessage = (event) => {
    if (event.data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => terminal.write(reader.result);
      reader.readAsText(event.data);
    } else {
      terminal.write(event.data);
    }
  };
  
  ws.onclose = () => {
    console.log('[WebTerminal] Disconnected');
    terminal.write(`\r\n\x1b[31m[Connection Closed] Make sure local server is running on ${wsUrl}\x1b[0m\r\n`);
    if (terminalVisible) {
      setTimeout(connectWebSocket, 3000);
    }
  };
}

function toggleTerminal(show) {
  if (!terminalContainer) injectTerminalHTML();
  
  terminalVisible = show !== undefined ? show : !terminalVisible;
  chrome.storage.local.set({ terminalVisible });
  
  if (terminalVisible) {
    terminalContainer.classList.add('show');
    if (!terminal) {
      initTerminal();
    } else {
      setTimeout(() => {
        fitAddon.fit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
        }
        terminal.focus();
      }, 50);
    }
  } else {
    terminalContainer.classList.remove('show');
  }
}

// Listen for keyboard shortcuts (Ctrl+` or Cmd+j)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey && e.key === '`') || (e.metaKey && e.key === 'j')) {
    e.preventDefault();
    toggleTerminal();
  }
});

// Restore state on load
chrome.storage.local.get(['terminalVisible', 'terminalPort'], (result) => {
  if (result.terminalPort) {
    wsUrl = `ws://localhost:${result.terminalPort}/terminal`;
  }
  if (result.terminalVisible) {
    toggleTerminal(true);
  }
});

// Listen for messages from background script or popup to update port
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_PORT' && message.port) {
    wsUrl = `ws://localhost:${message.port}/terminal`;
    if (ws) {
      ws.close(); // Will auto-reconnect via onclose handler
    }
  }
});
