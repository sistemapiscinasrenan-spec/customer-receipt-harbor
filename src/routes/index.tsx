import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gestão de Cobranças — Recebimentos do mês" },
      { name: "description", content: "Controle de clientes recorrentes, cobranças mensais e recebimentos." },
      { property: "og:title", content: "Gestão de Cobranças — Recebimentos do mês" },
      { property: "og:description", content: "Controle de clientes recorrentes, cobranças mensais e recebimentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/recebimentos" });
  },
});
