# Pulse tick

a) Read `.hackathon-pulse/me.txt`. Run `git fetch`. Take the shared state from the upstream branch if it has one (`git show @{u}:pulse/state.json`), otherwise from the local `pulse/state.json`, otherwise start from an empty state.
   State shape: `{ "team": "...", "ticks": [ { "n": 1, "member": 1, "time": "...", "headline": "..." } ], "members": { "1": { "building": "...", "works": "...", "blocking": "...", "features": [ { "name": "...", "for": "..." } ], "next": "..." }, "2": { ... } } }`

b) Write 8–12 short facts for yourself, taken from this conversation and from `git log --all --oneline -20`:
   - what we're building, what works now, what's blocking us
   - which Claude features I actually used, and what for (only the ones that appear in this conversation or in the repo)
   - our next step, as we described it
   No secrets, no links, no people's names (not even made-up ones).
   Replace ONLY my own `members.<member>` entry with these facts; keep the other member's entry exactly as it is.

c) Append my tick to `ticks` with n = the highest n + 1 and a headline in Romanian (time in Romanian time). Save the full state to `pulse/state.json`.

d) Spawn ONE subagent (model sonnet) and give it `pulse/state.json` and `pulse/DESIGN.md`. It writes `pulse/index.html`, a single file:
   - follows DESIGN.md exactly
   - in Romanian, "explain like I'm 10": drawings (inline SVG) carry the idea, words only label it
   - sections, in order: masthead; hero poster (what we're building, in one line, plus an analogy, merged from both members); a Problem → Idea → Demo diagram; a trail with one stop for each tick, in order of n, each tagged with an M1/M2 pill, and "Ești aici" on the last one; "Cum folosim Claude": one tile for each feature used, merged across members, with M1/M2 pills showing who used it and what for; "Pasul următor": each member's step, as they said it; footer
   - only show what we did: no recommendations, no list of features we didn't use, no score
   - title "Pago Voice · Pulse"; light + dark theme (tokens on :root, dark under @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) } and under :root[data-theme="dark"]); no executable scripts; the only external resource is the Poppins stylesheet
   - embeds the full state, unchanged, in `<script type="application/json" id="pulse-data">…</script>` (data only, never executed)
   - SVG text and strokes use theme tokens so they read in both themes (the poster colors stay fixed)
   - works on phone: `* { box-sizing: border-box }`, SVGs and cards with `max-width: 100%`, long text wraps (`overflow-wrap: anywhere`), no horizontal scrolling at 360px

e) Read `pulse/index.html` before committing. Then commit ONLY the pulse folder, never anything else (other staged or unstaged changes stay exactly as they are):
   `git add pulse/ && git commit -m "pulse #<N> · M<member>" -- pulse/`

f) Push to the current branch's upstream (`git push`; if there's no upstream yet, `git push -u origin HEAD`).
   - If the push is rejected because the remote moved (the other member pushed in the meantime): `git pull --rebase --autostash`. If `pulse/` conflicts, resolve it by merging the two states (keep both members' entries and all ticks, renumber n in time order), regenerate `pulse/index.html` the same way, `git add pulse/`, `git rebase --continue`, then push once more.
   - If there is no remote, or I don't have push rights: keep the local commit and reply with ❌ + the reason.

g) Reply with ONE line only: `✅ Pulse #<N> · M<member> · <headline> · pushed <short sha>` (or ❌ + the reason).
