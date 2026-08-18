import { describe, expect, it } from "vitest";

import { ActionCoordinator } from "../../src/core/coordinator.js";
import { ObservationStore } from "../../src/core/observations.js";

describe("ActionCoordinator", () => {
  it("requires an observation, performs one action, and verifies afterward", async () => {
    const store = new ObservationStore({ now: () => 1_000, ttlMs: 30_000 });
    const coordinator = new ActionCoordinator(store);
    const observed = await coordinator.observe("chrome", "tab:1", async () => ({
      revision: "before",
      data: { snapshot: "button @e1" },
    }));
    let actions = 0;

    const result = await coordinator.act({
      observationId: observed.observation.id,
      backend: "chrome",
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

  it("refreshes an expired observation once without replaying the action", async () => {
    let now = 1_000;
    const store = new ObservationStore({ now: () => now, ttlMs: 10 });
    const coordinator = new ActionCoordinator(store);
    const observed = await coordinator.observe("chrome", "tab:1", async () => ({
      revision: "old",
      data: { snapshot: "old" },
    }));
    now = 1_011;
    let actions = 0;
    let refreshes = 0;

    await expect(
      coordinator.act({
        observationId: observed.observation.id,
        backend: "chrome",
        target: "tab:1",
        action: async () => {
          actions += 1;
          return { ok: true };
        },
        verify: async () => ({ revision: "after", data: {} }),
        refresh: async () => {
          refreshes += 1;
          return { revision: "fresh", data: { snapshot: "fresh" } };
        },
      }),
    ).rejects.toMatchObject({
      code: "STALE_OBSERVATION",
      details: {
        refreshed: expect.objectContaining({
          observation: expect.objectContaining({ revision: "fresh" }),
          data: { snapshot: "fresh" },
        }),
      },
    });
    expect(actions).toBe(0);
    expect(refreshes).toBe(1);
  });

  it("rejects a target that changed after observation before acting", async () => {
    const store = new ObservationStore({ now: () => 1_000 });
    const coordinator = new ActionCoordinator(store);
    const observed = await coordinator.observe("chrome", "tab:1", async () => ({ revision: "before", data: {} }));
    let actions = 0;

    await expect(coordinator.act({
      observationId: observed.observation.id,
      backend: "chrome",
      target: "tab:1",
      refresh: async () => ({ revision: "changed", data: { url: "https://changed.example" } }),
      action: async () => { actions += 1; return {}; },
      verify: async () => ({ revision: "after", data: {} }),
    })).rejects.toMatchObject({ code: "STALE_OBSERVATION" });
    expect(actions).toBe(0);
  });
});
