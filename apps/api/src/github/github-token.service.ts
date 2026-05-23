import { Injectable } from "@nestjs/common";
import { getInstallationToken } from "@heizen/infra-core";

@Injectable()
export class GithubTokenService {
  async getToken(installationId: string): Promise<string> {
    return getInstallationToken(installationId);
  }
}
