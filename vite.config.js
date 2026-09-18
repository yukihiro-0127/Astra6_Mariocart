import { defineConfig } from 'vite';
export default defineConfig({base:'/Astra6_Mariocart/',build:{rollupOptions:{output:{manualChunks:{three:['three']}}}},server:{host:'127.0.0.1',port:5173,strictPort:true}});
