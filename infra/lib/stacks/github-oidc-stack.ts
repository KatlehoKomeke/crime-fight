import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'

/**
 * Deployed once per AWS account by an admin. GitHub Actions exchanges its OIDC
 * token for this role — no long-lived AWS keys in GitHub. The role can only
 * assume the CDK bootstrap roles, and only from this repo's `qa` and
 * `production` environments (whose protection rules gate prod).
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { repository: string }) {
    super(scope, id, props)

    // An account can have only one provider per URL; reuse it if it already exists.
    const existing = process.env.GITHUB_OIDC_PROVIDER_ARN
    const provider = existing
      ? iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GithubProvider', existing)
      : new iam.OpenIdConnectProvider(this, 'GithubProvider', { url: 'https://token.actions.githubusercontent.com', clientIds: ['sts.amazonaws.com'] })

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'civic-github-deploy',
      description: `GitHub Actions deploys for ${props.repository}`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: {
          'token.actions.githubusercontent.com:sub': [`repo:${props.repository}:environment:qa`, `repo:${props.repository}:environment:production`],
        },
      }),
    })
    role.addToPolicy(new iam.PolicyStatement({ actions: ['sts:AssumeRole'], resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-*`] }))
    role.addToPolicy(new iam.PolicyStatement({ actions: ['cloudformation:DescribeStacks'], resources: ['*'] }))

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn, description: 'Set as AWS_DEPLOY_ROLE_ARN on the qa and production GitHub environments' })
  }
}
