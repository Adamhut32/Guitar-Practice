# Practice Log: notes for Claude

- Static GitHub Pages app, no build step. Edit `index.html`, `css/app.css`, `js/app.js` directly.
- After changing any app file, bump `VERSION` in `sw.js` so phones pick up the new version.
- Supabase project: `guitar-practice` (id `gcvpeasvgpkyszeascfn`). Keep it separate from Coulee's project.
- Tables: `songs`, `sessions`, `benchmarks`, `settings`; every row has `user_id` with RLS `user_id = auth.uid()`.
  Schema changes go through Supabase migrations; run the security advisor afterward.
- Weekly check-ins: read the user's `sessions` and `songs` rows via the Supabase connector, then update
  the Project docs `claude/curriculum.md` and `claude/song-library.md`.
- Curriculum content (tips per phase) is the `CONTENT` object in `js/app.js`; keep it in step with `claude/curriculum.md`.
