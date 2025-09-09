// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// חשוב: base חייב להיות הנתיב של הריפו שלך בגיטהאב, כולל הסלאשים משני הצדדים
// במקרה שלך: /KATREGEL-Gan-Daniel/
export default defineConfig({
  plugins: [react()],
  base: '/KATREGEL-Gan-Daniel/',
})
