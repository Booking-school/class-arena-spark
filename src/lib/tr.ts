import { useTranslation } from "react-i18next";

/**
 * Hook that returns a translator using Thai source strings as keys.
 * Components must call this to subscribe to language changes.
 */
export function useTr() {
  const { i18n } = useTranslation();
  return (thai: string): string => {
    const v = i18n.t(thai, { defaultValue: thai });
    return typeof v === "string" ? v : thai;
  };
}
