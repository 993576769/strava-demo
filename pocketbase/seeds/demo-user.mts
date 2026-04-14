export interface DemoUserSeed {
  email: string
  password: string
  name: string
  isActive: boolean
  isAdmin: boolean
}

export const demoUserSeed: DemoUserSeed = {
  email: 'demo@example.com',
  password: 'demo123456',
  name: 'Template Demo',
  isActive: true,
  isAdmin: true,
}
