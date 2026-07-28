# Clipboard History CLI PRD

| Field | Value |
|---|---|
| Status | Draft |
| Owner | Lorenzo |
| Last updated | 2026-07-28 |

## 1. Summary

A tiny command-line tool that remembers the last 50 things I copied to my clipboard, so I can paste something I copied ten minutes ago without going to find it again.
It runs on my own laptop only.
It is never deployed anywhere, has no users other than me, and stores nothing except my own clipboard text.

## 2. Problem and Context

The system clipboard holds one item.
I copy a URL, then copy a snippet, and the URL is gone.
Today I work around it by pasting things into a scratch file, which I then forget to clean up.

## 3. Goals

1. Recover any of the last 50 clipboard entries in under three seconds.
2. Run in the background without me thinking about it.

## 4. Non-Goals

1. Syncing across machines. There is one machine.
2. Sharing with anyone. This is a personal tool.
3. Images or files. Text only.

## 5. Users and Use Cases

One user: me.
I copy things all day, and a few times a day I want something I copied earlier.
The tool runs on my laptop, started by me, and I read from it in the same terminal I already have open.

## 6. Success Metrics

| Metric | Baseline | Target | Measured by |
|---|---|---|---|
| Time to recover an old clipboard entry | ~60s (dig through scratch file) | under 3s | Me, informally |

## 7. Functional Requirements

| ID | Title | Priority | Detail |
|---|---|---|---|
| FR-1 | Capture clipboard changes | P0 | Below |
| FR-2 | List recent entries | P0 | Below |
| FR-3 | Restore an entry to the clipboard | P0 | Below |

### FR-1: Capture clipboard changes
**Priority:** P0

While running, the tool notices when the clipboard contents change and records the new text with a timestamp.
It keeps the most recent 50 entries and discards older ones.
Duplicate consecutive entries are recorded once.

**Acceptance criteria**

AC-1.1 Given the tool is running, when I copy a new piece of text, then it appears as the newest entry within two seconds.
AC-1.2 Given 50 entries are stored, when a 51st is captured, then the oldest is discarded.
AC-1.3 Given I copy the same text twice in a row, when the second copy happens, then only one entry exists for it.

### FR-2: List recent entries
**Priority:** P0

I can list the stored entries, newest first, each with an index and a one-line preview.

**Acceptance criteria**

AC-2.1 Given entries exist, when I run the list command, then they print newest first with an index number.
AC-2.2 Given an entry spans several lines, when it is listed, then only its first line is shown, truncated to the terminal width.

### FR-3: Restore an entry to the clipboard
**Priority:** P0

I can pick an entry by its index and put it back on the system clipboard.

**Acceptance criteria**

AC-3.1 Given I run the restore command with a valid index, when it completes, then pasting anywhere yields that entry's exact text.
AC-3.2 Given I pass an index that does not exist, when the command runs, then it prints a readable error and exits non-zero.

## 8. Non-Functional Requirements

NFR-1 The tool uses under 50MB of memory while running in the background.
NFR-2 History survives a laptop restart.

## 9. Dependencies and Integrations

The operating system clipboard.
Nothing else.

## 10. Assumptions

I will start the tool myself rather than having it auto-start at login.

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Clipboard polling burns battery | Medium | Low | Poll at a low frequency |
| Passwords copied from a password manager land in history | High | Medium | Not addressed in v1, since this is a local single-user tool |

## 12. Open Questions

| # | Question | Owner | Blocks | Needed by |
|---|---|---|---|---|
| 1 | Should history be excluded while a password manager is focused | Me | Nothing in v1 | Later |

## 13. Out of Scope and Future Work

Auto-start at login, once I have used it for a month and know I want it.

## 14. Related Documents

None.
