import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served by the API at /console/ in production (same origin — no CORS).
// In dev, the proxy forwards API paths to the local backend, so the browser
// still only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  base: "/console/",
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/auth", "/admin", "/announcements", "/me", "/posts", "/uploads", "/arena"].map((p) => [
        p,
        { target: "http://localhost:3000", changeOrigin: true },
      ]),
    ),
  },
});
