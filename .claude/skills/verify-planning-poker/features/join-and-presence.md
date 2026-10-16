# Join and presence

Anyone with the room link joins under a display name and appears as a card at the table for everyone. The browser remembers name and seat, so a reload or a dropped connection keeps the place for 30 seconds; leaving removes the card for everyone.

## Sub-features

- `join-name` joins with a name and shows a card to others.
- `join-validation` refuses an empty name and one over 40 characters.
- `join-rejoin` rejoins automatically with the saved identity; a second tab shares one card.
- `join-invite` copies the room link (header on desktop, `Menu` on phones, and `Invite your team` on the table while you sit alone).
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
- The header `Copy room link` is hidden on phones; the menu item is the only path there. While you sit alone, the table shows `Invite your team` with a second `Copy room link`, so scope the desktop locator to `header`. `Link copied` turns back after 3 seconds. Clipboard reads need permissions and are unreliable in WebKit; Chromium is what the config runs.
- A room holds 30 people; the thirty-first gets a full-room message. Proving that needs 31 contexts and is slow.
- The server forgets a disconnected participant after 30 seconds. The reconnect's `join` frame carries the last confirmed name and role, so the server seats them again as a new participant with a new `id`. Do not wait it out in a journey; assert the `join` frame the reconnect sends instead.
- One participant can have 5 tabs open; the sixth gets the heading `You have this room open in too many tabs` with `Close one and try again`.
- `Leave the room?` asks only on in-app navigation (home link, back button). A reload or a closed tab leaves without asking. The card disappears right away only once the participant's last tab has left; a bare socket drop keeps it as `connected: false` until the 30-second sweep.
- Rooms nobody joined expire after ten minutes; a journey that pauses longer gets `Room not found`.
