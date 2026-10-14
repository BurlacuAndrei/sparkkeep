// Sparkkeep Web Clipper - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  // Set up context menus
  chrome.contextMenus.create({
    id: 'sparkkeep-save-page',
    title: 'Save Page to Sparkkeep',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'sparkkeep-save-selection',
    title: 'Save Quote "%s" to Sparkkeep',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'sparkkeep-save-link',
    title: 'Save Link to Sparkkeep',
    contexts: ['link'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const items = await chrome.storage.local.get(['sparkkeep_url', 'sparkkeep_token']);
  const serverUrl = items.sparkkeep_url;
  const token = items.sparkkeep_token;

  if (!serverUrl) {
    chrome.action.openPopup();
    return;
  }

  let payload = {
    url: tab ? tab.url : '',
    title: tab ? tab.title : 'Captured Spark',
  };

  if (info.menuItemId === 'sparkkeep-save-selection' && info.selectionText) {
    payload.text = `Quote:\n"${info.selectionText}"`;
  } else if (info.menuItemId === 'sparkkeep-save-link' && info.linkUrl) {
    payload.url = info.linkUrl;
    payload.title = info.selectionText || info.linkUrl;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${serverUrl}/api/v1/capture`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      chrome.action.setBadgeText({ text: '✓', tabId: tab ? tab.id : undefined });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: tab ? tab.id : undefined });
      }, 2000);
    }
  } catch (err) {
    console.error('Failed to capture context item to Sparkkeep:', err);
  }
});
