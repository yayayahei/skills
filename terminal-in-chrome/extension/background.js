chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TERMINAL_ACTIVITY' && sender.tab) {
    if (message.status === 'processing') {
      chrome.action.setBadgeText({ text: '...', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800', tabId: sender.tab.id });
    } else if (message.status === 'done') {
      chrome.action.setBadgeText({ text: '✓', tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: sender.tab.id });
    } else if (message.status === 'clear') {
      chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
    }
  }
});
