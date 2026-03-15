# TODO -- Tribal Knowledge

## HIGH PRIORITY

- [ ] **REMIND FLAVIO: Tell the Keymaster about the UTF-8 artifact fix.** When `pbcopy` receives an em dash (`—`) via Node `child_process`, it mangles to `‚Äî`. Fix: use ASCII `--` instead of `—` in clipboard strings, and always pass `'utf-8'` encoding to `stdin.write()`. This needs to be a God Commandment or incident doc so every project that uses `pbcopy` from Node knows the rule.

## DONE

- [x] Rewrite `alert.ts` -- native macOS popup via `osascript` + `afplay` drums + clipboard on dismiss
- [x] Drums stop when popup is dismissed (kill child process on OK)
- [x] Fix UTF-8 artifact in clipboard output (em dash -> ASCII double dash)
- [x] Auto-rename images to `tribal__screenshot--{YYYY-MM-DD}__{epoch}` pattern
- [x] Watcher accepts target project dir as CLI arg
- [x] Writer output matches ideal setup format
- [x] Install script creates lean output structure only (no git clone)
- [x] Real `war-drums.m4a` copied from model-testing to `~/.claude/alerts/sounds/indian-drums.m4a`
