---
description: Write an end-of-session checkpoint to docs/sessions/ so the next session can pick up cleanly.
---

You are wrapping up the current session. Write a checkpoint file at `docs/sessions/{YYYY-MM-DD}-{short-topic-slug}.md` (use today's date and a 2-4 word slug describing what we worked on).

The file must contain, in this order:

1. **Topic** — one line, what this session was about.
2. **Decisions made** — bullet list of decisions reached. Each one self-contained: a future Claude reading only this should understand the decision without needing the full conversation.
3. **Files changed** — list of files created or modified this session, with one-line descriptions.
4. **Open questions** — anything we didn't resolve.
5. **Exact next step** — the single, concrete thing to do first in the next session, written so a fresh Claude session could start it without re-reading this conversation. Include relevant file paths and the rough shape of the change.
6. **Tokens advisory** — a one-line note on whether we hit a token limit, ran out of patience, or stopped at a natural break.

Keep the file under 200 lines. Quote actual filenames and key code names; don't be vague.

After writing the file, print a one-line confirmation of the path so the user can copy it into their next session prompt.
