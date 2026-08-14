import { BridgeError } from "./errors.js";

interface RetryOptions {
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function withReadRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const delays = [50, 150];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable = error instanceof BridgeError && error.retryable;
      const delay = delays[attempt];
      if (!retryable || delay === undefined) throw error;
      await sleep(delay);
    }
  }
  throw new BridgeError("INTERNAL_ERROR", "Read retry loop ended unexpectedly");
}
