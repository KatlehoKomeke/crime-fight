import { builder } from './builder'
import './types'
import './query'
import './mutation'
import './messaging'
import './bounties'

export const schema = builder.toSchema({ sortSchema: true })
