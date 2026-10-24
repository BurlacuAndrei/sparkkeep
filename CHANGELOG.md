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

## [0.9.2] - 2026-10-24

### Added
- Spanish, Brazilian Portuguese, French, and German interface languages. All
  six locales (English, Romanian, Spanish, Portuguese (Brasil), French, German)
  now ship complete catalogs.
- Per-locale plural rules: Romanian one/few/other, Portuguese (Brasil) and
  French one for counts up to 1 including 0, matching `Intl.PluralRules`.
- Regional browser-language detection: `pt` → `pt-BR`, `de-AT` → `de`,
  `es-419` → `es`, `fr-CA` → `fr`.
- Plural-aware counts across scheduler, triage, and card age surfaces.

## [0.9.1] - 2026-10-23

### Added
- Multilanguage UI: English and Romanian, with a language switcher in
  Settings → Appearance and browser-language detection on first run.
- Localized app shell, cards, research, digest, playbooks, and settings
  surfaces, with plural-aware counts and `Intl` date/number formatting.

## [0.9.0] - 2026-10-14

First release: self-hosted capture and action engine with multi-channel
ingestion, LLM triage, kanban/triage-deck UI, deterministic research playbooks,
and embedded SQLite storage.
