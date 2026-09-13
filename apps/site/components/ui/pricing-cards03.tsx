"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PricingPlan = {
  title: string;
  price: string;
  billing: string;
  features: string[];
  button: string;
  href?: string;
  recommended?: boolean;
};

const defaultPlans: PricingPlan[] = [
  { title: "Starter Pack - Yearly Subscription", price: "$19", billing: "charged annually", features: ["Includes 40+ UI components and patterns", "Access to 3 production-ready templates", "License for personal and freelance projects", "Continue using components after subscription ends"], button: "Subscribe for a Year", href: "/cadastro" },
  { title: "Pro Pack - Lifetime Access", price: "$39", billing: "one-time fee", recommended: true, features: ["Includes 40+ UI components and patterns", "3 production templates built with React & Tailwind", "Commercial license for client work", "Lifetime usage with no renewals", "Free access to all future updates and additions"], button: "Buy Lifetime Access", href: "/cadastro" },
  { title: "Enterprise Pack", price: "$59", billing: "single payment", features: ["Everything from the Pro plan", "Up to 20 team members included", "Priority support & onboarding help"], button: "Get Enterprise Plan", href: "/cadastro" },
];

export default function Pricing_03({ plans = defaultPlans, className }: { plans?: PricingPlan[]; className?: string }) {
  const [first, second, third] = plans;
  if (!first || !second || !third) return null;
  return (
    <section className={cn("mx-auto w-full max-w-5xl px-4 py-16", className)}>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {[first, second].map((plan) => <PricingCard key={plan.title} plan={plan} />)}
      </div>
      <div className="grid grid-cols-1"><PricingCard plan={third} enterprise /></div>
    </section>
  );
}

function PricingCard({ plan, enterprise = false }: { plan: PricingPlan; enterprise?: boolean }) {
  return (
    <Card className={cn("flex flex-col rounded-none border-zinc-200 bg-white text-zinc-950 shadow-lg transition-all duration-300 hover:shadow-xl", plan.recommended && "relative z-[1] border-4 border-emerald-200 shadow-2xl")}>
      <CardContent className="flex flex-1 flex-col gap-5 p-6">
        {plan.recommended ? <span className="text-sm font-semibold text-emerald-700">Recomendado</span> : null}
        <div><h3 className="text-2xl font-bold">{plan.title}</h3><p className="mt-2 text-4xl font-extrabold">{plan.price}</p><p className="text-sm text-zinc-500">{plan.billing}</p></div>
        <ul className="space-y-3">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-[15px]"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" /><span>{feature}</span></li>)}</ul>
        <div className="relative mt-auto w-full pt-2">
          {enterprise ? <div className="absolute inset-x-5 inset-y-2 -z-0 rounded-xl bg-[linear-gradient(90deg,#22c55e,#84cc16,#14b8a6,#22c55e)] bg-[length:300%_300%] opacity-30 blur-xl animate-rainbow-glow" aria-hidden="true" /> : null}
          <Button className="ui-button relative z-[1] mt-2 w-full" asChild><Link href={plan.href || "/cadastro"}>{plan.button}</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
