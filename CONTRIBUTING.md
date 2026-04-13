# Contributing

Thanks for contributing to `lawyer-app`.

## Project Structure

- `backend/` Node/Express API, domain logic, and agent runtime.
- `frontend/` Electron + React desktop application.
- `ordinay-proxy/` optional proxy service.
- `docs/` architecture and design documentation.

## Development Setup

1. Install dependencies:

```bash
npm ci
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix ordinay-proxy ci
```

2. Configure environment:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Run backend:

```bash
npm --prefix backend run start
```

4. Run frontend:

```bash
npm --prefix frontend run electron:dev
```

## Contribution Rules

- Keep changes scoped to one concern per pull request.
- Do not commit secrets, credentials, or local environment files.
- Prefer clear commit messages and include rationale for non-trivial changes.
- Update docs when behavior, API contracts, or architecture changes.
- Preserve backward compatibility where possible, or clearly document breaking changes.

## Pull Request Checklist

- Code builds and runs locally.
- No secrets are introduced.
- Related docs are updated.
- User-visible behavior changes are described.
- Migration notes are included when needed.

## Reporting Issues

Use GitHub issues for bugs and feature requests.

For vulnerabilities, do not open a public issue. Follow [SECURITY.md](./SECURITY.md).
