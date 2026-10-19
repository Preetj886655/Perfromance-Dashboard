import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendChatMessage } from "./chatApi";
import * as client from "../api/client";

describe("chatApi service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sendChatMessage calls apiPost with /api/v1/chat and payload", async () => {
    const mockResponse = {
      response: "Total production is 11,787,594 pcs.",
      conversation_id: "conv-1234",
      data_used: { totalProduction: 11787594 },
      suggested_questions: ["Which line has the largest gap?"],
    };

    const spy = vi.spyOn(client, "apiPost").mockResolvedValue(mockResponse);

    const request = {
      message: "What is total production?",
      conversation_id: "conv-1234",
      filters: {
        dateFrom: "2026-01-01",
        dateTo: "2026-10-09",
        line: "All Lines",
        shift: "All Shifts",
        stage: "All Stages",
        machine: "All Machines",
        material: "All Materials",
      },
    };

    const result = await sendChatMessage(request);

    expect(spy).toHaveBeenCalledWith("/api/v1/chat", request);
    expect(result.response).toBe("Total production is 11,787,594 pcs.");
    expect(result.conversation_id).toBe("conv-1234");
    expect(result.suggested_questions).toContain("Which line has the largest gap?");
  });
});

