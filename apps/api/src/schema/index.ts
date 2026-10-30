import { builder } from './builder'
import './types'
import './query'
import './mutation'

export const schema = builder.toSchema({ sortSchema: true })
