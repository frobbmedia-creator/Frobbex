import { describe, expect, it } from "vitest";

import { ActionCoordinator } from "../../src/core/coordinator.js";
import { ObservationStore } from "../../src/core/observations.js";

describe("ActionCoordinator", () => {
  it("requires an observation, performs one action, and verifies afterward", async () => {
    const store = new ObservationStore({ now: () => 1_000, ttlMs: 30_000 });
    const coordinator = new ActionCoordinator(store);
    const observed = await coordinator.observe("tandem", "tab:1", async () => ({
      revision: "before",
      data: { snapshot: "button @e1" },
    }));
    let actions = 0;

    const result = await coordinator.act({
      observationId: observed.observation.id,
      backend: "tandem",
      target: "tab:1",
      action: async () => {
        actions += 1;
        return { ok: true };
      },
      verify: async () => ({ revision: "after", data: { snapshot: "done" } }),
    });

    expect(actions).toBe(1);
    expect(result).toMatchObject({ verified: true, beforeRevision: "before", afterRevision: "after" });
  });

  it("reports an unverified action when the post-action revision does not change", async () => {
    const store = new ObservationStore({ now: () => 1_000, ttlMs: 30_000 });
    const coordinator = new ActionCoordinator(store);
    const observed = await coordinator.observe("cua", "42:7", async () => ({ revision: "same", data: {} }));

    await expect(
      coordinator.act({
        observationId: observed.observation.id,
        backend: "cua",
        target: "42:7",
        action: async () => ({ ok: true }),
        verify: async () => ({ revision: "same", data: {} }),
      }),
    ).rejects.toMatchObject({ code: "ACTION_UNVERIFIED" });
  });
});
