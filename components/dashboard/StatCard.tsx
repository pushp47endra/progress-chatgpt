import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Basics";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <Icon size={14} />
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>}
    </Card>
  );
}
