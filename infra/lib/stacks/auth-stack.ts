import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import type { Construct } from 'constructs'
import type { StageConfig } from '../config'

/**
 * Cognito user pool with the managed login pages (hosted UI v2). App clients
 * live in the Web stack because their callback URLs depend on the CloudFront
 * domain.
 */
export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool
  /** e.g. civicone-qa-123456789012.auth.af-south-1.amazoncognito.com */
  readonly domainName: string

  constructor(scope: Construct, id: string, props: StackProps & { config: StageConfig }) {
    super(scope, id, props)
    const { stage } = props.config

    this.userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: `civic-${stage}`,
      selfSignUpEnabled: true,
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

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId })
    new CfnOutput(this, 'CognitoDomain', { value: this.domainName })
  }
}
