import { existsSync } from 'node:fs'
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import type * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as events from 'aws-cdk-lib/aws-events'
import * as eventTargets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'
import { appScheme, type StageConfig } from '../config'
import { fromRoot } from '../paths'
import type { SsoProvider } from './auth-stack'

interface WebStackProps extends StackProps {
  config: StageConfig
  api: apigwv2.HttpApi
  userPool: cognito.IUserPool
  cognitoDomain: string
  ssoProviders: SsoProvider[]
}

const CLIENT_PROVIDER: Record<SsoProvider, cognito.UserPoolClientIdentityProvider> = {
  google: cognito.UserPoolClientIdentityProvider.GOOGLE,
  apple: cognito.UserPoolClientIdentityProvider.APPLE,
}

/**
 * Requests pages through CloudFront one at a time (concurrency stays low while
 * the account's Lambda quota is small). An expired edge copy sends the request
 * on to the SSR Lambda, whose loader calls the GraphQL Lambda, so both stay warm.
 * Two passes a minute (EventBridge's smallest interval is one minute) because
 * an edge copy is usable for 60s at most: 30s fresh plus 30s stale.
 */
const WARMER_SOURCE = `
const pass = async () => {
  const log = []
  for (const path of process.env.WARM_PATHS.split(',')) {
    const started = Date.now()
    try {
      const res = await fetch(process.env.SITE_URL + path, { headers: { accept: 'text/html', 'accept-encoding': 'br, gzip', 'user-agent': 'civic-warmer' } })
      await res.arrayBuffer()
      log.push(path + ' ' + res.status + ' ' + (res.headers.get('x-cache') || '') + ' ' + (Date.now() - started) + 'ms')
    } catch (error) {
      log.push(path + ' failed: ' + error)
    }
  }
  console.log(log.join(' | '))
}
exports.handler = async () => {
  const started = Date.now()
  await pass()
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 30000 - (Date.now() - started))))
  await pass()
}
`

