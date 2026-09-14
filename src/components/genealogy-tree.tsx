import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCarat, formatDate } from "@/lib/utils";
import type { GenealogyNode } from "@/lib/genealogy";
import { Diamond, Gem, Scissors, GitBranch } from "lucide-react";

export function GenealogyTree({ root }: { root: GenealogyNode }) {
  return (
    <div className="w-full overflow-x-auto pb-4">
      <ul className="gtree text-center">
        <TreeNode node={root} isRoot />
      </ul>
      {root.producedBy && root.producedBy.length > 0 && (
        <div className="mt-6 max-w-2xl mx-auto space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground text-center">Produced by</div>
          {root.producedBy.map((tx) => (
            <div key={tx.id} className="p-3 rounded-md border bg-secondary/40">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5 text-sgs-teal-500" />
                <span className="font-mono">{tx.code}</span> · {formatDate(tx.performedAt)}
                {tx.operator && ` · ${tx.operator}`}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tx.parents.map((p) => (
                  <Link
                    key={p.id}
                    href={`/rough/${p.id}`}
                    className="inline-flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-xs hover:border-sgs-teal-500 hover:shadow-luxe transition"
                  >
                    <Diamond className="h-3 w-3 text-sgs-teal-500" />
                    <span className="font-mono">{p.code}</span>
                    <span className="text-muted-foreground num">{formatCarat(p.weightCt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({ node, isRoot = false }: { node: GenealogyNode; isRoot?: boolean }) {
  const hasChildren = node.transformations && node.transformations.length > 0;
  return (
    <li className="align-top">
      {!isRoot && <span className="gtree-stub" aria-hidden />}
      <NodeCard node={node} big={isRoot} />
      {hasChildren && (
        <ul>
          {node.transformations!.map((tx) => (
            <li key={tx.id} className="align-top">
              <span className="gtree-stub" aria-hidden />
              <TransformationBadge tx={tx} />
              {tx.children.length > 0 && (
                <ul>
                  {tx.children.map((child) => (
                    <TreeNode key={`${child.kind}-${child.id}`} node={child} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function NodeCard({ node, big = false }: { node: GenealogyNode; big?: boolean }) {
  const href = node.kind === "rough" ? `/rough/${node.id}` : `/gemstones/${node.id}`;
  const Icon = node.kind === "rough" ? Diamond : Gem;
  const iconColor = node.kind === "rough" ? "text-sgs-teal-500" : "text-sgs-purple-500";
  const borderHover = node.kind === "rough" ? "hover:border-sgs-teal-500" : "hover:border-sgs-purple-500";
  return (
    <Link href={href} className="inline-block group">
      <div
        className={`inline-flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition ${borderHover} hover:shadow-luxe ${
          big ? "shadow-luxe" : ""
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{node.code}</span>
            <Badge variant={node.kind === "rough" ? "teal" : "purple"}>
              {node.kind === "rough" ? "Rough" : "Finished"}
            </Badge>
          </div>
          <div className="text-sm mt-0.5 whitespace-nowrap">
            {node.label}
            <span className="text-muted-foreground num"> · {formatCarat(node.weightCt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TransformationBadge({
  tx,
}: {
  tx: NonNullable<GenealogyNode["transformations"]>[number];
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-sgs-purple-50 border-sgs-purple-200 px-2.5 py-1 text-xs text-sgs-purple-800">
      <Scissors className="h-3 w-3" />
      <span className="font-mono">{tx.code}</span>
      <span>· yield {tx.yieldPct.toFixed(1)}%</span>
      {tx.wasteWeightCt > 0 && (
        <span className="text-muted-foreground">· waste {formatCarat(tx.wasteWeightCt)}</span>
      )}
    </div>
  );
}
