# Focus Nexus (Vercel-ready)

A clean focus workspace inspired by your references, including:

- Ring Pomodoro timer with work/break/long-break logic
- Weekly stats and yearly heatmap-style activity grid
- CHEQLIST-inspired minimal weekly todo board
- Collapsible appearance/preferences panel with multiple themes
- Local persistence for tasks, timer config, logs, and preferences

## Run locally

Open `index.html` in your browser, or run a quick static server:

```bash
npx serve .
```

## Deploy on Vercel from GitHub

1. Push this folder to a GitHub repository.
2. In Vercel, click **Add New Project**.
3. Import the GitHub repo.
4. Framework preset: **Other** (or leave auto-detected static).
5. Click **Deploy**.

No build command is required.

## Files

- `index.html` app structure
- `styles.css` theme system and responsive UI
- `app.js` timer logic, tasks, stats, heatmap, and persistence
