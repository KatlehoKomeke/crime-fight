import { useEffect, useState } from 'react'

type Schemas = typeof import('@civic/core/schemas')

let loaded: Schemas | null = null
let loading: Promise<Schemas> | null = null

/**
 * The shared zod schemas, loaded when a form mounts rather than bundled with
 * every page: zod is a sizeable library and only three screens validate.
 * Null until it arrives (and on the server), so a form treats itself as
 * not-yet-valid in the meantime.
 */
export function useSchemas(): Schemas | null {
  const [schemas, setSchemas] = useState(loaded)
  useEffect(() => {
    if (loaded) return
    let active = true
    loading ??= import('@civic/core/schemas')
    void loading.then((module) => {
      loaded = module
      if (active) setSchemas(module)
    })
    return () => {
      active = false
    }
  }, [])
  return schemas
}
