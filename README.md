# Sprechpartner

A personal AI German conversation partner. Static PWA, no build step, no backend.

## Structure

```
index.html            page shell, settings and review dialogs
manifest.webmanifest  install metadata for the home screen
sw.js                 offline app shell cache (API calls are never cached)
css/styles.css        light and dark theme
js/main.js            wiring: conversation loop, controls, settings dialog
js/prompt.js          tutor system prompt, topics, level notes
js/api.js             Claude Messages API call and JSON reply parsing
js/speech.js          voice in (recognition) and voice out (synthesis)
js/storage.js         settings, chat history, recurring mistake memory
js/ui.js              rendering helpers
assets/               icons
```

## Run locally

ES modules and the service worker need a local server, not a double click:

```
python -m http.server 8000
```

Open http://localhost:8000, tap the gear icon and paste your Anthropic API key.

## Deploy to GitHub Pages

Push the folder contents to a repo, then Settings > Pages > deploy from branch.
Open the Pages URL on your iPhone in Safari, then Share > Zum Home-Bildschirm.

## Notes

- The API key is stored only in this browser (localStorage). Set a monthly spend limit in the Anthropic Console. Do not share the deployed URL with others until a backend hides the key.
- Default model is claude-haiku-4-5. Change it in Settings.
- Voice input uses the browser speech recognition. It works well in Chrome and Edge on desktop. In an installed iPhone home screen app it can be unreliable, so use the keyboard microphone key as a fallback.
- Change `CACHE` in sw.js when you want installed copies to refresh.
