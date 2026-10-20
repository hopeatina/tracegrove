# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub's [private vulnerability reporting](https://github.com/hopeatina/tracegrove/security/advisories/new) for this repository.

Include what you found, how to reproduce it, and the tracegrove version you tested (from `npm ls tracegrove`). We will acknowledge your report, keep you updated, and agree on a disclosure date with you once a fix is ready.

## Scope

In scope: anything that could expose a credential or client data that tracegrove handles (secret resolution, redaction, sealed runs, the local UI server, the MCP server), let a flow write where its environment forbids it, or let evidence be altered without `verify-bundle` noticing.

Out of scope: vulnerabilities in the app under test, and findings that need an attacker who already controls your machine or your tracegrove config.

## Supported versions

Tracegrove is in 0.x. Security fixes go into the latest minor release.

How tracegrove handles credentials and data is described in [docs/security.md](docs/security.md).
