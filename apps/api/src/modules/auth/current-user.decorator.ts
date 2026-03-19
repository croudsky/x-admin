import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { WorkspaceUserSummary } from "@oku/shared/index";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceUserSummary | undefined => {
    const request = context.switchToHttp().getRequest<{ currentUser?: WorkspaceUserSummary }>();
    return request.currentUser;
  },
);
