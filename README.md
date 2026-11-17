# Practice Log

Adam's guitar practice app: daily sessions sized to the time available, a song library with
learning statuses, a metronome that logs hard-part tempos, benchmarks, and progress toward
the goal of playing and singing with friends.

Open it on your phone, sign in, and use **Share → Add to Home Screen** to install it.

## How it's built
- Static site served by GitHub Pages; no build step. Modeled on Coulee (Wisconsin-Fly-Log).
- `index.html`, `css/app.css`, `js/app.js` are the app. `js/config.js` holds the public Supabase URL and anon key.
- Data lives in the `guitar-practice` Supabase project (tables `songs`, `sessions`, `benchmarks`, `settings`),
  with row-level security so each account sees only its own rows.
- The app keeps a local copy and a queue of unsaved changes, so it works offline and syncs when back online.
- `sw.js` caches the app for offline use. Bump `VERSION` in it when files change.
- `data/starter-songs.json` is the starter song library offered to a new account.
- The practice curriculum lives in the Claude "Guitar Practice" Project (`claude/curriculum.md`).
