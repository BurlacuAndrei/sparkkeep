// Sparkkeep Web Clipper Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    connectionStatus: document.getElementById('connection-status'),
    toggleSettingsBtn: document.getElementById('toggle-settings-btn'),
    captureView: document.getElementById('capture-view'),
    settingsView: document.getElementById('settings-view'),
    pageTitle: document.getElementById('page-title'),
    pageUrl: document.getElementById('page-url'),
    selectionBox: document.getElementById('selection-box'),
    selectionText: document.getElementById('selection-text'),
    captureForm: document.getElementById('capture-form'),
    cardHorizon: document.getElementById('card-horizon'),
    cardTags: document.getElementById('card-tags'),
    cardNote: document.getElementById('card-note'),
    submitBtn: document.getElementById('submit-capture-btn'),
    serverUrlInput: document.getElementById('server-url'),
    serverTokenInput: document.getElementById('server-token'),
    testConnBtn: document.getElementById('test-connection-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    toastBanner: document.getElementById('toast-banner'),
  };

  let activeTab = null;
  let selectedText = '';

  const showToast = (message, type = 'success') => {
    elements.toastBanner.textContent = message;
    elements.toastBanner.className = `toast-banner ${type}`;
    elements.toastBanner.classList.remove('hidden');
    setTimeout(() => {
      elements.toastBanner.classList.add('hidden');
    }, 3000);
  };

  // 1. Load Stored Configuration
  const getConfig = async () => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['sparkkeep_url', 'sparkkeep_token'], (items) => {
          resolve({
            serverUrl: items.sparkkeep_url || '',
            serverToken: items.sparkkeep_token || '',
          });
        });
      } else {
        resolve({
          serverUrl: localStorage.getItem('sparkkeep_url') || '',
          serverToken: localStorage.getItem('sparkkeep_token') || '',
        });
      }
    });
  };

  const saveConfig = async (url, token) => {
    // Normalize URL: remove trailing slash
    const cleanUrl = url.trim().replace(/\/+$/, '');
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(
          { sparkkeep_url: cleanUrl, sparkkeep_token: token.trim() },
          () => resolve(true)
        );
      } else {
        localStorage.setItem('sparkkeep_url', cleanUrl);
        localStorage.setItem('sparkkeep_token', token.trim());
        resolve(true);
      }
    });
  };

  // 2. Check Connection State
  const checkConnection = async (url, token) => {
    if (!url) {
      elements.connectionStatus.textContent = 'Not Paired';
      elements.connectionStatus.className = 'status-pill disconnected';
      return false;
    }

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${url}/api/v1/health`, { method: 'GET', headers });
      if (res.ok) {
        const host = new URL(url).hostname;
        elements.connectionStatus.textContent = host;
        elements.connectionStatus.className = 'status-pill connected';
        return true;
      }
    } catch {
      // Fallback ping
    }

    elements.connectionStatus.textContent = 'Offline';
    elements.connectionStatus.className = 'status-pill disconnected';
    return false;
  };

  // 3. Inspect Active Tab & Selection
  const loadTabInfo = async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        activeTab = tabs[0];
        elements.pageTitle.textContent = activeTab.title || 'Untitled Page';
        elements.pageUrl.textContent = activeTab.url || '';

        // Extract selected text if available
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => window.getSelection().toString(),
          });
          if (results && results[0] && results[0].result) {
            selectedText = results[0].result.trim();
            if (selectedText.length > 0) {
              elements.selectionText.textContent = selectedText;
              elements.selectionBox.classList.remove('hidden');
            }
          }
        } catch {
          // Restricted tabs (chrome://, about:) don't allow script injection
        }
      }
    } else {
      elements.pageTitle.textContent = 'Development Mock Page';
      elements.pageUrl.textContent = 'http://localhost:8080/demo';
    }
  };

  // 4. Toggle Settings View
  elements.toggleSettingsBtn.addEventListener('click', () => {
    const isShowingSettings = !elements.settingsView.classList.contains('hidden');
    if (isShowingSettings) {
      elements.settingsView.classList.add('hidden');
      elements.captureView.classList.remove('hidden');
    } else {
      elements.captureView.classList.add('hidden');
      elements.settingsView.classList.remove('hidden');
    }
  });

  // 5. Save Settings Handlers
  elements.testConnBtn.addEventListener('click', async () => {
    const url = elements.serverUrlInput.value.trim().replace(/\/+$/, '');
    const token = elements.serverTokenInput.value.trim();

    if (!url) {
      showToast('Please enter a server URL', 'error');
      return;
    }

    elements.testConnBtn.textContent = 'Testing...';
    const isOnline = await checkConnection(url, token);
    elements.testConnBtn.textContent = 'Test Connection';

    if (isOnline) {
      showToast('Successfully connected to Sparkkeep!', 'success');
    } else {
      showToast('Could not reach instance. Check URL & network.', 'error');
    }
  });

  elements.saveSettingsBtn.addEventListener('click', async () => {
    const url = elements.serverUrlInput.value.trim();
    const token = elements.serverTokenInput.value.trim();

    await saveConfig(url, token);
    await checkConnection(url, token);
    showToast('Settings saved successfully!');

    // Switch back to capture view after saving
    setTimeout(() => {
      elements.settingsView.classList.add('hidden');
      elements.captureView.classList.remove('hidden');
    }, 600);
  });

  // 6. Submit Capture
  elements.captureForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = await getConfig();
    if (!config.serverUrl) {
      showToast('Please configure your Sparkkeep Server URL first', 'error');
      elements.captureView.classList.add('hidden');
      elements.settingsView.classList.remove('hidden');
      return;
    }

    const title = activeTab ? activeTab.title : elements.pageTitle.textContent;
    const url = activeTab ? activeTab.url : elements.pageUrl.textContent;
    const horizon = elements.cardHorizon.value;
    const tags = elements.cardTags.value
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    const note = elements.cardNote.value.trim();

    // Construct unified text payload
    let fullText = selectedText ? `Quote:\n"${selectedText}"\n\n` : '';
    if (note) fullText += `Note: ${note}\n`;

    const payload = {
      url: url,
      title: title,
      text: fullText.trim() || undefined,
      horizon: horizon,
      tags: tags.length > 0 ? tags : undefined,
    };

    elements.submitBtn.disabled = true;
    elements.submitBtn.innerHTML = '<span>Saving Spark...</span>';

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (config.serverToken) {
        headers['Authorization'] = `Bearer ${config.serverToken}`;
      }

      const res = await fetch(`${config.serverUrl}/api/v1/capture`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        elements.submitBtn.innerHTML = '<span>✓ Captured!</span>';
        elements.submitBtn.style.background = 'var(--accent-emerald)';
        showToast('Spark captured into your inbox!');
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.close) {
            window.close();
          }
        }, 1200);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(`Capture failed: ${data.error || 'HTTP ' + res.status}`, 'error');
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = '<span>Capture Spark</span><span class="btn-kbd">↵ Enter</span>';
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error');
      elements.submitBtn.disabled = false;
      elements.submitBtn.innerHTML = '<span>Capture Spark</span><span class="btn-kbd">↵ Enter</span>';
    }
  });

  // Initialization
  const initialConfig = await getConfig();
  elements.serverUrlInput.value = initialConfig.serverUrl;
  elements.serverTokenInput.value = initialConfig.serverToken;

  const isConnected = await checkConnection(initialConfig.serverUrl, initialConfig.serverToken);
  if (!isConnected && !initialConfig.serverUrl) {
    elements.captureView.classList.add('hidden');
    elements.settingsView.classList.remove('hidden');
  }

  await loadTabInfo();
});
