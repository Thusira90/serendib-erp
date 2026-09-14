import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // SGS brand palette (from logo)
        sgs: {
          teal: {
            50: "#EEF3F4",
            100: "#D6E1E4",
            200: "#A9C1C7",
            300: "#7BA0AA",
            400: "#4D808E",
            500: "#2C5F6C", // primary teal
            600: "#234C57",
            700: "#1A3942",
            800: "#12262D",
            900: "#0A171B",
          },
          purple: {
            50: "#F1E9F3",
            100: "#DDC8E2",
            200: "#BB94C5",
            300: "#986BA5",
            400: "#734780",
            500: "#501464", // primary purple
            600: "#3F1050",
            700: "#2E0B3B",
            800: "#1F0728",
            900: "#100416",
          },
          ink: "#0F1414",
          bone: "#F7F5F1",
          cream: "#FAF7F1",
          stone: "#E5E4E0",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        luxe: "0 1px 2px rgba(15,20,20,0.04), 0 8px 24px -12px rgba(44,95,108,0.15)",
        "luxe-lg": "0 4px 8px rgba(15,20,20,0.06), 0 24px 48px -20px rgba(80,20,100,0.18)",
      },
      backgroundImage: {
        "sgs-gradient": "linear-gradient(135deg, #2C5F6C 0%, #501464 100%)",
        "sgs-gradient-soft": "linear-gradient(135deg, rgba(44,95,108,0.08) 0%, rgba(80,20,100,0.08) 100%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
