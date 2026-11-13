"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { dictionaries, type Dictionary } from "@/lib/i18n/dictionaries";
import { formatBytes } from "@/lib/utils";

type I18n = { locale: Locale; t: Dictionary; bytes: (n: number) => string; apiMessage: (code: string | undefined, serverMessage: string | undefined) => string | undefined };

const make = (locale: Locale): I18n => {
  const t = dictionaries[locale];
  return {
    locale,
    t,
    bytes: (n) => formatBytes(n, t.units),
    // Le serveur rédige ses messages en français ; les autres langues passent par le code de l'erreur.
    apiMessage: (code, serverMessage) => (locale === DEFAULT_LOCALE ? serverMessage : ((code && t.failures.messages[code]) || (serverMessage ? t.failures.generic : undefined))),
  };
};

const Context = createContext<I18n>(make(DEFAULT_LOCALE));

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => make(locale), [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
