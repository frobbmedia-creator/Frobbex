import type { Backend, ObservationHandle } from "./contracts.js";
import { BridgeError } from "./errors.js";
import { ObservationStore } from "./observations.js";

interface Observed<T> {
  revision: string;
  data: T;
}

interface ActOptions<TAction, TVerification> {
  observationId: string;
  backend: Backend;
  target: string;
  action: () => Promise<TAction>;
  verify: () => Promise<Observed<TVerification>>;
}

export class ActionCoordinator {
  constructor(private readonly observations: ObservationStore) {}

  async observe<T>(
    backend: Backend,
    target: string,
    read: () => Promise<Observed<T>>,
  ): Promise<{ observation: ObservationHandle; data: T }> {
    const result = await read();
    return {
      observation: this.observations.issue(backend, target, result.revision),
      data: result.data,
    };
  }

  async act<TAction, TVerification>(options: ActOptions<TAction, TVerification>): Promise<{
    action: TAction;
    verification: TVerification;
    verified: true;
    beforeRevision: string;
    afterRevision: string;
  }> {
    const before = this.observations.consume(options.observationId, options.backend, options.target);
    const action = await options.action();
    const after = await options.verify();
    if (after.revision === before.revision) {
      throw new BridgeError("ACTION_UNVERIFIED", "The action completed without a verifiable state change");
    }
    return {
      action,
      verification: after.data,
      verified: true,
      beforeRevision: before.revision,
      afterRevision: after.revision,
    };
  }
}
