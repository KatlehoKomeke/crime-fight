import { builder } from './builder'
import './types'
import './query'
import './mutation'
import './messaging'

export const schema = builder.toSchema({ sortSchema: true })
