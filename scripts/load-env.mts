import path from 'node:path'
import dotenv from 'dotenv'

export const loadEnv = (rootDir: string) => {
  dotenv.config({
    path: path.join(rootDir, '.env'),
    override: false,
  })

  dotenv.config({
    path: path.join(rootDir, '.env.local'),
    override: false,
  })
}
