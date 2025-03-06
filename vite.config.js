import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: "/jongu/", // Change "jongu" to your actual GitHub repo name
});
