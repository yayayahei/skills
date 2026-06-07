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
  const text = frames[animationFrame % frames.length];
  
  // Create breathing color effect (alpha from ~100 to 255)
  const cycle = animationFrame % 8;
  const alpha = cycle <= 4 ? 155 + (cycle * 25) : 155 + ((8 - cycle) * 25);
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
        animationInterval = setInterval(updateAnimation, 250);
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