// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // אל תשים תת-תיקייה. ב-Vercel זה חייב להיות '/' (או להסיר את המפתח)
})
