# Frontend Package

Desktop UI package for `lawyer-app`, containing:

- React renderer (`src/`)
- Electron main/preload process (`electron/`)
- Desktop packaging configuration (`electron-builder.json`)

This package is designed to run with the backend package in this repository.

## Requirements

- Node.js `20.19+` or `22.12+`
- npm `10+`

## Install

```bash
npm ci
```

## Run

Renderer only (Vite dev server):

```bash
npm run dev
```

Desktop mode (Vite + Electron):

```bash
npm run electron:dev
```

## Build

Renderer build only:

```bash
npm run build:renderer
```

Desktop package (electron-builder):

```bash
npm run electron:build
```

Windows package only:

```bash
npm run electron:build:win
```

Unpacked directory build:

```bash
npm run electron:build:dir
```

## Scripts

- `dev`: start Vite renderer dev server
- `electron:dev`: start Vite + Electron desktop runtime
- `build:renderer`: TypeScript project build + Vite production bundle
- `electron:build*`: desktop packaging variants
- `lint`: run ESLint
- `preview`: preview renderer production bundle
- `prepare:node`: copy Node runtime needed for packaged app
- `rebuild:backend`: rebuild backend native dependencies for packaging
- `generate:icons`: regenerate application icons

## Project Layout

```text
frontend/
  electron/         Electron main process and preload bridge
  src/              React application code
    Agent_front/    Agent experience UI
    Screens/        Page-level screens
    components/     Shared UI components
    contexts/       Global app providers/state containers
    services/       API/domain client services
  build/            Build-time assets/scripts
  public/           Static public assets
```

## Integration Notes

- Standard CRUD calls are proxied through Electron IPC in desktop mode.
- Agent streaming uses direct HTTP stream endpoint access.
- Core business invariants are enforced in backend and database layers, not in this package.

## Related Docs

- Root project README: `../README.md`
- Architecture diagrams: `../docs/ARCHITECTURE_DIAGRAMS.md`
- App logic use cases: `../docs/APP_LOGIC_USE_CASES.md`
- Domain model: `../docs/DOMAIN_MODEL.md`

## License

MIT
