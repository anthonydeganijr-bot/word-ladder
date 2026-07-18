# 🪜 Word Ladder

A daily word-ladder puzzle — change one letter at a time to climb from a start word to a goal word. One shared puzzle a day for everyone, plus unlimited random puzzles anytime.

**[Play it here](https://anthonydeganijr-bot.github.io/word-ladder/)** · **[Also on itch.io](https://anthonydeganijr-bot.itch.io/word-ladder)**

## Features

- One deterministic daily puzzle, seeded by date, shared by every player
- Unlimited random puzzles, playable anytime
- Hints (3 per puzzle), streak tracking, and a shareable result summary
- Optional daily reminder via browser push notifications — no account required
- Works offline as a single static HTML file with no build step or dependencies

## How it works

The word graph is built at load time from a small list of four-letter words: any two words that differ by exactly one letter are connected. Puzzles are generated with BFS over that graph, and hints work the same way — walking back toward the goal one step at a time.

`push-worker/` is a small, dependency-free Cloudflare Worker that powers the optional daily reminder notification. See [`push-worker/README.md`](push-worker/README.md) for how it's set up.

## Support

If you enjoy it, there's a [☕ tip jar](https://buymeacoffee.com/anthonydegani) in the game's footer.
