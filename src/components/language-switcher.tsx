import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const current = i18n.resolvedLanguage ?? "th";

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("lang");
      if ((saved === "th" || saved === "en") && saved !== i18n.language) {
        i18n.changeLanguage(saved);
      }
    } catch {
      // localStorage may be unavailable in SSR-like previews.
    }
  }, [i18n]);

  function change(lng: "th" | "en") {
    i18n.changeLanguage(lng);
    try {
      localStorage.setItem("lang", lng);
    } catch {
      // localStorage may be unavailable in SSR-like previews.
    }
  }

  // Render a stable label during SSR / first paint to avoid hydration mismatch.
  const label = mounted ? (current === "th" ? "🇹🇭 ไทย" : "🇬🇧 EN") : "🇹🇭 ไทย";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-11 gap-1.5 font-medium">
          <Languages className="size-4" />
          <span suppressHydrationWarning>{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => change("th")}>🇹🇭 ไทย</DropdownMenuItem>
        <DropdownMenuItem onClick={() => change("en")}>🇬🇧 English</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
