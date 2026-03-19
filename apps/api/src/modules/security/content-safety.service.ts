import { Injectable } from "@nestjs/common";

type SafetyInput = {
  body: string;
  kind: "post" | "reply";
};

export class ContentSafetyError extends Error {
  constructor(readonly reasons: string[]) {
    super(`Content failed safety validation: ${reasons.join(" / ")}`);
    this.name = "ContentSafetyError";
  }
}

@Injectable()
export class ContentSafetyService {
  private readonly defaultBlockedTerms = ["死ね", "殺す", "ぶっ殺", "絶対儲かる", "必ず儲かる", "100%保証"];

  validate(input: SafetyInput) {
    const body = input.body.trim();
    const reasons: string[] = [];
    const urlMatches = body.match(/https?:\/\/\S+/g) ?? [];

    if ([...body].length > 280) {
      reasons.push("280文字を超えています");
    }

    if (input.kind === "reply" && urlMatches.length > 0) {
      reasons.push("返信にはURLを含めないでください");
    }

    if (input.kind === "post" && urlMatches.length > 1) {
      reasons.push("URLは1件までにしてください");
    }

    if (/([!！?？])\1{3,}/.test(body)) {
      reasons.push("過度に強い記号表現が含まれています");
    }

    for (const term of this.getBlockedTerms()) {
      if (term && body.includes(term)) {
        reasons.push(`禁止表現を含んでいます: ${term}`);
      }
    }

    return {
      safe: reasons.length === 0,
      reasons,
    };
  }

  assertSafe(input: SafetyInput) {
    const result = this.validate(input);
    if (!result.safe) {
      throw new ContentSafetyError(result.reasons);
    }
  }

  private getBlockedTerms() {
    const configuredTerms =
      process.env.SAFETY_BLOCKLIST?.split(",")
        .map((term) => term.trim())
        .filter(Boolean) ?? [];

    return [...new Set([...this.defaultBlockedTerms, ...configuredTerms])];
  }
}
