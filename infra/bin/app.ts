import { App, Tags } from 'aws-cdk-lib'
import { stages } from '../lib/config'
import { CivicStage } from '../lib/stage'
import { GithubOidcStack } from '../lib/stacks/github-oidc-stack'

const app = new App()

for (const config of Object.values(stages)) {
  const stage = new CivicStage(app, config.stage === 'prod' ? 'Prod' : 'Qa', { config, env: { account: config.account, region: config.region } })
  Tags.of(stage).add('project', 'civic-one')
  Tags.of(stage).add('stage', config.stage)
}

// One-time bootstrap per AWS account: lets GitHub Actions deploy via OIDC (no long-lived keys).
new GithubOidcStack(app, 'CivicGithubOidc', {
  repository: process.env.GITHUB_REPOSITORY ?? 'KatlehoKomeke/crime-fight',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'af-south-1' },
})

app.synth()
