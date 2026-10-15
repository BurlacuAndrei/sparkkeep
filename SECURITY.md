# Security Policy

## Reporting Security Issues

We take the security of Sparkkeep seriously. If you discover a security vulnerability, please do **not** open a public issue.

Instead, please send an email to the repository owner or submit a private security advisory through GitHub:
- **GitHub Private Vulnerability Reporting:** Navigate to the **Security** tab of this repository and click **Report a vulnerability**.

### What to include in your report:
- A description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Any proposed remediation or patches if available.

We will acknowledge receipt within 48 hours and work with you on a patch and responsible disclosure timeline.

## Deployment Hardening

Sparkkeep is a single-user app. The supported security model is a single shared
passphrase served over TLS behind a reverse proxy:

- Set `SPARKKEEP_AUTH_TOKEN` (or a master passphrase during first-run setup)
  before exposing the port. An unset credential leaves the dashboard and API
  open to anyone who can reach the port.
- Terminate TLS at a reverse proxy and never expose the app port directly to the
  internet.
- Keep the database, `SPARKKEEP_UPLOAD_DIR`, and cookie state on trusted storage.
