# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-24

### Added

- Request intake for purchase approvals, supplier onboarding and access requests, validated by a shared module
  (`src/domain/validation.mjs`), with money stored as integer cents.
- Workflow state machine (`new`, `in_review`, `approved`, `rejected`, `done`) with guards: a rejection needs a comment and a
  requester cannot decide on their own request.
- Approvals that record approver, comment and time, and an activity log entry for every change.
- Request list with search, state and type filters, and sorting by date, amount or priority.
- Dashboard with open requests, average time to approval, approval rate, approved spend, a requests-by-state SVG bar chart,
  aging open requests and recent activity.
- Handover export: one JSON bundle with format, schema version, schema description, summary, requests and log.
- Zero-dependency Node.js server (`server.mjs`) with a JSON API, atomic JSON file store, queued writes and restricted
  static serving with a Content Security Policy.
- Local demo mode when `index.html` is opened from disk, through a checked-in classic bundle (`npm run bundle`).
- `npm run check-store` integrity check for stores and handover bundles.
- Seed data of twelve requests for Corvane Supply Co., a fictional distributor used in this demo.
- 88 tests with `node:test`, a whitespace lint, and CI on Node.js 20 and 22.
- Architecture notes and an operations runbook in `docs/`.

[Unreleased]: https://github.com/Ligatrix/ligatrix-demo-portal/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Ligatrix/ligatrix-demo-portal/releases/tag/v1.0.0
