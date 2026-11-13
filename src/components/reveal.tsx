"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Apparition douce d'un bloc quand il entre dans l'écran, une seule fois.
 * Le déplacement est supprimé si le visiteur a demandé moins d'animations (réglage du système).
 */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" }) {
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <MotionConfig reducedMotion="user">
      <Tag
        data-reveal
        className={className}
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -8% 0px" }}
        transition={{ duration: 0.5, delay, ease: EASE }}
      >
        {children}
      </Tag>
    </MotionConfig>
  );
}
