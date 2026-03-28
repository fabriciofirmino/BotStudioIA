import { SupabaseClient, structuredLog, formatCurrency } from "studioflow-sdk";
import type { Service } from "studioflow-sdk";

export async function listarServicos(
  supabase: SupabaseClient,
  unitId: string,
): Promise<string> {
  structuredLog("info", "tool_listar_servicos", { unitId });

  try {
    const services = await supabase.query<Service>("Service", {
      select: "id,name,description,durationMin,price,category",
      filters: {
        unitId: `eq.${unitId}`,
        isActive: "eq.true",
      },
      order: "category.asc,name.asc",
    });

    const formatted = services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      duration: `${s.durationMin} minutos`,
      price: formatCurrency(s.price),
    }));

    return JSON.stringify({ services: formatted, total: formatted.length });
  } catch (error) {
    structuredLog("error", "listar_servicos_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Erro ao listar servicos." });
  }
}
