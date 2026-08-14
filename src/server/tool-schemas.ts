import { z } from "zod";

const observationId = z.string().uuid();
const pid = z.number().int().positive();
const windowId = z.number().int().nonnegative();

export const emptyInput = z.object({}).strict();
export const commonOutput = z.object({
  ok: z.boolean(),
  correlationId: z.string().uuid(),
}).passthrough();
export const browserOpenInput = z.object({ url: z.string().url(), focus: z.boolean().default(true) }).strict();
export const browserObserveInput = z.object({ tabId: z.string().min(1).optional() }).strict();
export const browserClickInput = z.object({ observationId, tabId: z.string().min(1).optional(), ref: z.string().regex(/^@e\d+$/) }).strict();
export const browserTypeInput = z.object({ observationId, tabId: z.string().min(1).optional(), ref: z.string().regex(/^@e\d+$/), text: z.string().max(20_000) }).strict();
export const browserScrollInput = z.object({ observationId, tabId: z.string().min(1).optional(), direction: z.enum(["up", "down"]), amount: z.number().int().min(1).max(5_000).default(500) }).strict();
export const computerWindowsInput = z.object({ pid }).strict();
export const computerLaunchInput = z.object({ bundleId: z.string().regex(/^[A-Za-z0-9.-]+$/), urls: z.array(z.string()).max(10).optional() }).strict();
export const computerObserveInput = z.object({ pid, windowId }).strict();
export const computerClickInput = z.object({ observationId, pid, windowId, elementIndex: z.number().int().nonnegative().optional(), x: z.number().nonnegative().optional(), y: z.number().nonnegative().optional() }).strict().refine((value) => value.elementIndex !== undefined || (value.x !== undefined && value.y !== undefined), "Provide elementIndex or x and y");
export const computerTypeInput = z.object({ observationId, pid, windowId, text: z.string().max(20_000) }).strict();
export const computerScrollInput = z.object({ observationId, pid, windowId, deltaY: z.number().int().min(-5_000).max(5_000).refine((value) => value !== 0) }).strict();

export const consequentialAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("browser_click"), observationId, tabId: z.string().min(1).optional(), ref: z.string().regex(/^@e\d+$/) }).strict(),
  z.object({ kind: z.literal("browser_type"), observationId, tabId: z.string().min(1).optional(), ref: z.string().regex(/^@e\d+$/), text: z.string().max(20_000) }).strict(),
  z.object({ kind: z.literal("computer_click"), observationId, pid, windowId, elementIndex: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("computer_type"), observationId, pid, windowId, text: z.string().max(20_000) }).strict(),
]);

export type ConsequentialAction = z.infer<typeof consequentialAction>;
export const prepareActionInput = z.object({ summary: z.string().min(1).max(500), action: consequentialAction }).strict();
export const executeActionInput = z.object({ token: z.string().uuid(), action: consequentialAction }).strict();
