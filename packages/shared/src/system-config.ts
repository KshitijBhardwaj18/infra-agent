export type Presence = "set" | "unset";
export type DisplayKind = "plain" | "masked" | "presence";

export type DisplayValue = string | Presence | null;

export interface SystemConfig {
  runtime: {
    nodeEnv: DisplayValue;
    port: DisplayValue;
    corsOrigin: DisplayValue;
    webOrigin: DisplayValue;
    authCookieDomain: DisplayValue;
  };
  databases: {
    databaseUrl: Presence;
    redisUrl: Presence;
  };
  auth: {
    betterAuthUrl: DisplayValue;
    betterAuthSecret: Presence;
    encryptionKey: Presence;
  };
  github: {
    appId: Presence;
    appSlug: DisplayValue;
    appClientId: DisplayValue;
    appClientSecret: Presence;
    appPrivateKey: Presence;
    webhookSecret: Presence;
    stateSecret: Presence;
    allowUnsignedWebhooks: boolean;
    bootstrapInstallationId: Presence;
  };
  aws: {
    platformAccountId: DisplayValue;
    platformAccessKeyId: DisplayValue;
    platformSecretAccessKey: Presence;
    platformSessionToken: Presence;
  };
  pulumi: {
    configPassphrase: Presence;
    baseDepsDir: DisplayValue;
  };
  bootstrap: {
    defaultOrgName: DisplayValue;
    defaultOrgSlug: DisplayValue;
    bootstrapAdminEmail: DisplayValue;
  };
  ai: {
    anthropicApiKey: Presence;
  };
}
