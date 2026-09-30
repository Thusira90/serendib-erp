import Link from "next/link";
import { ArrowRight, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Consistent empty-state renderer for module list pages. Explains WHAT this
 * stage is, WHERE it usually comes from (previous step), and offers a
 * direct call-to-action to create the first record.
 *
 * Use inside a <TableCell colSpan={N}> or by itself in a Card.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primary,
  secondary,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <div className="mx-auto max-w-md py-10 text-center space-y-3">
      <Icon className="h-8 w-8 text-muted-foreground/40 mx-auto" />
      <div className="font-serif text-lg">{title}</div>
      <div className="text-sm text-muted-foreground">{description}</div>
      {(primary || secondary) && (
        <div className="flex items-center justify-center gap-2 pt-1">
          {primary && (
            <Button asChild variant="accent" size="sm">
              <Link href={primary.href}>{primary.label} <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          )}
          {secondary && (
            <Button asChild variant="outline" size="sm">
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
