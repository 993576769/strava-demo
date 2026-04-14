import { fileURLToPath } from 'node:url'
import antfu from '@antfu/eslint-config'
import tailwind from 'eslint-plugin-tailwindcss'

const tailwindConfigs = tailwind.configs['flat/recommended'].map(config => ({
  ...config,
  files: ['frontend/**/*.{vue,js,mjs,cjs,ts,mts,jsx,tsx}'],
}))

const tailwindEntry = fileURLToPath(new URL('./frontend/src/style.css', import.meta.url))

export default antfu(
  {
    lessOpinionated: true,
    vue: true,
    typescript: true,
    jsonc: false,
    yaml: false,
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'docs/**',
      'pb_data/**',
      'pocketbase/pb_hooks/**',
      'pocketbase/pb_migrations/**',
      'pocketbase/scripts/**',
      'pocketbase/types/**',
      'pocketbase/README.md',
      'pocketbase/tsconfig*.json',
      'scripts/**',
      'docker-compose.yml',
      'frontend/package.json',
      'frontend/postcss.config.js',
      'frontend/vite.config.*',
      'frontend/src/types/pocketbase.generated.ts',
    ],
  },
  ...tailwindConfigs,
  {
    settings: {
      tailwindcss: {
        config: tailwindEntry,
        cssFiles: ['frontend/src/**/*.css'],
      },
    },
    rules: {
      'eslintstyle/max-statements-per-line': 0,
      'style/max-statements-per-line': 0,
    },
  },
)
