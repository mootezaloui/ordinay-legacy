# Security Policy

## Supported Versions

Security fixes are applied to the latest maintained version in this repository.

## Reporting A Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Use one of these private channels:

1. GitHub private vulnerability reporting (Security Advisories) for this repository.
2. Direct maintainer contact through repository owner channels.

When reporting, include:

- A clear description of the issue.
- Reproduction steps.
- Impact assessment.
- Any proof-of-concept details needed for validation.

## Response Process

- We aim to acknowledge reports within 72 hours.
- We will validate, triage severity, and determine remediation.
- We may request additional technical details during triage.
- Once fixed, we will publish a coordinated disclosure note when appropriate.

## Secrets Handling

If credentials, API keys, or tokens are exposed:

1. Rotate or revoke the secret immediately.
2. Remove the secret from the current codebase.
3. Rewrite Git history if required.
4. Force-push sanitized history only when all collaborators are aligned.
5. Assume exposed secrets are compromised and treat rotation as mandatory.
