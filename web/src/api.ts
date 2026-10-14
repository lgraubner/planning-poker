import { z } from 'zod';

export const RoomStatusSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(true), title: z.string() }),
  z.object({ available: z.literal(false), reason: z.string() }),
]);

export const CreatedRoomSchema = z.object({ code: z.string() });

const FailureSchema = z.object({ error: z.string() });

export function failure(body: unknown, fallback: string) {
  return FailureSchema.safeParse(body).data?.error || fallback;
}
