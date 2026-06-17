/**
 * Maps a Pulumi resource (type + physical AWS id + region) to an AWS
 * console URL. Returns a deep-link to the specific resource when we have
 * a reliable pattern + id, otherwise the region-scoped service console
 * (still useful), or null when there's nothing sensible to link to.
 *
 * Pulumi type looks like "aws:ec2/instance:Instance". The physical id
 * comes from the resource's exported `properties.id` (e.g. i-…, vpc-…,
 * the bucket name, an RDS identifier, an ARN, or an IAM role name).
 */
export function resourceConsoleUrl(
  type: string,
  id: string | undefined,
  region: string | undefined,
): string | null {
  if (!type.startsWith("aws:")) return null;
  const [svcPart] = type.slice(4).split(":"); // "ec2/instance"
  const [service, kind] = (svcPart ?? "").split("/");
  const r = region || "us-east-1";
  const ec2 = `https://console.aws.amazon.com/ec2/home?region=${r}`;
  const vpc = `https://console.aws.amazon.com/vpcconsole/home?region=${r}`;
  const enc = encodeURIComponent;

  switch (service) {
    case "ec2":
      switch (kind) {
        case "instance":
          return id ? `${ec2}#InstanceDetails:instanceId=${id}` : `${ec2}#Instances:`;
        case "eip":
          return `${ec2}#Addresses:`;
        case "securityGroup":
          return id ? `${ec2}#SecurityGroup:groupId=${id}` : `${ec2}#SecurityGroups:`;
        case "vpc":
          return id ? `${vpc}#VpcDetails:VpcId=${id}` : `${vpc}#vpcs:`;
        case "subnet":
          return id ? `${vpc}#SubnetDetails:subnetId=${id}` : `${vpc}#subnets:`;
        case "internetGateway":
          return `${vpc}#igws:`;
        case "natGateway":
          return `${vpc}#NatGateways:`;
        case "routeTable":
          return `${vpc}#RouteTables:`;
        case "routeTableAssociation":
        case "route":
          return null;
        default:
          return ec2;
      }
    case "lb":
      return kind === "targetGroup"
        ? `${ec2}#TargetGroups:`
        : `${ec2}#LoadBalancers:`;
    case "rds":
      return id && kind === "instance"
        ? `https://console.aws.amazon.com/rds/home?region=${r}#database:id=${id};is-cluster=false`
        : `https://console.aws.amazon.com/rds/home?region=${r}#databases:`;
    case "elasticache":
      return `https://console.aws.amazon.com/elasticache/home?region=${r}#/redis`;
    case "s3":
      // S3 bucket id == bucket name. Child config resources (versioning,
      // encryption, public-access-block) have no useful console page.
      return kind === "bucketV2" || kind === "bucket"
        ? id
          ? `https://s3.console.aws.amazon.com/s3/buckets/${enc(id)}?region=${r}`
          : `https://s3.console.aws.amazon.com/s3/home?region=${r}`
        : null;
    case "ecs":
      if (kind === "cluster" && id)
        return `https://console.aws.amazon.com/ecs/v2/clusters/${enc(id)}/services?region=${r}`;
      return `https://console.aws.amazon.com/ecs/v2/clusters?region=${r}`;
    case "iam":
      // Global service. A role's physical id is its name.
      return kind === "role" && id
        ? `https://console.aws.amazon.com/iam/home#/roles/${enc(id)}`
        : `https://console.aws.amazon.com/iam/home#/roles`;
    case "cloudwatch":
      return `https://console.aws.amazon.com/cloudwatch/home?region=${r}#logsV2:log-groups`;
    case "lightsail":
      return `https://lightsail.aws.amazon.com/ls/webapp/${r}/instances`;
    default:
      return null;
  }
}

/** Deep-link to an EC2 instance's detail page. */
export function ec2InstanceConsoleUrl(
  instanceId: string | undefined,
  region: string | undefined,
): string | null {
  if (!instanceId) return null;
  return `https://console.aws.amazon.com/ec2/home?region=${region || "us-east-1"}#InstanceDetails:instanceId=${instanceId}`;
}

/** Deep-link to a Lightsail instance's connect page. */
export function lightsailInstanceConsoleUrl(
  instanceName: string | undefined,
  region: string | undefined,
): string | null {
  if (!instanceName || !region) return null;
  return `https://lightsail.aws.amazon.com/ls/webapp/${region}/instances/${instanceName}/connect`;
}
