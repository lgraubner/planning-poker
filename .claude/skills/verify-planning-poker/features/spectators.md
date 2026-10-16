# Spectators

A participant can join as a spectator or switch at any time. Spectators sit beside the table without a card, do not hold up the round, appear in a spectator list behind the eye button, and can still reveal and start the next round.

## Sub-features

- `spectator-join` joins as a spectator from the join form.
- `spectator-list` shows spectators in a dialog; the viewer's own button says `including you`.
- `spectator-switch` moves a voter to watching and a spectator back to a seat.
- `spectator-control` lets a spectator reveal and vote again.

## How to get to it (user POV)

- On the join form: fill `Name`, click `Watch as spectator` instead of `Join`.
- In a room: the eye button, named `Spectators` when nobody watches, `<n> spectator(s)` otherwise, and `<n> spectator(s), including you` for a spectator.

## Driving it with verify.sh

Preconditions:

- `verify.sh doctor` all `OK`; Alice joined as a voter with `recordFrames(page)` before her join.

- **Join as spectator.** Bob opens the URL, fills `Name` with `Bob`, clicks `Watch as spectator`. His `Choose your card` group is hidden and a `status` shows `Waiting for estimates`; `card(page, 'Bob')` is hidden. Alice's latest snapshot has Bob with `spectator: true`.
- **List.** Alice clicks `1 spectator` (exact); `getByRole('dialog', { name: 'Spectators' }).getByRole('listitem')` reads `Bob`. Bob's button is `1 spectator, including you`. `Escape` closes it.
- **Control.** Alice picks `8`, Bob clicks `Reveal cards`. `card(bob, 'Alice')` is `Alice: 8`.
- **Take a seat.** Bob opens his list and clicks `Take a seat`. His `Choose your card` group shows; `card(page, 'Bob')` is `Bob: not selected`; Alice's snapshot has `spectator: false`; Alice's `Spectators` dialog says `No spectators yet`.
- **Watch.** A voter opens `Spectators` and clicks `Watch as spectator`. Their card leaves the table for everyone.
- **Proof.** `shot` of both views after each switch, and Alice's frames.

## Gotchas

- `join()` from the fixtures waits for the card picker and so hangs for a spectator. Fill and click by hand.
- The spectator list is a popover dialog with animations; wait for them (`shot` does) before measuring or screenshotting.
- A role switch lives on the server. Assert it from the other participant's frames, because the switcher's own view updates first.
