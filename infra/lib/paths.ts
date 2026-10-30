import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const fromRoot = (...segments: string[]) => path.join(repoRoot, ...segments)
