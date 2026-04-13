export type DemoUserSeed = {
  email: string
  password: string
  name: string
  isActive: boolean
}

export const demoUserSeed: DemoUserSeed = {
  email: 'demo@example.com',
  password: 'demo123456',
  name: 'Template Demo',
  isActive: true,
}
