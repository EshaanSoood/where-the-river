# Dream River – Dependency Security Audit (2025-10-30)

## Environment & Install
- **Package manager:** npm (lockfile: `package-lock.json`)
- **Install mode:** `npm ci --ignore-scripts` (see `reports/01-install-log.txt`)
- **Runtime details:** `reports/00-env.txt` captures Node and npm versions
- No lifecycle scripts executed during install; subsequent commands reused the frozen node_modules tree

## Lifecycle Scripts
- Packages with pre/install/postinstall hooks: **4** (see `reports/04-lifecycle-scripts.json`)
- Top packages whose installed code contains red-flag tokens (from `reports/05-risky-patterns.json`):

| # | Package | Match count |
| - | - | - |
| 1 | next@15.5.4 | 2941 |
| 2 | three@0.169.0 | 189 |
| 3 | typescript@5.9.3 | 66 |
| 4 | polished@4.3.1 | 60 |
| 5 | globe.gl@2.44.1 | 55 |
| 6 | react-globe.gl@2.36.0 | 53 |
| 7 | d3-time-format@4.1.0 | 51 |
| 8 | styled-jsx@5.1.6 | 44 |
| 9 | three-globe@2.44.1 | 44 |
|10 | d3@7.9.0 | 43 |
|11 | eslint@9.37.0 | 39 |
|12 | react-dom@19.1.0 | 37 |
|13 | tinycolor2@1.6.0 | 34 |
|14 | @emnapi/core@1.5.0 | 34 |
|15 | next-plausible@3.12.4 | 33 |
|16 | @tailwindcss/oxide@4.1.14 | 32 |
|17 | @supabase/node-fetch@2.6.15 | 30 |
|18 | framer-motion@12.23.22 | 26 |
|19 | js-yaml@4.1.0 | 26 |
|20 | three-render-objects@1.40.4 | 22 |

## `node_modules/.bin`
- Full list: `reports/03-binaries.txt`
- Noteworthy binaries that warrant allow-listing: `napi-postinstall`, `jiti`, multiple CSV/TopoJSON converters

## Risky Pattern Scan
- Files inspected: **1,356**; pattern hits: **4,408** (details in `reports/05-risky-patterns.json` and `.md`)
- Packages combining `process.env` with network/file activity in installed code:
  - **next@15.5.4** – 82 files touching `process.env` alongside `fetch`/`exec`/`net.` or file I/O
  - **globe.gl@2.44.1**, **napi-postinstall@0.3.4**, **styled-jsx@5.1.6**, **three-render-objects@1.40.4**, **typescript@5.9.3**, **@tybys/wasm-util@0.10.1** – each with at least one such file
- These packages should be closely reviewed before exposing secrets during build/runtime

## Vulnerability & Integrity Checks
- **npm audit:** exit code 1 (moderate `tar@7.5.1` vulnerability; no high/critical issues). Raw output: `reports/06-audit.json`
- **Lockfile lint:** failed – tool flagged hundreds of entries despite pointing to `registry.npmjs.org` (see `reports/07-lockfile-lint.txt`). Investigate whether the stored integrity metadata is compatible with lockfile-lint’s host rules
- **SBOM:** `npx @cyclonedx/cyclonedx-npm --output` failed (`--output` not recognised in v4.1.0); failure logged in `reports/08-sbom.log`

## Front-end Bundle Snapshot
- Production build executed in isolated copy with `npm_config_ignore_scripts=true`
- JavaScript bundle inventory recorded at `reports/09-bundle-files.txt`

## What to Do Next
- Review the highlighted packages (especially `next@15.5.4` and `napi-postinstall@0.3.4`) for necessity and minimise exposure of environment secrets during build/runtime
- Replace or patch `tar@7.5.1` (moderate advisory GHSA-29xp-372q-xqph) if possible
- Align lockfile with lockfile-lint expectations (consider loosening allowed hosts or regenerating the lockfile)
- Re-run SBOM generation with the correct CLI flag (`--outfile` in recent versions) once tooling is confirmed
- Commit the lockfile and enforce `npm ci --ignore-scripts` in CI; explicitly allow-list only the packages whose lifecycle scripts are required
- Rotate or scrutinise any credentials that may have been available to build steps invoking the flagged packages




