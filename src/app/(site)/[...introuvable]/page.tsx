import { notFound } from "next/navigation";

/** Toute URL inconnue affiche la page 404 dans le gabarit du site. */
export default function CatchAll() {
  notFound();
}
