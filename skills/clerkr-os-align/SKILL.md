---
name: clerkr-os-align
description: Align Clerkr OS kanban cards with their NEO Ledger plans — tick the subtasks whose Ledger work is done, link each subtask to its Ledger item, and report what differs. Use whenever the user types "clerkr-os-align" (optionally followed by a card like #12, a project name, or "all"), or asks to align, sync or update a card, a project or the board from NEO Ledger. Needs both the Clerkr OS and NEO Ledger MCP connectors.
---

# clerkr-os-align — bring the board up to date with NEO Ledger

NEO Ledger is where the work gets logged and finished. A Clerkr OS kanban card
steers a project: it has a checklist of **subtasks** (the card face shows
done/total) and a `ledgerUrl` — the share link of the project's Ledger master
plan. This skill reads the Ledger and updates Clerkr OS. **It never writes to
the Ledger.**

## 1. Work out what to align

- The user named it — a card (`#12` or its title), a Ledger project, or "all" —
  use that. "All" means every card from `list_ledger_linked_cards`.
- They named nothing: call Clerkr OS `list_ledger_linked_cards` and ask **one**
  question, listing each card as `#12 Title — 3/7, last synced Sep 23` plus
  "all of them". Nothing else up front.
- They named a Ledger project: find the card whose `ledgerProjectId` equals the
  plan's `projectId`, or whose `ledgerUrl` ends with the plan's `shareUrl`.
- The card has no `ledgerUrl`: ask for the plan's share link, save it with
  `update_kanban_card { ref, ledgerUrl }`, and carry on.

## 2. For each card

1. **Read the card.** Clerkr OS `get_kanban_card { ref }` → `ledgerUrl`,
   `ledgerProjectId`, `subtasks` (each with `id`, `title`, `done`, `ledgerRef`).

2. **Find its Ledger project.**
   - `ledgerProjectId` is set → NEO Ledger `get_plan { project: ledgerProjectId }`.
   - It isn't → the share token (the last path segment of `ledgerUrl`) can't be
     looked up over the Ledger's MCP. Ask which project it is if the user
     hasn't said, call `get_plan` with that name, and check the returned
     `shareUrl` ends with the same `/share/<token>`. **If it doesn't match,
     stop and say so** — never sync a card against a plan you guessed. When it
     matches, pass its `projectId` as `ledgerProjectId` in step 5 so the card
     remembers it.

3. **Build `items` from the plan.** Walk every phase's `items` and each item's
   `subItems`, one entry each:

   | field | from |
   | --- | --- |
   | `ref` | the item's `id` |
   | `taskId` | `ledgerTask.id` (leave out if no linked task) |
   | `title` | the item's `title` |
   | `taskTitle` | `ledgerTask.title` (leave out if none) |
   | `done` | item `done` is true, **or** `ledgerTask.status` is `"DONE"` |

   Plans can run to hundreds of items: keep them to yourself, never paste the
   plan into the reply.

   **No phases, or the plan came back truncated:** match per subtask instead.
   For each subtask, NEO Ledger `find_task { query: <subtask title>,
   includeDone: true }`; accept a result only when it is in the card's project
   *and* is the same task, not merely a similar one. Use `ref` = the task's
   `id`, `title` = its `title`, `done` = `status` is `"DONE"`. A subtask with no
   confident match is left out and reported.

4. **Backfill or not.**
   - The card has **no subtasks** → ask once: "#12 has no subtasks yet — create
     them from the plan's N items?" Yes → `createMissing: true`.
   - Otherwise leave `createMissing` off: the user writes their own subtasks.
     Turn it on only if they asked to add or backfill everything.

5. **Sync.** Clerkr OS `sync_card_from_ledger { ref, items, ledgerProjectId?,
   createMissing? }`. It ticks subtasks the Ledger calls done, matching by the
   Ledger id a subtask remembers first and then by exact title (case, spacing
   and punctuation ignored), and records the id on a title match. It never
   unticks.

## 3. Report

One short block per card, then anything that needs a decision:

- `#12 Title — 3/7 → 5/7`
- **Ticked:** the subtasks the Ledger says are done.
- **Linked:** matched by title this time, by id from now on (a count is fine).
- **Created:** from the backfill.
- **Done here, open in the Ledger:** say it plainly — the sync leaves them
  ticked. Offer to untick here (`update_card_subtask { id, done: false }`);
  never change the Ledger to make them agree.
- **In the Ledger, not on the card:** offer to add them (`add_card_subtasks`
  with `ledgerRef` = the item id). Don't add them unasked.
- **On the card, not in the Ledger:** list them.
- An obvious pair the tool didn't match (`Vault upload` vs `T6.6 · Vault
  upload`): propose linking it; on yes, `update_card_subtask { id, ledgerRef:
  <item id> }` and sync that card again.
- Every subtask now done: say so and ask whether to move the card
  (`move_kanban_card`). Never move it unasked — where a card sits is a
  person's call.

## Rules

- **Read-only on the Ledger.** From this skill, never call `log_time`,
  `set_task_status`, `update_task`, `create_task`, `move_task` or
  `edit_plan`. The Ledger's own rules forbid logging or completing work
  without Niels's explicit confirmation, and "align" is not that. A change the
  user wants in the Ledger is a separate request, under the Ledger's rules.
- **Don't fuzzy-match on the tool's behalf** by rewriting titles to force a
  match — a wrong match ticks work that isn't done. Propose the pair instead.
- Don't re-point a subtask that already has a `ledgerRef` unless the user asks.
- Several cards: one at a time, one combined report.
- **Quick path** — right after finishing a Ledger task in a session that has
  both connectors: `sync_card_from_ledger` **without** `ref`, with `items` =
  just that task (`ref` = its id, `done: true`). Every subtask already linked
  to it, on any card, is ticked. Without a card only remembered ids match,
  never titles.
