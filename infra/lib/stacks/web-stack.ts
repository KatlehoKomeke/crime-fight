import { existsSync } from 'node:fs'
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import type * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import type * as appsync from 'aws-cdk-lib/aws-appsync'
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
  /** AppSync Events API the app connects to for live messages. */
  realtime: appsync.IEventApi
  userPool: cognito.IUserPool
  cognitoDomain: string
  ssoProviders: SsoProvider[]
}

const CLIENT_PROVIDER: Record<SsoProvider, cognito.UserPoolClientIdentityProvider> = {
  google: cognito.UserPoolClientIdentityProvider.GOOGLE,
  apple: cognito.UserPoolClientIdentityProvider.APPLE,
}

/**
 * Requests pages through CloudFront one at a time, once a minute. Each reaches
 * the SSR Lambda, whose loaders call the GraphQL Lambda, so an instance of both
 * stays warm and visitors rarely meet a cold start.
 */
const WARMER_SOURCE = `
exports.handler = async () => {
  const log = []
  for (const path of process.env.WARM_PATHS.split(',')) {
    const started = Date.now()
    try {
      const res = await fetch(process.env.SITE_URL + path, { headers: { accept: 'text/html', 'accept-encoding': 'br, gzip', 'user-agent': 'civic-warmer' } })
      await res.arrayBuffer()
      log.push(path + ' ' + res.status + ' ' + (Date.now() - started) + 'ms')
    } catch (error) {
      log.push(path + ' failed: ' + error)
    }
  }
  console.log(log.join(' | '))
}
`

/**
 * One CloudFront distribution serves everything on one origin:
 *   /_expo/static/*, /assets/*, root files → S3 (immutable, hashed)
 *   /graphql                               → HTTP API (GraphQL Lambda)
 *   /og/*                                  → HTTP API (Og Lambda), cached: see cardCache
 *   everything else                        → SSR Lambda (streaming Function URL)
 * Same-origin means no CORS for the browser and one TLS connection per visit.
 *
 * Pages and the API are not cached at the edge. CloudFront has no regional edge
 * cache in Africa, so every cacheable miss from the Cape Town edge went via
 * Europe and back: about +550ms, measured on every signed-in read and every
 * page that wasn't already cached. Uncacheable requests go straight from the
 * edge to af-south-1 instead, and the Lambdas compress their own responses.
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props)
    const { config, api, realtime, userPool, cognitoDomain, ssoProviders } = props
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
        CIVIC_REALTIME_URL: `wss://${realtime.realtimeDns}/event/realtime`,
        CIVIC_REALTIME_HOST: realtime.httpDns,
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

    const apiOrigin = new origins.HttpOrigin(apiDomain, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY })

    // Link preview cards, unlike pages, are cached at the edge: they're read by
    // link-preview crawlers, mostly in Europe and the US, and each version of a
    // card is drawn once and then never changes (its URL changes instead). The
    // Og function sets the TTLs: a year for a current version, minutes for redirects.
    const cardCache = new cloudfront.CachePolicy(this, 'CardCache', {
      comment: `CIVIC/ONE ${stage} link preview cards`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('v'),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.days(1),
      maxTtl: Duration.days(365),
    })

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
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // Includes Accept-Encoding (the function compresses) and x-forwarded-host.
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [{ function: forwardHost, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
        responseHeadersPolicy: headers,
      },
      additionalBehaviors: {
        '/_expo/static/*': staticAssets,
        '/assets/*': staticAssets,
        '/favicon.svg': staticAssets,
        // PNG icons for link previews and home screens that can't use the SVG.
        '/apple-touch-icon.png': staticAssets,
        '/icon-192.png': staticAssets,
        '/robots.txt': staticAssets,
        '/graphql': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
        '/og/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cardCache,
          responseHeadersPolicy: headers,
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
        timeout: Duration.seconds(30),
        environment: { SITE_URL: siteUrl, WARM_PATHS: '/,/notifications,/explore,/map' },
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
