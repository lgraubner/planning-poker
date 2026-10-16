# Join and presence

Anyone with the room link joins under a display name and appears as a card at the table for everyone. The browser remembers name and seat, so a reload or a dropped connection keeps the place for 30 seconds; leaving removes the card for everyone.

## Sub-features

- `join-name` joins with a name and shows a card to others.
- `join-validation` refuses an empty name and one over 40 characters.
- `join-rejoin` rejoins automatically with the saved identity; a second tab shares one card.
- `join-invite` copies the room link (header on desktop, `Menu` on phones).
- `join-leave` asks before leaving via the home link or back button; leaving or closing the tab removes the card.
- `join-reconnect` shows `Reconnecting…` after a dropped socket and keeps the estimate.

## How to get to it (user POV)

- Open a room URL `/<code>` from a shared link.
- Reload or open a second tab in the same browser (automatic rejoin).
- Click the `Planning Poker` link or press back inside a room (leave).

## Driving it with verify.sh

Preconditions:

- `verify.sh doctor` all `OK`; a room from `createRoom`.

- **Join.** `join(page, url, 'Alice')`, then `join(bob, url, 'Bob')` with `bob = await newParticipant()` and `recordFrames(bob)`. `card(bob, 'Alice')` has name `Alice: not selected`; Bob's last snapshot lists both names.
- **Validation.** On the join form click `Join` empty: alert `Enter your name`. Fill 41 characters: alert `Use 1–40 characters without control characters`.
- **Rejoin.** `page.context().newPage()` and `goto(url)`. The `Name` field is hidden and `Choose your card` is visible; a card picked in one tab shows `aria-pressed="true"` in the other; `getByRole('article')` count stays 1.
- **Invite (desktop).** `context.grantPermissions(['clipboard-read', 'clipboard-write'])`, click `Copy room link` in `header`. The button becomes `Link copied`; `navigator.clipboard.readText()` equals the room URL.
- **Invite (mobile).** Click `Menu`, then `getByRole('menuitem', { name: 'Copy room link' })`. It becomes `Link copied`.
- **Leave.** Click `getByRole('link', { name: 'Planning Poker' })`. `alertdialog` `Leave the room?` appears; `Stay` keeps the URL; `Leave room` goes to `/`. Bob's last snapshot no longer lists Alice and `card(bob, 'Alice')` is hidden.
- **Reconnect.** Proxy the socket with `page.routeWebSocket(/\/ws$/, …)` and close it after picking `3`. `Reconnecting…` shows, then hides; the `3` button is still pressed. See `a dropped connection reconnects and keeps the estimate` in `web/e2e/presence.spec.ts` for the hold-and-release pattern.
- **Proof.** `shot` per step; Bob's frames before and after Alice leaves.

## Gotchas

- `join()` waits for the card picker, which a revealed room or a spectator does not show. Join those by filling `Name` and clicking `Join` yourself.
- The header `Copy room link` is hidden on phones; the menu item is the only path there. Clipboard reads need permissions and are unreliable in WebKit; Chromium is what the config runs.
- A room holds 30 people; the thirty-first gets a full-room message. Proving that needs 31 contexts and is slow.
- The server forgets a disconnected participant after 30 seconds and seats them again from their last name and role. Do not wait it out in a journey; assert the `join` frame the reconnect sends instead.
- Rooms nobody joined expire after ten minutes; a journey that pauses longer gets `Room not found`.
