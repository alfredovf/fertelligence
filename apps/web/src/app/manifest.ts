import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fertelligence",
    short_name: "Fertelligence",
    description: "Tareas cortas, claras y a tu ritmo.",
    lang: "es-AR",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#3346c8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
