import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

function getInitialDark() {
  // Everyone defaults to LIGHT mode. The old "theme" key auto-saved the
  // system preference on first load, so it can't be trusted as a user
  // choice — "theme2" is only ever written by an explicit toggle click.
  return localStorage.getItem("theme2") === "dark";
}

export function applyStoredTheme() {
  document.documentElement.classList.toggle("dark", getInitialDark());
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggle = () =>
    setDark((v) => {
      const next = !v;
      localStorage.setItem("theme2", next ? "dark" : "light");
      return next;
    });

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
      className="relative h-9 w-9 overflow-hidden rounded-xl text-gray-500 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
    >
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      >
        <Sun size={18} className="text-amber-500" />
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        }`}
      >
        <Moon size={18} className="text-indigo-300" />
      </span>
    </button>
  );
}
