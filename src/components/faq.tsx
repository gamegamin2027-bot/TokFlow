"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";

export type FaqItem = { q: string; a: string };

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <Accordion.Root type="single" collapsible className="divide-y divide-line rounded-card border border-line bg-white">
      {items.map((item, i) => (
        <Accordion.Item key={i} value={`item-${i}`}>
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-6 px-5 py-4.5 text-left text-[15px] font-medium text-ink sm:px-6">
              {item.q}
              <Plus className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-45" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="tf-acc overflow-hidden">
            <p className="px-5 pb-5 text-sm leading-7 text-muted sm:px-6">{item.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
