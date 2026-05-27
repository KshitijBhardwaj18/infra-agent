export interface ConfigVar {
  envVar: string;
  configVar: string;
}

export interface ServiceCtx {
  name: string;
  type: "backend" | "frontend" | "worker";
  port: number | null;
  domain: string | null;
  command: string[];
  cpuValue: string;
  memoryValue: string;
  isBackend: boolean;
  isFrontend: boolean;
  isWorker: boolean;
  hasDomain: boolean;
  scalable: boolean;
  scaling: { min: number; max: number; cpuTarget: number };
  configVars: ConfigVar[];
  receivesInfraEnv: boolean;
  envFromDb: boolean;
  envFromRedis: boolean;
  envFromBucket: boolean;
  envFromRegion: boolean;
  envFromNodeEnv: boolean;
  pulumiAllSources: string[];
  pulumiDestructure: string[];
  targetGroupVar: string | null;
  tgName: string;
  healthCheck?: { path: string; codes: string };
}

export interface TemplateContext {
  prefix: string;
  project: string;
  env: string;
  region: string;
  domain: string;
  ecrImage: string;
  ecrTag: string;
  fullImage: string;
  natEnabled: boolean;
  natIsDual: boolean;
  natIsSingle: boolean;
  vpcCidr: string;
  ecsPortRangeFrom: number;
  ecsPortRangeTo: number;
  hasAlb: boolean;
  hasDatabase: boolean;
  hasCache: boolean;
  hasStorage: boolean;
  needsRdsSg: boolean;
  needsRedisSg: boolean;
  database: {
    instanceClass: string;
    dbName: string;
    dbUser: string;
    multiAz: boolean;
    deletionProtection: boolean;
    backupRetentionDays: number;
    allocatedStorage: number;
    storageType: string;
    engineVersion: string;
    encrypted: boolean;
  } | null;
  cache: {
    nodeType: string;
    engineVersion: string;
  } | null;
  services: ServiceCtx[];
  servicesWithDomain: ServiceCtx[];
  servicesWithPort: ServiceCtx[];
  servicesWithAlb: ServiceCtx[];
  defaultTargetGroupVar: string;
  configExports: ConfigVar[];
  logRetentionDays: number;
  containerInsights: boolean;
}
