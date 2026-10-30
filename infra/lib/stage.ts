import { Stage, type StageProps } from 'aws-cdk-lib'
import type { Construct } from 'constructs'
import type { StageConfig } from './config'
import { ApiStack } from './stacks/api-stack'
import { AuthStack } from './stacks/auth-stack'
import { DataStack } from './stacks/data-stack'
import { WebStack } from './stacks/web-stack'

/**
 * Everything one environment needs. Deployed as `Qa/*` and `Prod/*`:
 *
 *   Data (VPC, Aurora) ─┐
 *   Auth (Cognito) ─────┼─► Api (GraphQL Lambda, migrations) ─► Web (SSR, CloudFront, app client)
 */
export class CivicStage extends Stage {
  constructor(scope: Construct, id: string, props: StageProps & { config: StageConfig }) {
    super(scope, id, props)
    const { config } = props

    const data = new DataStack(this, 'Data', { config })
    const auth = new AuthStack(this, 'Auth', { config })
    const api = new ApiStack(this, 'Api', { config, cluster: data.cluster, userPool: auth.userPool })
    new WebStack(this, 'Web', { config, api: api.httpApi, userPool: auth.userPool, cognitoDomain: auth.domainName })
  }
}
