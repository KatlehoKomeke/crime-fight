import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import type { Construct } from 'constructs'
import type { StageConfig } from '../config'

/**
 * Aurora PostgreSQL 17 Serverless v2 with PostGIS (enabled by migration 0000).
 *
 * The API reaches it through the RDS Data API (HTTPS + IAM), so Lambdas run
 * outside the VPC: no NAT gateway, no ENI cold starts, no connection pool to
 * exhaust. The VPC therefore has isolated subnets only.
 */
export class DataStack extends Stack {
  readonly cluster: rds.DatabaseCluster

  constructor(scope: Construct, id: string, props: StackProps & { config: StageConfig }) {
    super(scope, id, props)
    const { database, stage } = props.config

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'db', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }],
    })

    const autoPause = database.minCapacity === 0
    this.cluster = new rds.DatabaseCluster(this, 'Cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_17_9 }),
      defaultDatabaseName: 'civic',
      credentials: rds.Credentials.fromGeneratedSecret('civic_admin', { secretName: `civic/${stage}/db-admin` }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.serverlessV2('writer', { autoMinorVersionUpgrade: true }),
      readers: Array.from({ length: database.readers }, (_, i) => rds.ClusterInstance.serverlessV2(`reader${i + 1}`, { scaleWithWriter: true })),
      serverlessV2MinCapacity: database.minCapacity,
      serverlessV2MaxCapacity: database.maxCapacity,
      ...(autoPause ? { serverlessV2AutoPauseDuration: Duration.minutes(15) } : {}),
      enableDataApi: true,
      storageEncrypted: true,
      iamAuthentication: true,
      deletionProtection: database.deletionProtection,
      backup: { retention: Duration.days(database.backupRetentionDays), preferredWindow: '01:00-02:00' },
      preferredMaintenanceWindow: 'Sun:02:30-Sun:03:30',
      cloudwatchLogsExports: ['postgresql'],
      removalPolicy: RemovalPolicy.SNAPSHOT,
    })

    new CfnOutput(this, 'ClusterArn', { value: this.cluster.clusterArn })
    new CfnOutput(this, 'SecretArn', { value: this.cluster.secret!.secretArn })
  }
}
