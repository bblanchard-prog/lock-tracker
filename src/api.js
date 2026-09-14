// In dev, Vite proxies /api to localhost:3001. In prod, /api is Vercel functions.
export const API = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api'
