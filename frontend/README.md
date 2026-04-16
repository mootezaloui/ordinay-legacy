# Ordinay Frontend

![Electron](https://img.shields.io/badge/Desktop-Electron-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/UI-React-61DAFB?logo=react&logoColor=000)
![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Enabled-3178C6?logo=typescript&logoColor=white)

Desktop UI package for Ordinay.

This package contains:

- React renderer application (`src/`)
- Electron main/preload bridge (`electron/`)
- desktop packaging setup (`electron-builder.json`)

## Requirements

- Node.js `20.19+` or `22.12+`
- npm `10+`

## Install

```bash
npm ci
```

## Run

Run renderer only:

```bash
npm run dev
```

Run full desktop app (Vite + Electron):

```bash
npm run electron:dev
```

## Build

Renderer bundle:

```bash
npm run build:renderer
```

Desktop package:

```bash
npm run electron:build
```

Windows-only package:

```bash
npm run electron:build:win
```

Windows-only package without executable resource editing
(works on environments without symlink/admin privileges, but may keep a generic Electron icon):

```bash
npm run electron:build:win:unsigned
```

Unpacked desktop directory:

```bash
npm run electron:build:dir
```

Unpacked desktop directory without executable resource editing:

```bash
npm run electron:build:dir:unsigned
```

## Script Reference

- `dev`: Vite renderer development server.
- `electron:dev`: full desktop development runtime.
- `build:renderer`: TypeScript + Vite production renderer build.
- `electron:build*`: desktop packaging variants.
- `electron:build:win`: release-oriented Windows package (expects permissions required by electron-builder executable editing).
- `electron:build:win:unsigned`: fallback Windows package when local privilege constraints block executable editing.
- `lint`: ESLint checks.
- `preview`: renderer preview server.
- `prepare:node`: bundle Node runtime needed by packaged app.
- `rebuild:backend`: rebuild backend native dependencies for packaging.
- `generate:icons`: regenerate application icons.

## High-Level Layout

```text
frontend/
  electron/       Electron main and preload code
  src/            React app source
    Agent_front/  agent experience and artifacts
    Screens/      route-level screens
    components/   reusable UI building blocks
    contexts/     global state/providers
    services/     API and domain client services
  build/          build-time assets and scripts
  public/         static assets
```

## Integration Notes

- CRUD calls are proxied through Electron IPC in desktop mode.
- Agent stream is consumed through direct HTTP SSE.
- Domain invariants are enforced in backend/database layers.

## Related Documentation

- Root README: [../README.md](../README.md)
- Architecture diagrams: [../docs/ARCHITECTURE_DIAGRAMS.md](../docs/ARCHITECTURE_DIAGRAMS.md)
- App logic use cases: [../docs/APP_LOGIC_USE_CASES.md](../docs/APP_LOGIC_USE_CASES.md)
- Domain model: [../docs/DOMAIN_MODEL.md](../docs/DOMAIN_MODEL.md)

## License

MIT
