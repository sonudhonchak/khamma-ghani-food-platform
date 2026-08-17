# Android setup

## Option A — GitHub Codespaces

If your GitHub account has Codespaces access, open this repository in a Codespace and run:

```bash
npm install
npm run typecheck
npm run build
```

## Option B — StackBlitz

For frontend-only browser work, the Vite project can be opened in a browser-based environment. Backend/database work should remain in the repository.

## GitHub web editor

You can create or edit files directly in GitHub. For larger changes, upload the project ZIP or use a browser development environment connected to the repository.

## Do not paste secrets

Never put real:
- database passwords
- auth secrets
- payment secrets
- storage access keys

into source files.
