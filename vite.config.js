import { defineConfig } from 'vite';
const isProd = process.env.NODE_ENV === 'production';
export default defineConfig({base: isProd ? '/Astra6_Mariocart/' : '/',build:{rollupOptions:{output:{manualChunks:{three:['three']}}}},server:{host:'127.0.0.1',port:5173,strictPort:true}});
