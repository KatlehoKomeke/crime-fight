import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import type { Construct } from 'constructs'
import type { StageConfig } from '../config'

/** Sign-in providers as the app names them (`CIVIC_SSO_PROVIDERS`). */
export type SsoProvider = 'google' | 'apple'

/**
 * Cognito user pool with the managed login pages (hosted UI v2). Sign-in is
 * federated only: Google and Apple, no email/password accounts. App clients
 * live in the Web stack because their callback URLs depend on the CloudFront
 * domain.
 */
export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool
  /** e.g. civicone-qa-123456789012.auth.af-south-1.amazoncognito.com */
  readonly domainName: string
  /** Configured providers; app clients must offer exactly these. */
  readonly ssoProviders: SsoProvider[] = []

  constructor(scope: Construct, id: string, props: StackProps & { config: StageConfig }) {
    super(scope, id, props)
    const { stage, sso } = props.config

    this.userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: `civic-${stage}`,
      // Blocks email/password sign-up only: Cognito still creates users on
      // their first Google or Apple sign-in.
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true }, fullname: { required: false, mutable: true } },
      passwordPolicy: { minLength: 12, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: false },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      deletionProtection: stage === 'prod',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    })

    const prefix = `civicone-${stage}-${this.account}`
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: prefix },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    })
    this.domainName = `${prefix}.auth.${this.region}.amazoncognito.com`

    // Resolved by CloudFormation at deploy time; the values never enter the template.
    const secret = secretsmanager.Secret.fromSecretNameV2(this, 'SsoSecret', sso.secretName)
    if (sso.google) {
      new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: this.userPool,
        clientId: sso.google.clientId,
        clientSecretValue: secret.secretValueFromJson('googleClientSecret'),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          emailVerified: cognito.ProviderAttribute.GOOGLE_EMAIL_VERIFIED,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      })
      this.ssoProviders.push('google')
    }
    if (sso.apple) {
      new cognito.UserPoolIdentityProviderApple(this, 'Apple', {
        userPool: this.userPool,
        clientId: sso.apple.servicesId,
        teamId: sso.apple.teamId,
        keyId: sso.apple.keyId,
        privateKeyValue: secret.secretValueFromJson('applePrivateKey'),
        scopes: ['email', 'name'],
        // Apple sends the name on the first sign-in only, which is when the API provisions the user.
        attributeMapping: {
          email: cognito.ProviderAttribute.APPLE_EMAIL,
          emailVerified: cognito.ProviderAttribute.APPLE_EMAIL_VERIFIED,
          fullname: cognito.ProviderAttribute.APPLE_NAME,
        },
      })
      this.ssoProviders.push('apple')
    }

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId })
    new CfnOutput(this, 'CognitoDomain', { value: this.domainName })
  }
}
