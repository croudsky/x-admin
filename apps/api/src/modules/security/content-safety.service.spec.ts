import { afterEach, describe, expect, it } from "vitest";
import { ContentSafetyError, ContentSafetyService } from "./content-safety.service";

describe("ContentSafetyService", () => {
  const originalBlocklist = process.env.SAFETY_BLOCKLIST;

  afterEach(() => {
    if (originalBlocklist === undefined) {
      delete process.env.SAFETY_BLOCKLIST;
      return;
    }

    process.env.SAFETY_BLOCKLIST = originalBlocklist;
  });

  it("accepts safe post text", () => {
    const service = new ContentSafetyService();

    expect(
      service.validate({
        kind: "post",
        body: "新しい料金ページを公開しました。詳しくは固定ポストからご確認ください。",
      }),
    ).toEqual({
      safe: true,
      reasons: [],
    });
  });

  it("blocks reply text that includes a URL", () => {
    const service = new ContentSafetyService();

    expect(
      service.validate({
        kind: "reply",
        body: "詳細はこちらです https://example.com",
      }),
    ).toEqual({
      safe: false,
      reasons: ["返信にはURLを含めないでください"],
    });
  });

  it("raises an error for blocked terms", () => {
    process.env.SAFETY_BLOCKLIST = "社外秘";
    const service = new ContentSafetyService();

    expect(() =>
      service.assertSafe({
        kind: "post",
        body: "社外秘の内容を公開します",
      }),
    ).toThrow(ContentSafetyError);
  });
});
