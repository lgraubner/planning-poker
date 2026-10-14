# Create a room

The home page creates a room with a title and an estimation deck and takes the creator to the room's join form at `/<8-char code>`. The deck is fixed for the room's lifetime.

## Sub-features

- `create-default` creates a room with Modified Fibonacci when no deck is chosen.
- `create-deck` creates a room with T-shirt sizes.
- `create-validation` refuses an empty title.
- `create-rate-limit` refuses a sixth room in a burst from one client.

## How to get to it (user POV)

- Open `/` and use the form.
- From a room, follow the `Planning Poker` link home (asks `Leave the room?` first).

## Driving it with verify.sh

Preconditions:

- `verify.sh doctor` all `OK`.

- **Open the form.** `page.goto('/')`. A `Room title` textbox, an `Estimation deck` combobox, and a `Create room` button are visible.
- **Empty title.** Click `Create room` with no title. `getByRole('alert')` reads `Enter a room title` and `Room title` has `aria-invalid="true"`; typing clears the alert.
- **Default deck.** `createRoom(page, 'Sizing')` then `join(page, url, 'Alice')`. URL matches `/[a-z0-9]{8}$`; `getByRole('group', { name: 'Choose your card' }).getByRole('button')` has text `0 1 2 3 5 8 13 20 40 100 ? ☕`. A second participant's `snapshots(frames).at(-1).deck` is the same list.
- **T-shirt deck.** `createRoom(page, 'Roadmap', 'T-shirt sizes')`, join. The group shows `XS S M L XL XXL ? ☕`, and the frames' `deck` matches.
- **Rate limit.** Create six rooms from one context in quick succession. The sixth shows alert `Too many rooms created. Try again shortly`.
- **Proof.** `shot` of the form error, of each deck in the room, and the second participant's frames.

## Gotchas

- The rate limit is per client IP (5 at once, then one per minute) and global (a burst of 20, then 10 a second), so many contexts creating rooms at once can still hit `Too many rooms created`. The fixtures give each context a random `X-Forwarded-For`, so separate contexts do not share the per-IP limit; `launch`'s probe room uses the curl client's own address.
- The deck combobox is a Base UI select: click it, then click `getByRole('option', { name })`. `selectOption` does not work.
- The home page footer shows `Legal notice` and `Privacy policy` links from `LEGAL_NOTICE_URL` and `PRIVACY_POLICY_URL` (set by launch to example.com URLs). The room page shows them only in its `Menu`.
