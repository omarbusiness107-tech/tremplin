"use client";

import { useEffect, useState } from "react";
import { Monitor, MoonStar, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type Theme = "system" | "light" | "dark";

const ORDER: Theme[] = ["system", "light", "dark"];

export function ThemeToggle({
  labels,
}: {
  labels: { theme: string; system: string; light: string; dark: string };
}) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem("tremplin-theme");
    const initial = stored === "light" || stored === "dark" ? stored : "system";
    applyTheme(initial);
    const frame = window.requestAnimationFrame(() => setTheme(initial));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;

    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => applyTheme("system");
    preference.addEventListener("change", followSystem);
    return () => preference.removeEventListener("change", followSystem);
  }, [theme]);

  function cycleTheme() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    if (next === "system") {
      window.localStorage.removeItem("tremplin-theme");
    } else {
      window.localStorage.setItem("tremplin-theme", next);
    }
  }

  const label = labels[theme];
  const Icon = theme === "light" ? Sun : theme === "dark" ? MoonStar : Monitor;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`${labels.theme}: ${label}`}
      title={`${labels.theme}: ${label}`}
    >
      <Icon aria-hidden />
    </Button>
  );
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
    root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
  } else {
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
  }
}
