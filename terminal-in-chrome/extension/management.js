function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

async function loadTerminals() {
  const listEl = document.getElementById('terminalsList');
  const errorEl = document.getElementById('errorMsg');
  
  try {
    const data = await chrome.storage.local.get('terminalPort');
    const port = data.terminalPort || 8989;

    const response = await fetch(`http://localhost:${port}/api/terminals`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    const terminals = await response.json();
    errorEl.style.display = 'none';
    
    if (terminals.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No running terminal instances found.</div>';
      return;
    }
    
    listEl.innerHTML = '';
    
    terminals.forEach(term => {
      const card = document.createElement('div');
      card.className = 'card';
      
      const cpu = typeof term.cpu === 'number' ? term.cpu.toFixed(1) + '%' : 'N/A';
      const mem = typeof term.memory === 'number' ? formatBytes(term.memory) : 'N/A';
      const uptime = typeof term.elapsed === 'number' ? formatUptime(term.elapsed) : 'N/A';
      
      card.innerHTML = `
        <div class="card-header">
          <div class="url-title">${term.url}</div>
          <button class="close-btn" data-url="${term.url}">Close Terminal</button>
        </div>
        <div class="stats">
          <div class="stat-item">
            <span class="stat-label">PID</span>
            <span class="stat-value">${term.pid}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Connected Clients</span>
            <span class="stat-value">${term.clientsCount}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">CPU Usage</span>
            <span class="stat-value">${cpu}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Memory</span>
            <span class="stat-value">${mem}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Uptime</span>
            <span class="stat-value">${uptime}</span>
          </div>
        </div>
      `;
      
      listEl.appendChild(card);
    });
    
    // Add event listeners to close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const url = e.target.getAttribute('data-url');
        if (confirm(`Are you sure you want to close the terminal for ${url}?`)) {
          await killTerminal(url, port);
        }
      });
    });
    
  } catch (err) {
    console.error('Error loading terminals:', err);
    errorEl.textContent = `Error connecting to terminal server: ${err.message}. Is the server running?`;
    errorEl.style.display = 'block';
    listEl.innerHTML = '<div class="empty-state">Could not load terminal instances.</div>';
  }
}

async function killTerminal(url, port) {
  try {
    const response = await fetch(`http://localhost:${port}/api/terminals/${encodeURIComponent(url)}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    // Reload the list
    loadTerminals();
  } catch (err) {
    console.error('Error killing terminal:', err);
    alert(`Failed to close terminal: ${err.message}`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadTerminals();
  
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadTerminals();
  });
  
  // Auto refresh every 5 seconds
  setInterval(loadTerminals, 5000);
});
