# Sparkkeep: Public Launch & Release Checklist

This guide provides a comprehensive checklist to take Sparkkeep live on GitHub, publish official Docker images, and launch to the community.

---

## 1. Pre-Flight Repository Setup

- [x] **License Added:** Standard MIT license present in the root directory.
- [x] **CI Automated:** `.github/workflows/ci.yml` validates frontend builds, Go vet, and cold test runs.
- [x] **Multi-Arch Docker Publishing:** `.github/workflows/docker.yml` builds `linux/amd64` and `linux/arm64` images to GitHub Container Registry (`ghcr.io`).
- [x] **Binary Release Workflow:** `.github/workflows/release.yml` compiles standalone binaries for Linux, macOS, and Windows.
- [x] **Creator License Generator:** `cmd/license-gen` CLI ready to mint keys.

### GitHub Permissions Configuration
1. Go to your repository on GitHub: **Settings > Actions > General**.
2. Under **Workflow permissions**, select **"Read and write permissions"** (required so the GitHub Actions workflows can upload packages to `ghcr.io` and create GitHub Releases).
3. Under **Packages**, ensure the package visibility for `sparkkeep` is set to **Public** so users can pull without authentication (`docker pull ghcr.io/BurlacuAndrei/sparkkeep:latest`).

---

## 2. Launch Day: Tagging & Publishing v1.0.0

When you are ready to publish your first public release:

```sh
# 1. Ensure working tree is clean and on main
git checkout main
git pull

# 2. Tag the release
git tag -a v1.0.0 -m "Sparkkeep v1.0.0 - Self-Hosted Capture & Action Engine"

# 3. Push tag to GitHub
git push origin v1.0.0
```

### What happens automatically:
1. GitHub Actions will trigger `release.yml` to compile Linux, macOS, and Windows binary archives and publish a GitHub Release with auto-generated release notes.
2. GitHub Actions will trigger `docker.yml` to build multi-arch images and tag `ghcr.io/BurlacuAndrei/sparkkeep:1.0.0` and `:latest`.

---

## 3. Commercial Store Setup (Lemon Squeezy / Gumroad)

1. Create a product on [Lemon Squeezy](https://www.lemonsqueezy.com/) (or Gumroad):
   - **Product Name:** Sparkkeep Pro (Lifetime License)
   - **Price:** $49 (or $79 regular)
   - **Type:** Digital Product / License Key
2. **Key Generation options:**
   - **Option A (Manual on order):** Run `go run ./cmd/license-gen -email customer@email.com -tier pro` and send the key.
   - **Option B (Automated via Webhook):** Connect Lemon Squeezy's `order_created` webhook to an AWS Lambda / Cloudflare Worker running the `internal/license` signer to generate and deliver the key instantly.

---

## 4. Community Launch Templates

### 🌟 Hacker News (Show HN)
**Title:** `Show HN: Sparkkeep – Self-hosted AI bookmarking, triage, and Obsidian sync`  
**Body:**
> Hey HN,
> 
> I built Sparkkeep because my bookmark folders and browser tabs always become graveyards of good ideas.
> 
> Sparkkeep is a single-binary, self-hosted web app with an embedded React frontend and SQLite database. You share a link, post, or media, it analyzes and summarizes it into actionable cards, categorizes by horizon, and lets you triage them Kanban-style.
> 
> Key highlights:
> - **Zero-touch onboarding:** Boot the Docker container, visit localhost, and set your password + BYOK API keys (OpenAI, DeepSeek, Local Ollama) directly in the UI. No `.env` wrestling.
> - **Offline & Private:** All data lives in a local SQLite file.
> - **Obsidian Sync & Webhooks:** Mirror cards to local Obsidian vaults and trigger webhooks in n8n/Zapier.
> - **Single binary:** Go backend + embedded React SPA.
> 
> GitHub: https://github.com/BurlacuAndrei/sparkkeep
> 
> Would love your feedback on the UX and self-hosted experience!

---

### 🚀 Reddit (r/selfhosted & r/ObsidianMD)
**Title:** `I built Sparkkeep: A zero-touch, self-hosted second brain with native Obsidian sync and BYOK AI`  
**Body:**
> Hi r/selfhosted!
> 
> Most personal knowledge tools either force a $15/month subscription or require setting up Postgres, Redis, and 5 separate Docker containers.
> 
> I wanted something that felt like a native, lightweight utility:
> - **1 container, 1 SQLite volume.**
> - **Setup wizard on first boot:** Put in your own OpenAI/Ollama keys right in the UI.
> - **Obsidian Vault Sync:** Cards automatically mirror to your Obsidian notes folder with full YAML frontmatter.
> - **Outbound Webhooks:** Ping your Home Assistant or n8n instances when you capture an idea.
> 
> Try it with one command:
> `docker run -p 8080:8080 -v sparkkeep_data:/data ghcr.io/BurlacuAndrei/sparkkeep:latest`
> 
> Code is open on GitHub: https://github.com/BurlacuAndrei/sparkkeep
