/// <reference lib="webworker" />
import { computeManualBuild, searchBuilds } from "@stalzone/calc-engine";
import type { BuildSearchRequest, ManualBuildRequest } from "@stalzone/calc-engine";

// Фоновый поток с движком подбора: расчёт сборок идёт здесь, а не на сервере, и страница не
// подвисает, пока подбор перебирает контейнеры (секунда-две). Данные — /engine-data.json.

type EngineData = Parameters<typeof searchBuilds>[1] & { prices: Record<string, number> };

let data: Promise<EngineData> | null = null;
const load = () =>
  (data ??= fetch("/engine-data.json").then((r) => {
    if (!r.ok) throw new Error(`engine-data ${r.status}`);
    return r.json() as Promise<EngineData>;
  }));

type Message = { id: number; kind: "search"; request: BuildSearchRequest } | { id: number; kind: "manual"; request: ManualBuildRequest };

self.onmessage = async (e: MessageEvent<Message>) => {
  const { id } = e.data;
  try {
    const d = await load();
    const lookup = (itemId: string) => d.prices[itemId] ?? null;
    if (e.data.kind === "search") {
      self.postMessage({ id, ok: true, result: searchBuilds(e.data.request, d, lookup) });
    } else {
      const result = computeManualBuild(e.data.request, d, lookup);
      self.postMessage(result ? { id, ok: true, result } : { id, ok: false, result: { error: "Контейнер не найден" } });
    }
  } catch (err) {
    data = null; // не скачалось — в следующий раз попробуем снова
    self.postMessage({ id, ok: false, result: { error: err instanceof Error ? err.message : String(err) } });
  }
};
