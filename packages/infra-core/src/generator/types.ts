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
  /** Lightsail bundle id (e.g. "small_3_0"). Used by the staging
   *  template's instance.ts.hbs. Empty/unused in the ECS template. */
  bundleId?: string;
  /** EC2 instance type (e.g. "t3.medium"). Used by the ec2 template's
   *  instance.ts.hbs. Unused by ECS/Lightsail templates. */
  ec2InstanceType?: string;
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
  // When true, the rendered ECS task ships app logs to Loki via FireLens
  // instead of the awslogs driver. Default false = unchanged CloudWatch path.
  lokiLogs: boolean;
  // Environment id, used as the heizen_env log label so the reader can
  // query {heizen_env="<envId>"}.
  envId: string;
  // Lightsail only. When true, the template allocates + attaches a
  // StaticIp; when false it skips them and exports the instance's dynamic
  // publicIpAddress as staticIpAddress. Inert for the ECS/EC2 templates.
  staticIpEnabled: boolean;
  // User-configured extra firewall ports (EC2 SG ingress + Lightsail public
  // ports). Normalized — cidr/description always filled. Empty by default,
  // so the rendered baseline 22/80/443 is unchanged.
  openPorts: Array<{
    port: number;
    protocol: string;
    cidr: string;
    description: string;
  }>;
}
