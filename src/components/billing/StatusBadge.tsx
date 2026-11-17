import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: "paid" | "pending" }) {
  return status === "paid" ? (
    <Badge variant="paid">
      <span className="size-2 rounded-full bg-success" aria-hidden />
      Pago
    </Badge>
  ) : (
    <Badge variant="pending">
      <span className="size-2 rounded-full bg-danger" aria-hidden />
      Pendente
    </Badge>
  );
}
