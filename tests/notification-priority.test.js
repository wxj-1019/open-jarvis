import { describe, expect, it, vi } from "vitest";
import { NotificationService, normalizeNotificationPayload } from "../lib/notifications/notification-service.js";

describe("NotificationService priority delivery", () => {
  it("normalizes payload with priority", () => {
    const payload = normalizeNotificationPayload({
      title: "Test",
      body: "Body",
      priority: "urgent",
    });
    expect(payload.priority).toBe("urgent");
  });

  it("defaults priority to normal when not specified", () => {
    const payload = normalizeNotificationPayload({
      title: "Test",
      body: "Body",
    });
    expect(payload.priority).toBe("normal");
  });

  it("defaults priority to normal when invalid", () => {
    const payload = normalizeNotificationPayload({
      title: "Test",
      body: "Body",
      priority: "invalid",
    });
    expect(payload.priority).toBe("normal");
  });

  it("skips desktop delivery for info priority and ok is true", async () => {
    const emitted = [];
    const service = new NotificationService({
      emitDesktop: (payload) => emitted.push(payload),
      getBridgeManager: () => null,
    });

    const result = await service.notify({
      title: "Info",
      body: "Just logging",
      priority: "info",
      channels: ["desktop"],
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]).toMatchObject({
      channel: "desktop",
      status: "skipped",
      reason: "info_level",
    });
    expect(emitted).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("emits urgent desktop notification with sound and requireInteraction", async () => {
    const emitted = [];
    const service = new NotificationService({
      emitDesktop: (payload) => emitted.push(payload),
      getBridgeManager: () => null,
    });

    await service.notify({
      title: "Urgent Alert",
      body: "Something broke",
      priority: "urgent",
      channels: ["desktop"],
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      title: "Urgent Alert",
      body: "Something broke",
      priority: "urgent",
      requireInteraction: true,
      sound: true,
    });
  });

  it("emits normal desktop notification without sound", async () => {
    const emitted = [];
    const service = new NotificationService({
      emitDesktop: (payload) => emitted.push(payload),
      getBridgeManager: () => null,
    });

    await service.notify({
      title: "Task Done",
      body: "Completed successfully",
      priority: "normal",
      channels: ["desktop"],
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      title: "Task Done",
      body: "Completed successfully",
      priority: "normal",
      requireInteraction: false,
      sound: false,
    });
  });

  it("returns failed status when bridge manager unavailable", async () => {
    const service = new NotificationService({
      emitDesktop: () => {},
      getBridgeManager: () => null,
    });

    const result = await service.notify({
      title: "Test",
      body: "Body",
      priority: "normal",
      channels: ["bridge_owner"],
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]).toMatchObject({
      channel: "bridge_owner",
      status: "failed",
      error: "bridge manager unavailable",
    });
  });

  it("passes priority to bridge manager proactive opts", async () => {
    const mockSendProactive = vi.fn().mockResolvedValue({
      platform: "telegram",
      chatId: "123",
      sessionKey: "tg_dm_123@agent1",
      recorded: true,
    });

    const mockBridgeManager = {
      sendProactive: mockSendProactive,
    };

    const service = new NotificationService({
      emitDesktop: () => {},
      getBridgeManager: () => mockBridgeManager,
    });

    await service.notify({
      title: "Bridge Test",
      body: "Via bridge",
      priority: "urgent",
      channels: ["bridge_owner"],
    });

    expect(mockSendProactive).toHaveBeenCalledWith(
      "Bridge Test\n\nVia bridge",
      null,
      expect.objectContaining({
        priority: "urgent",
      })
    );
  });

  it("handles queued result from sendProactive for info priority", async () => {
    const mockSendProactive = vi.fn().mockResolvedValue({
      status: "queued",
    });

    const mockBridgeManager = {
      sendProactive: mockSendProactive,
    };

    const service = new NotificationService({
      emitDesktop: () => {},
      getBridgeManager: () => mockBridgeManager,
    });

    const result = await service.notify({
      title: "Info",
      body: "Just logging",
      priority: "info",
      channels: ["bridge_owner"],
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]).toMatchObject({
      channel: "bridge_owner",
      status: "skipped",
      reason: "info_level",
    });
    expect(result.ok).toBe(true);
  });

  it("skips bridge delivery for info priority and ok is true", async () => {
    const mockSendProactive = vi.fn().mockResolvedValue({
      platform: "telegram",
      chatId: "123",
      sessionKey: "tg_dm_123@agent1",
      recorded: true,
    });

    const mockBridgeManager = {
      sendProactive: mockSendProactive,
    };

    const service = new NotificationService({
      emitDesktop: () => {},
      getBridgeManager: () => mockBridgeManager,
    });

    const result = await service.notify({
      title: "Info",
      body: "Just logging",
      priority: "info",
      channels: ["bridge_owner"],
    });

    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]).toMatchObject({
      channel: "bridge_owner",
      status: "skipped",
      reason: "info_level",
    });
    expect(result.ok).toBe(true);
    expect(mockSendProactive).not.toHaveBeenCalled();
  });
});
