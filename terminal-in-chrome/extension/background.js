const processingTabs = new Set();
let animationInterval = null;
let animationFrame = 0;

function updateAnimation() {
  if (processingTabs.size === 0) {
    clearInterval(animationInterval);
    animationInterval = null;
    return;
  }
  
  const frames = ['...', ' ..', '. .', '.. '];
  const text = frames[Math.floor(animationFrame / 2) % frames.length];
  
  // sine wave for smooth breathing (0 to 1)
  const factor = (Math.sin(animationFrame / 10 * Math.PI * 2) + 1) / 2;
  const alpha = Math.floor(50 + 205 * factor); // 50 to 255
  const color = [3, 169, 244, alpha];
  
  processingTabs.forEach(tabId => {
    chrome.action.setBadgeText({ text: text, tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
  });
  
  animationFrame++;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TERMINAL_ACTIVITY' && sender.tab) {
    const tabId = sender.tab.id;
    if (message.status === 'processing') {
      processingTabs.add(tabId);
      if (!animationInterval) {
        animationInterval = setInterval(updateAnimation, 100);
      }
      if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#FFFFFF', tabId: tabId });
    } else if (message.status === 'waiting') {
      processingTabs.delete(tabId);
      chrome.action.setBadgeText({ text: '!', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#F44336', tabId: tabId });
      if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#FFFFFF', tabId: tabId });
    } else if (message.status === 'clear') {
      processingTabs.delete(tabId);
      chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
  }
});