/**
 * One CloudFront distribution serves everything on one origin:
 *   /_expo/static/*, /assets/*, root files → S3 (immutable, hashed)
 *   /graphql                               → HTTP API (GraphQL Lambda)
 *   everything else                        → SSR Lambda (streaming Function URL)
 * Same-origin means no CORS for the browser and one TLS connection per visit.
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props)
    const { config, api, userPool, cognitoDomain, ssoProviders } = props
    const stage = config.stage

    const client = fromRoot('apps/app/dist/client')
    const ssrBundle = fromRoot('apps/app/.lambda')
    if (!existsSync(client) || !existsSync(ssrBundle)) {
      throw new Error('Web build missing. Run `pnpm --filter @civic/app build` before synthesising.')
    }

    const bucket = new s3.Bucket(this, 'Assets', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Values that only exist once CloudFront/Cognito are created are read by the
    // SSR Lambda from SSM at cold start. Passing them as env vars would create a
    // dependency cycle: distribution → function URL → function → client → distribution.
    const publicConfigParam = `/civic/${stage}/web/public-config`
    const apiDomain = Fn.select(2, Fn.split('/', api.apiEndpoint))

    const ssr = new lambda.Function(this, 'Ssr', {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(ssrBundle),
      memorySize: config.web.memoryMb,
      timeout: Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'SsrLogs', { retention: logs.RetentionDays.ONE_MONTH }),
      environment: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--enable-source-maps',
        CIVIC_STAGE: stage,
        CIVIC_AUTH_MODE: 'cognito',
        CIVIC_COGNITO_DOMAIN: cognitoDomain,
        CIVIC_SSO_PROVIDERS: ssoProviders.join(','),
        CIVIC_PUBLIC_API_URL: '/graphql',
        CIVIC_API_INTERNAL_URL: `https://${apiDomain}/graphql`,
        CIVIC_PERSISTED_QUERIES: 'true',
        CIVIC_PUBLIC_CONFIG_PARAM: publicConfigParam,
      },
    })
    ssr.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: publicConfigParam.slice(1) })],
      }),
    )
    const ssrUrl = ssr.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM, invokeMode: lambda.InvokeMode.RESPONSE_STREAM })

    // The Function URL only sees its own hostname; pass the public one along.
    const forwardHost = new cloudfront.Function(this, 'ForwardHost', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event){var r=event.request;r.headers['x-forwarded-host']={value:r.headers.host.value};return r;}",
      ),
    })

    const headers = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [{ header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)', override: true }],
      },
    })

    const staticAssets: cloudfront.BehaviorOptions = {
      origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: headers,
      compress: true,
    }

    const certificate = config.certificateArn ? acm.Certificate.fromCertificateArn(this, 'Certificate', config.certificateArn) : undefined
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: `CIVIC/ONE ${stage}`,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      ...(config.domainName && certificate ? { domainNames: [config.domainName], certificate } : {}),
      defaultBehavior: {
        origin: origins.FunctionUrlOrigin.withOriginAccessControl(ssrUrl),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        // Honour the SSR response's Cache-Control (anonymous HTML: s-maxage=10, swr=60).
        cachePolicy: new cloudfront.CachePolicy(this, 'SsrCache', {
          minTtl: Duration.seconds(0),
          defaultTtl: Duration.seconds(0),
          maxTtl: Duration.hours(1),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
          enableAcceptEncodingBrotli: true,
          enableAcceptEncodingGzip: true,
        }),
        originRequestPolicy: new cloudfront.OriginRequestPolicy(this, 'SsrOrigin', {
          queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
          headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('x-forwarded-host', 'accept-language', 'cloudfront-viewer-country'),
        }),
        functionAssociations: [{ function: forwardHost, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
        responseHeadersPolicy: headers,
        compress: true,
      },
      additionalBehaviors: {
        '/_expo/static/*': staticAssets,
        '/assets/*': staticAssets,
        '/favicon.svg': staticAssets,
        '/robots.txt': staticAssets,
        '/graphql': {
          origin: new origins.HttpOrigin(apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          // Honours the API's Cache-Control: signed-out GET reads are shared for
          // ~a minute, everything else is no-store. Authorization is part of the
          // key, so a signed-in request never gets a shared (or anyone else's) answer.
          cachePolicy: new cloudfront.CachePolicy(this, 'ApiCache', {
            minTtl: Duration.seconds(0),
            defaultTtl: Duration.seconds(0),
            maxTtl: Duration.minutes(1),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
            enableAcceptEncodingBrotli: true,
            enableAcceptEncodingGzip: true,
          }),
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
          compress: true,
        },
      },
    })

    // Hashed bundles are immutable and never pruned, so a tab still running the
    // previous release can keep lazy-loading its chunks after a deploy.
    // Directories must be re-included themselves: like .gitignore, an excluded
    // directory is never descended into, so `!_expo/**` alone matches nothing.
    new s3deploy.BucketDeployment(this, 'DeployHashedAssets', {
      sources: [s3deploy.Source.asset(client, { exclude: ['*', '!_expo', '!_expo/**', '!assets', '!assets/**'] })],
      destinationBucket: bucket,
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      memoryLimit: 1024,
    })
    new s3deploy.BucketDeployment(this, 'DeployRootFiles', {
      sources: [s3deploy.Source.asset(client, { exclude: ['_expo/**', 'assets/**'] })],
      destinationBucket: bucket,
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=300')],
      distribution,
      distributionPaths: ['/*'],
    })

    const siteUrl = config.domainName ? `https://${config.domainName}` : `https://${distribution.distributionDomainName}`
    const scheme = appScheme(stage)

    if (config.warm) {
      const warmer = new lambda.Function(this, 'Warmer', {
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        handler: 'index.handler',
        code: lambda.Code.fromInline(WARMER_SOURCE),
        memorySize: 128,
        timeout: Duration.seconds(50),
        environment: { SITE_URL: siteUrl, WARM_PATHS: '/,/alerts,/explore,/map' },
        logGroup: new logs.LogGroup(this, 'WarmerLogs', { retention: logs.RetentionDays.ONE_WEEK }),
      })
      new events.Rule(this, 'WarmEveryMinute', {
        schedule: events.Schedule.rate(Duration.minutes(1)),
        targets: [new eventTargets.LambdaFunction(warmer, { retryAttempts: 0 })],
      })
    }

    const appClient = new cognito.UserPoolClient(this, 'AppClient', {
      userPool,
      userPoolClientName: `civic-${stage}-app`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${siteUrl}/auth/callback`, `${scheme}://auth/callback`, ...config.extraCallbackUrls],
        // The app signs out through Cognito's /logout, which only returns to these.
        logoutUrls: [siteUrl, `${scheme}://`, ...config.extraCallbackUrls.map((url) => new URL(url).origin)],
      },
      // SSO only. Before any provider is configured, COGNITO keeps the client
      // valid, but with self sign-up off nobody can create an account through it.
      supportedIdentityProviders: ssoProviders.length ? ssoProviders.map((p) => CLIENT_PROVIDER[p]) : [cognito.UserPoolClientIdentityProvider.COGNITO],
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    })
    // Federated sign-in uses no API auth flows. CDK can't express "refresh only"
    // (omitting authFlows means Cognito's defaults, which include password SRP).
    const cfnClient = appClient.node.defaultChild as cognito.CfnUserPoolClient
    cfnClient.explicitAuthFlows = ['ALLOW_REFRESH_TOKEN_AUTH']

    new cognito.CfnManagedLoginBranding(this, 'LoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: appClient.userPoolClientId,
      useCognitoProvidedValues: true,
    })

    new ssm.StringParameter(this, 'PublicConfig', {
      parameterName: publicConfigParam,
      description: 'Public runtime config for the SSR Lambda (not secret).',
      stringValue: this.toJsonString({ CIVIC_SITE_URL: siteUrl, CIVIC_COGNITO_CLIENT_ID: appClient.userPoolClientId }),
    })

    if (config.domainName && config.hostedZoneId && config.hostedZoneName) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', { hostedZoneId: config.hostedZoneId, zoneName: config.hostedZoneName })
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))
      new route53.ARecord(this, 'AliasA', { zone, recordName: config.domainName, target })
      new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: config.domainName, target })
    }

    new CfnOutput(this, 'SiteUrl', { value: siteUrl })
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    new CfnOutput(this, 'AppClientId', { value: appClient.userPoolClientId })
  }
}
