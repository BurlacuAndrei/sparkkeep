# ⚡ Sparkkeep Web Clipper Extension (Manifest V3)

Official browser extension for **Sparkkeep**, enabling 1-click clipping of articles, web pages, and highlighted quotes directly into your self-hosted instance.

---

## 🚀 Features

- **1-Click Web Clipping:** Captures page title, canonical URL, and meta summary instantly.
- **Quote & Text Highlighting:** Select any text on a page to save it as an indented quote block.
- **Horizon & Tagging In-Popup:** Choose triage horizon (`Short-term`, `Now`, `Long-term`) and add tags (`#ai`, `#read`).
- **Context Menus:** Right-click any page, link, or highlighted text $\rightarrow$ *"Save to Sparkkeep"*.
- **Magic Connect Handshake:** Pair the extension to your instance with 1 click directly from the Sparkkeep web dashboard.

---

## 🛠️ How to Install (Developer / Unpacked Mode)

### Google Chrome / Brave / Edge / Arc:
1. Open your browser and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in top right).
3. Click **Load unpacked**.
4. Select the `extension/` folder inside this repository.
5. The **⚡ Sparkkeep Web Clipper** icon will appear in your extensions toolbar!

### Mozilla Firefox:
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file inside the `extension/` directory.

---

## 🔗 How to Connect to Your Sparkkeep Instance

### Method A: Magic Connect (Recommended)
1. Open your self-hosted Sparkkeep web app in the browser.
2. Go to **Settings &rarr; Integrations & API**.
3. Under **Official Browser Extension**, click **"1-Click Pair Extension"**.
4. The extension automatically detects your instance URL and auth token!

### Method B: Manual Configuration
1. Click the Sparkkeep extension icon in your toolbar.
2. Click the **⚙️ (Settings)** icon in the top right.
3. Enter your **Server URL** (e.g. `http://localhost:8080` or `https://sparkkeep.my-nas.net`).
4. Enter your **Master Passphrase / Token** (if configured).
5. Click **Test Connection**, then **Save Settings**.
