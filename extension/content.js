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
      // Validate origin matches current window origin
      if (event.origin && event.origin !== window.location.origin) return;

      const { serverUrl, token } = event.data;
      if (!serverUrl) return;

      // Validate serverUrl matches message origin
      let serverOrigin;
      try {
        serverOrigin = new URL(serverUrl).origin;
      } catch {
        return;
      }

      const expectedOrigin = event.origin || window.location.origin;
      if (serverOrigin !== expectedOrigin) return;

      const cleanUrl = serverUrl.replace(/\/+$/, '');
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          // If already configured, ensure message matches configured server origin
          const stored = await chrome.storage.local.get(['sparkkeep_url']);
          if (stored && stored.sparkkeep_url) {
            try {
              const configuredOrigin = new URL(stored.sparkkeep_url).origin;
              if (configuredOrigin !== expectedOrigin) {
                window.postMessage({
                  type: 'SPARKKEEP_PAIR_ACK',
                  ok: false,
                  error: 'Rejected: Origin does not match configured Sparkkeep server',
                }, '*');
                return;
              }
            } catch {
              // Ignore invalid stored url
            }
          }

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
