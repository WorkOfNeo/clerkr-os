import type { Config } from "tailwindcss";

// Design foundation. The vocabulary here is deliberately small — one accent,
// one radius scale, one motion curve set — because consistency is what reads as
// "considered" far more than any individual value does.

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", lg: "2rem" },
      screens: { "2xl": "1280px" },
    },
    extend: {
      fontFamily: {
        // SF on Apple hardware, Inter everywhere else, so Windows gets the same
        // proportions rather than falling back to Segoe.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "var(--font-inter)",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["SF Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        hairline: "hsl(var(--hairline))",
        sidebar: "hsl(var(--sidebar))",
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
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
        xs: "6px",
        sm: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "24px",
      },
      boxShadow: {
        // Layered and soft. A single hard shadow is the fastest way to look cheap.
        hairline: "0 0 0 1px hsl(var(--hairline))",
        xs: "0 1px 2px -1px rgb(0 0 0 / 0.06), 0 1px 1px -1px rgb(0 0 0 / 0.04)",
        sm: "0 1px 3px rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        md: "0 4px 12px -2px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
        lg: "0 12px 32px -8px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.06)",
        xl: "0 24px 60px -12px rgb(0 0 0 / 0.18), 0 8px 20px -8px rgb(0 0 0 / 0.08)",
        pop: "0 20px 50px -12px rgb(0 0 0 / 0.22), 0 0 0 1px hsl(var(--hairline))",
      },
      transitionTimingFunction: {
        // The one curve most of the UI moves on — quick out, gentle settle.
        apple: "cubic-bezier(0.32, 0.72, 0, 1)",
        "apple-in": "cubic-bezier(0.4, 0, 1, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Transform only, no opacity: used for list content, where an animation
        // that never runs must still leave the row readable.
        "row-in": {
          from: { transform: "translateY(6px)" },
          to: { transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "sheet-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "sheet-out": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "drawer-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "drawer-out": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "overlay-out": { from: { opacity: "1" }, to: { opacity: "0" } },
      },
      animation: {
        "fade-in": "fade-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        "scale-in": "scale-in 0.22s cubic-bezier(0.32, 0.72, 0, 1)",
        "slide-up": "slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1) both",
        "row-in": "row-in 0.3s cubic-bezier(0.32, 0.72, 0, 1) both",
        shimmer: "shimmer 1.6s infinite",
        "sheet-in": "sheet-in 0.34s cubic-bezier(0.32, 0.72, 0, 1)",
        "sheet-out": "sheet-out 0.26s cubic-bezier(0.4, 0, 1, 1)",
        "drawer-in": "drawer-in 0.34s cubic-bezier(0.32, 0.72, 0, 1)",
        "drawer-out": "drawer-out 0.26s cubic-bezier(0.4, 0, 1, 1)",
        "overlay-in": "overlay-in 0.22s ease-out",
        "overlay-out": "overlay-out 0.2s ease-in",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
