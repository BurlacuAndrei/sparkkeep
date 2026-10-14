// Sparkkeep Web Clipper - Content Script & Magic Connect Handshake

(function() {
  // Listen for handshake from Sparkkeep Web Application
  window.addEventListener('message', async (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;

    // 1. Extension Detection Ping
    if (event.data && event.data.type === 'SPARKKEEP_EXTENSION_PING') {
      window.postMessage({
        type: 'SPARKKEEP_EXTENSION_PONG',
        version: '1.0.0',
        installed: true
      }, '*');
      return;
    }

    // 2. Magic Pairing Handshake
    if (event.data && event.data.type === 'SPARKKEEP_PAIR_EXTENSION') {
      const { serverUrl, token } = event.data;
      if (!serverUrl) return;

      const cleanUrl = serverUrl.replace(/\/+$/, '');
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({
            sparkkeep_url: cleanUrl,
            sparkkeep_token: token || '',
          });

          window.postMessage({
            type: 'SPARKKEEP_PAIR_ACK',
            ok: true,
            serverUrl: cleanUrl,
          }, '*');
        }
      } catch (err) {
        window.postMessage({
          type: 'SPARKKEEP_PAIR_ACK',
          ok: false,
          error: String(err),
        }, '*');
      }
    }
  });

  // Announce presence on page load so Sparkkeep UI knows extension is installed
  window.postMessage({
    type: 'SPARKKEEP_EXTENSION_READY',
    version: '1.0.0'
  }, '*');
})();
