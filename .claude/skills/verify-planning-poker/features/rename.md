# Rename

Anyone in a room can rename the room's title, and each participant can change their own display name; both change for everyone. Edits open in place and commit on Enter or blur; Escape cancels.

## Sub-features

- `rename-room` edits the title from the header for everyone.
- `rename-room-cancel` drops an edit on Escape.
- `rename-self` changes your own name from your card (voter) or from the spectator list (spectator).
- `rename-self-blank` keeps the old name when the new one is blank.

## How to get to it (user POV)

- Click the room title in the header (a button named after the title).
- Click your own name under your card, or in the `Spectators` dialog when watching.

## Driving it with verify.sh

Preconditions:

- `verify.sh doctor` all `OK`; Alice and Bob in a room titled `Sprint planning`, Bob with `recordFrames(bob)`.

- **Rename room.** Alice clicks `getByRole('button', { name: 'Sprint planning', exact: true })`, fills `getByRole('textbox', { name: 'Room title' })` with `Retro`, presses Enter. Bob sees `getByRole('heading', { name: 'Retro' })`; Bob's latest snapshot has `title: 'Retro'`.
- **Cancel.** Bob opens the title editor, types `Daily`, presses Escape. The heading stays `Retro` for both.
- **Rename self.** Alice clicks `getByRole('button', { name: 'Alice', exact: true })`, fills `getByRole('textbox', { name: 'Your name' })` with `Alicia`, presses Enter. `card(bob, 'Alicia')` is visible; Bob's snapshot lists `Alicia`.
- **Blank name.** Fill `Your name` with spaces and press Enter. The name stays `Alicia`.
- **Persistence.** Alice reloads. She rejoins as `Alicia` without the join form.
- **Proof.** `shot` of Bob's view after each rename, and Bob's frames.

## Gotchas

- The renamer's own view updates before the server confirms. Prove the rename from the other participant's view and frames, not the renamer's.
- The title persists in SQLite with the room; names live only in memory.
- Blur commits like Enter. Clicking elsewhere to "cancel" saves the edit.
