import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { WorkspaceAuthController } from "./workspace-auth.controller";

@Module({
  imports: [AuditModule],
  controllers: [AuthController, WorkspaceAuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
