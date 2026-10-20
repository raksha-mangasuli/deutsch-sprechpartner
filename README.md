# Deutsch Sprechpartner

A personal AI German conversation partner ("Sprich einfach drauflos."). Static PWA, no build step, no backend.

## Structure

```
index.html            page shell, settings and review dialogs
manifest.webmanifest  install metadata for the home screen
sw.js                 offline app shell cache (API calls are never cached)
css/styles.css        light and dark theme
css/avatar.css        avatar layout, blinking, sway and mouth animation
js/main.js            wiring: conversation loop, controls, settings dialog
js/prompt.js          partner system prompt, conversation starters, level notes
js/api.js             Claude Messages API call and JSON reply parsing
js/speech.js          voice in (recognition) and voice out (synthesis)
js/punctuate.js       adds commas, full stops and question marks to dictated German
js/storage.js         settings, chat history, recurring mistake memory
js/ui.js              rendering helpers
js/avatars.js         avatar artwork and its animated overlays
js/personas.js        the three partners: life story, way of talking, voice
assets/               icons
assets/avatars/       avatar artwork (g.png, i.png, k.png)
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

## Conversation partners

You talk to one of three people, chosen under Settings, "Conversation partner":

- **Sofia** (id `g`, the default), 24, a media informatics student in Cologne who boulders and has a cat called Pixel
- **Oma Greta** (id `i`), 72, a retired teacher from Leipzig who bakes, gardens and loves her three grandchildren
- **Jonas** (id `k`), 28, an engineer in Stuttgart who lives for Formula 1 and football

Each one has a fixed life (family, job, pets, hobbies and a way of talking) defined in `js/personas.js`, so they feel like the same person every time. There is no topic menu. Just say "Lass uns über Sport reden" and they switch, bringing in their own experiences and opinions. The empty screen also offers one-tap starters.

Every partner keeps their own conversation, so switching to Jonas never mixes with Sofia's chat. The voice is picked automatically to suit the person (a male voice for Jonas); you can still choose a specific voice in Settings. The partners are characters played by an AI, and they will say so if you sincerely ask.

## Avatars

The partner appears as an animated avatar next to the chat (above it on phones).

The avatar has four states: idle, listening (while the microphone records), thinking (while waiting for the API reply) and speaking (while a reply is read aloud). Blinking and a gentle sway run in every state, and are switched off for people who prefer reduced motion.

The mouth animation is a looped rhythm that runs while speech plays. It is not true lip sync, because the browser does not expose the audio of its built-in voices. If "Read replies aloud" is off, the avatar stays idle after replies.

The artwork may only be used if you have the right to use it. Check the licence of the images in `assets/avatars/` before you publish or deploy the app.

## Dictation

Speaking fills the message box. Commas, full stops and question marks are added automatically with simple German rules: every pause ends a sentence, a comma goes before words like "dass", "weil", "aber" and "ob", and questions starting with a question word or a verb ("Wie geht es dir", "Hast du Zeit") end in a question mark. It is a best guess, so check the text before it sends; touching the box cancels the automatic send. Speaking again adds to what is already in the box.
