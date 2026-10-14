import { z } from 'zod';

// A room that exists but turns you away says why
export const RoomStatusSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), title: z.string() }),
  z.object({ available: z.literal(false), reason: z.string() }),
]);

export const CreatedRoomSchema = z.object({ code: z.string() });

const FailureSchema = z.object({ error: z.string() });

// The server's reason for a failed request. A proxy's error page has none.
export function failure(body: unknown, fallback: string) {
  return FailureSchema.safeParse(body).data?.error || fallback;
}
