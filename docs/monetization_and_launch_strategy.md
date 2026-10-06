# Sparkkeep: Go-to-Market & Launch Strategy

This document outlines the strategic roadmap to take Sparkkeep from its current state to a 10/10 self-hosted product, and details the tiered monetization strategy.

## 1. Authentication Strategy for Self-Hosted

When building a self-hosted tool, introducing external dependencies (like Clerk or Auth0) ruins the privacy proposition and creates single points of failure. While **Authelia** or **Authentik** are great, they require users to understand reverse proxies and multi-container Docker setups, which creates high friction.

**The Solution: In-House, Single-Binary Auth**
To keep the "deploy anywhere in 1 minute" magic, build lightweight auth directly into the Go binary. 
- **Implementation:** 
  - Add a `users` table to SQLite (even if it just holds 1 user for now).
  - On the very first boot, if the table is empty, redirect the web UI to a `/setup` route.
  - The user creates an admin account (email + password, hashed with `bcrypt`).
  - Use simple HTTP-only cookies with JWT or a session token stored in SQLite for authentication.
- **Why?** It guarantees Sparkkeep remains a zero-dependency, single-container deployment.

---

## 2. Roadmap: Making Self-Hosted 10/10

Before marketing the product, the core self-hosted experience must be flawless.

### Phase 1: The "Zero-Touch" Experience
- [ ] **In-House Auth:** (Described above). Secure the API routes.
- [ ] **Onboarding Wizard (UI):** A beautiful first-run screen where the user:
  1. Creates their account.
  2. Enters their OpenAI / Anthropic API keys (saving them to the DB instead of requiring `.env` editing).
- [ ] **Technical Debt Resolution:**
  - Implement cursor/offset pagination for the `GET /api/v1/cards` endpoint.
  - Resolve the SQLite `IN` clause limitation to prevent crashes on large datasets.

### Phase 2: Frictionless Deployment
- [ ] **Docker Perfection:** Ensure the `Dockerfile` and `docker-compose.yml` use minimal Alpine/Scratch images and have clear volume mounts for the SQLite DB.
- [ ] **1-Click Deploy Buttons:** Create templates for platforms like [Railway](https://railway.app/), [Render](https://render.com/), and [PikaPods](https://www.pikapods.com/). This allows non-technical users to deploy Sparkkeep without using the CLI.

---

## 3. The Monetization Tiers

### Tier 1: Open Core (Free)
This is the growth engine. It is completely free and open-source.
- **Features:** Core capture, Kanban triage, standard LLM analysis, standard search.
- **Target Audience:** Developers, hobbyists, privacy advocates.
- **Goal:** Build community, generate word-of-mouth, get free QA/bug reports.

### Tier 2: Pro License (One-Time Payment, e.g., $49)
A premium license for power users.
- **How it works:** You sell a license key via a platform like [Lemon Squeezy](https://www.lemonsqueezy.com/). The user enters the key in their self-hosted Sparkkeep settings. The Go backend pings a simple license-verification API you run (or uses cryptographic validation) to unlock features in the UI.
- **Features to build for this tier:**
  - Advanced Integrations (2-way sync to Notion, Obsidian, or GitHub).
  - Scheduled "Deep Research" agents that run overnight.
  - Webhooks and API access (letting users build their own automations).
  - Advanced search (e.g., local vector/semantic search integration).

### Tier 3: Managed Hosting (e.g., $8/month)
For users who say: *"I love this, but I don't know what Docker is and I don't want to manage a server."*

**How this actually works technically:**
You do **not** rewrite Sparkkeep into a multi-tenant SaaS. That is a massive architectural shift. Instead, you become a specialized hosting provider for your own app.
1. **The Storefront:** You build a separate, simple marketing website (`sparkkeep.com`) with a Stripe checkout.
2. **The Infrastructure:** When a user pays, your backend runs a script (e.g., using Terraform, Ansible, or a simple Docker orchestrator on a large VPS) to spin up a **brand new, isolated Docker container** specifically for them.
3. **The Deployment:** They get their own instance (e.g., `https://alice.sparkkeep.com`).
4. **The Economics:** They pay you $8/mo for hosting. They still plug in their own OpenAI key into their instance. Your cost to host a lightweight Go container is pennies, resulting in high margins, and you never have to manage their LLM costs or data mixing.

---

## 4. Execution Plan Summary

1. **Now:** Focus entirely on Phase 1 (Auth + Setup UI + Tech Debt).
2. **Next:** Launch Tier 1 (Free) on GitHub, HackerNews, and Reddit (r/selfhosted) to build an audience.
3. **Later:** Introduce Tier 2 features and start selling license keys.
4. **Final:** Once you have demand and people asking for easier hosting, set up the Tier 3 infrastructure and marketing site.
