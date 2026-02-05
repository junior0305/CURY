import { Lead } from "@/types/lead";

export const mockLeads: Lead[] = [
  {
    id: "l1",
    name: "João Silva",
    email: "joao@email.com",
    phone: "(11) 99999-9999",
    status: "NEW",
    brokerId: "u3",
    managerId: "u2",
    tag: "Lançamentos",
    createdAt: new Date().toISOString(),
    lastInteractionAt: new Date().toISOString(),
  },
  {
    id: "l2",
    name: "Maria Oliveira",
    email: "maria@email.com",
    phone: "(11) 88888-8888",
    status: "ABANDONED",
    brokerId: "u4",
    managerId: "u2",
    tag: "Imóveis Prontos",
    createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 dia atrás
    lastInteractionAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "l3",
    name: "Pedro Santos",
    email: "pedro@email.com",
    phone: "(11) 77777-7777",
    status: "NEW",
    brokerId: "u5",
    managerId: "u2",
    tag: "Lançamentos",
    createdAt: new Date().toISOString(),
    lastInteractionAt: new Date().toISOString(),
  }
];