import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
    // GitHub Pages serves project sites under /<repo>/, not /  - the deploy
    // workflow sets VITE_BASE_PATH to that before building; local dev/builds
    // are untouched (falls back to root).
    base: process.env.VITE_BASE_PATH || "/",
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
