# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Harden authentication: login throttling, opaque HttpOnly session cookies
  (no credential in query strings), and the Secure cookie flag behind TLS.

### Changed
- Session cookies now expire after 30 days instead of 365 (user-visible: you
  will need to sign in again sooner).

## [0.9.0] - 2026-10-14

First release: self-hosted capture and action engine with multi-channel
ingestion, LLM triage, kanban/triage-deck UI, deterministic research playbooks,
and embedded SQLite storage.
