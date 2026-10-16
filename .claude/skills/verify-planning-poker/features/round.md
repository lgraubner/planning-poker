# Estimation round

Voters pick a card privately; others see only that they picked one. Anyone reveals the cards, which turn over for everyone and show the results: the median card with an agreement score (confetti at 100%), or `Discuss!` when estimates span more than neighbouring cards or someone played `?`. `Reset round` clears every estimate and starts the next round.

## Sub-features

- `round-select` picks and unpicks a card; others see `selected` without the value.
- `round-reveal` turns every card for everyone and hides the deck.
- `round-results` shows the vote counts, `Proposed estimate` with `Agreement`, and confetti at full agreement.
- `round-discuss` shows `Discuss!` for estimates more than a card apart.
- `round-reset` (`Reset round`) clears estimates and increments the round.

## How to get to it (user POV)

- Join a room as a voter; the deck sits at the bottom of the window.
- `Reveal cards` sits in the centre of the table and appears once someone has picked a card. `Reset round` sits in the `Round controls` region below the table, which shows only after the reveal. Voters and spectators can use both.

## Driving it with verify.sh

Preconditions:

- `verify.sh doctor` all `OK`.
- Two participants in one room: Alice (`page`) and Bob (`newParticipant()`, with `recordFrames(bob)` before his `join`).

Run the whole recipe with `verify.sh drive .claude/skills/verify-planning-poker/journeys/round.spec.ts`.

- **Pick privately.** Alice clicks `getByRole('button', { name: '5', exact: true })`. It has `aria-pressed="true"`; `card(bob, 'Alice')` is `Alice: selected` and contains no `5`. No unrevealed snapshot in Bob's frames carries another participant's `estimate`.
- **Reveal.** Bob also picks `5`, then clicks `Reveal cards`. For both, `card(…, 'Alice')` is `Alice: 5`, the `Choose your card` group is hidden, and the `status` filtered by `Proposed estimate` reads `Proposed estimate 5 Agreement 100%`. Bob's last `revealed: true` snapshot has Alice's `estimate: '5'`.
- **Results.** `getByRole('list', { name: 'Results' }).getByRole('listitem')` names read like `5: 2 estimates, most estimates`; at full agreement `getByTestId('confetti')` is attached.
- **Reset round.** After the flip settles, click `Reset round`. Both see `Alice: not selected`, the `Results` list hides, and Bob's latest snapshot has `revealed: false` and `round` one higher.
- **Discuss.** Alice picks `3`, Bob `13`, reveal. The `status` filtered by `Discuss!` reads `Discuss!`.
- **Proof.** `01-joined.png`, `02-both-selected-hidden.png`, `03-revealed-agreement.png`, `04-discuss.png`, and `bob.frames.json` in the run's `results/` folder.

## Gotchas

- The accessible name flips to the value before the card animation finishes. Screenshot with `shot()`, which waits for animations, or the picture shows blank cards.
- Click `Reset round` only after `document.getAnimations()` have finished, as people do; clicking mid-flip tests a different path.
- Clicking your selected card again unpicks it.
- After the reveal, a voter who picked nothing is `<name>: no estimate`. A tie for most estimates gets no `, most estimates` suffix in `Results`.
- `?` is the button named `Unsure` and `☕` is `Coffee break`; select them by those names.
- `☕` is left out of the proposed estimate and agreement but gets its own `Results` bar (`☕: 1 estimate`); `?` forces `Discuss!`.
- `Agreement` and confetti need at least two estimates other than `☕`. A lone `5` reads `Proposed estimate 5` with no confetti.
- Confetti only fires for those present at the reveal. Someone who joins a revealed room sees the cards face up without the flip or confetti.
