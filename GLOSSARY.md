# Planning Poker

Planning Poker coordinates short-lived group estimation sessions. Participants choose estimates privately, then reveal them together for discussion.

## Language

**Room**:
A live estimation session reached through a shareable link. A room has a title, contains participants, and may host multiple rounds while it remains active.
_Avoid_: Lobby, table, game

**Room code**:
The short, shareable identifier that grants access to a room. Possession of the room code is the only access requirement.
_Avoid_: Password, token, room ID

**Participant**:
A person currently taking part in a room under a display name. A display name is a label and does not establish identity.
_Avoid_: User, player, member

**Spectator**:
A participant who watches a room without holding an estimate. Spectators have no card, do not count toward a round, and may still reveal and reset. Any participant can switch between spectator and voter at any time.
_Avoid_: Observer, viewer, guest

**Round**:
One cycle in which participants select estimates, reveal them, and reset before estimating again.
_Avoid_: Vote, game, turn

**Reveal**:
The transition that exposes every selected estimate and prevents further selections in the current round.
_Avoid_: Show, flip

**Reset**:
The transition that clears every estimate and begins a new hidden round with the same participants.
_Avoid_: Restart, clear

**Estimate**:
One value selected by a participant from the estimation deck during a round.
_Avoid_: Vote, score

**Estimation deck**:
The set of values available for estimates, chosen when the room is created and fixed for its lifetime. Modified Fibonacci holds `0`, `1`, `2`, `3`, `5`, `8`, `13`, `20`, `40`, `100`; T-shirt sizes hold `XS`, `S`, `M`, `L`, `XL`, `XXL`. Every deck ends with `?` and `☕`.
_Avoid_: Scale, card set

**Card**:
The room view of one participant and their estimate state. It shows whether an estimate has been selected and hides its value until the round is revealed.
_Avoid_: User card, player card
