import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	site: "https://nyt.bzsb.eu",
	output: "static",
	devToolbar: { enabled: false },
	trailingSlash: "never",
	// Inline the CSS so pages render without waiting for a separate stylesheet.
	build: { format: "file", inlineStylesheets: "always" },
	vite: { plugins: [tailwindcss()] },
});
