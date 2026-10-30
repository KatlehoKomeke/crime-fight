import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import type * as cognito from 'aws-cdk-lib/aws-cognito'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as logs from 'aws-cdk-lib/aws-logs'
import type * as rds from 'aws-cdk-lib/aws-rds'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import * as triggers from 'aws-cdk-lib/triggers'
import type { Construct } from 'constructs'
import type { StageConfig } from '../config'
import { fromRoot, repoRoot } from '../paths'

interface ApiStackProps extends StackProps {
  config: StageConfig
  cluster: rds.DatabaseCluster
  userPool: cognito.IUserPool
}

/** esbuild settings shared by every TypeScript Lambda in the monorepo. */
export const bundling: nodejs.BundlingOptions = {
  format: nodejs.OutputFormat.ESM,
  target: 'node24',
  mainFields: ['module', 'main'],
  minify: true,
  sourceMap: true,
  // The Node.js runtime ships AWS SDK v3; pg-native is an optional pg addon we never load.
  externalModules: ['@aws-sdk/*', 'pg-native'],
  banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
}

/**
 * GraphQL API: one Lambda behind an HTTP API (reached through CloudFront at
 * `/graphql`), plus a deploy-time migration Trigger that must succeed before
 * the new API version is rolled out.
 */
export class ApiStack extends Stack {
  readonly httpApi: apigwv2.HttpApi

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)
    const { config, cluster, userPool } = props
    const dbEnv = { DB_CLUSTER_ARN: cluster.clusterArn, DB_SECRET_ARN: cluster.secret!.secretArn, DB_NAME: 'civic' }
    const common = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      projectRoot: repoRoot,
      depsLockFilePath: fromRoot('pnpm-lock.yaml'),
      tracing: lambda.Tracing.ACTIVE,
    }

    const graphql = new nodejs.NodejsFunction(this, 'Graphql', {
      ...common,
      entry: fromRoot('apps/api/src/handlers/graphql.ts'),
      memorySize: config.api.memoryMb,
      timeout: Duration.seconds(29),
      reservedConcurrentExecutions: config.api.reservedConcurrency,
      bundling,
      logGroup: new logs.LogGroup(this, 'GraphqlLogs', { retention: logs.RetentionDays.ONE_MONTH }),
      environment: {
        ...dbEnv,
        STAGE: config.stage,
        AUTH_MODE: 'cognito',
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        PERSISTED_ONLY: String(config.persistedOnly),
        GRAPHIQL: String(config.stage !== 'prod'),
        NODE_OPTIONS: '--enable-source-maps',
      },
    })
    cluster.grantDataApiAccess(graphql)

    const migrate = new nodejs.NodejsFunction(this, 'Migrate', {
      ...common,
      entry: fromRoot('apps/api/src/handlers/migrate.ts'),
      memorySize: 512,
      timeout: Duration.minutes(5),
      environment: dbEnv,
      bundling: {
        ...bundling,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          // Ship the SQL migrations next to the handler. The function's code hash
          // includes them, so the Trigger re-runs exactly when migrations change.
          afterBundling: (inputDir, outputDir) => [`cp -R "${inputDir}/packages/db/migrations" "${outputDir}/migrations"`],
        },
      },
    })
    cluster.grantDataApiAccess(migrate)
    new triggers.Trigger(this, 'RunMigrations', {
      handler: migrate,
      executeBefore: [graphql],
      executeOnHandlerChange: true,
      timeout: Duration.minutes(5),
    })

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', { apiName: `civic-${config.stage}` })
    const integration = new HttpLambdaIntegration('GraphqlIntegration', graphql)
    this.httpApi.addRoutes({ path: '/graphql', methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration })
    this.httpApi.addRoutes({ path: '/health', methods: [apigwv2.HttpMethod.GET], integration })
    const stage = this.httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage
    stage.defaultRouteSettings = { throttlingRateLimit: config.api.throttleRate, throttlingBurstLimit: config.api.throttleBurst }

    this.alarms(config, graphql)

    new CfnOutput(this, 'GraphqlEndpoint', { value: `${this.httpApi.apiEndpoint}/graphql` })
  }

  private alarms(config: StageConfig, graphql: lambda.IFunction) {
    const topic = new sns.Topic(this, 'Alarms', { displayName: `CIVIC/ONE ${config.stage} alarms` })
    if (config.alarmEmail) topic.addSubscription(new subscriptions.EmailSubscription(config.alarmEmail))
    const notify = new actions.SnsAction(topic)
    const window = { period: Duration.minutes(5) }

    const definitions: Array<[string, cloudwatch.IMetric, number]> = [
      ['GraphqlErrors', graphql.metricErrors(window), 5],
      ['GraphqlThrottles', graphql.metricThrottles(window), 1],
      ['GraphqlSlow', graphql.metricDuration({ ...window, statistic: 'p99' }), 3000],
      ['Api5xx', this.httpApi.metricServerError(window), 10],
    ]
    for (const [name, metric, threshold] of definitions) {
      new cloudwatch.Alarm(this, name, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(notify)
    }
  }
}
