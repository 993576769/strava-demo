export type DemoTodoSeed = {
  title: string
  description?: string
  priority?: string
  completed?: boolean
  tags?: string[]
  sort_order?: number
}

export const demoTodosSeed: DemoTodoSeed[] = [
  {
    title: 'Review the starter structure',
    description: 'Look through the frontend, migrations, and seed scripts before replacing the demo module.',
    priority: 'high',
    completed: false,
    tags: ['starter', 'docs'],
    sort_order: 1,
  },
  {
    title: 'Replace the demo schema',
    description: 'Update PocketBase collections and add your own incremental migration files.',
    priority: 'medium',
    completed: false,
    tags: ['pocketbase'],
    sort_order: 2,
  },
  {
    title: 'Regenerate frontend types',
    description: 'Run pnpm run typegen:pocketbase after changing collections.',
    priority: 'medium',
    completed: false,
    tags: ['types'],
    sort_order: 3,
  },
  {
    title: 'Build your first screen',
    description: 'Replace the sample todo view with your actual product UI.',
    priority: 'low',
    completed: false,
    tags: ['frontend'],
    sort_order: 4,
  },
]
