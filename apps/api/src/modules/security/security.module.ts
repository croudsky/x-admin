import { Global, Module } from "@nestjs/common";
import { ContentSafetyService } from "./content-safety.service";
import { EncryptionService } from "./encryption.service";

@Global()
@Module({
  providers: [EncryptionService, ContentSafetyService],
  exports: [EncryptionService, ContentSafetyService],
})
export class SecurityModule {}
