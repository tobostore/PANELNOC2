import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1E4FFF",
          foreground: "#FFFFFF"
        },
        sidebar: "#F5F7FB",
        text: {
          DEFAULT: "#1F2937",
          muted: "#6B7280"
        },
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        card: "#FFFFFF"
      },
      boxShadow: {
        soft: "0 20px 44px rgba(30, 79, 255, 0.12)",
        card: "0 12px 32px rgba(15, 23, 42, 0.08)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"]
      },
      borderRadius: {
        xl: "18px"
      }
    }
  },
  plugins: []
};

export default config;
