document.addEventListener('DOMContentLoaded', () => {
  const portInput = document.getElementById('portInput');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // Load current port
  chrome.storage.local.get(['terminalPort'], (result) => {
    if (result.terminalPort) {
      portInput.value = result.terminalPort;
    } else {
      portInput.value = '8989';
    }
  });

  // Save port
  saveBtn.addEventListener('click', () => {
    const port = portInput.value || '8989';
    
    chrome.storage.local.set({ terminalPort: port }, () => {
      // Show status
      statusEl.style.display = 'block';
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 2000);

      // Notify all tabs about the port change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            type: 'UPDATE_PORT', 
            port: port 
          }).catch(() => {
            // Ignore errors for tabs where content script isn't injected
          });
        });
      });
    });
  });
});