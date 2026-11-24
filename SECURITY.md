# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Reporting a vulnerability

Please report security issues privately by email to **info@ligatrix.com**. Do not open a public issue.

Include:

- a description of the issue and its impact;
- the version or commit you tested;
- steps to reproduce, or a proof of concept;
- any suggested fix or mitigation.

We acknowledge reports within 2 business days, keep you informed while we investigate, and credit you in the release notes
if you wish once a fix is available.

## Deployment note

The server has no built-in authentication. Run it bound to `127.0.0.1` or behind a reverse proxy that authenticates users,
and set `ALLOW_RESET=0` wherever the data matters. See [docs/runbook.md](docs/runbook.md).
