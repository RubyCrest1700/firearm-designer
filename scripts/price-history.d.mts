export interface PriceHistory { parts: Record<string, [string, number][]> }
export function recordHistory(history: PriceHistory | null | undefined, offers: Record<string, Record<string, { price: number; inStock: boolean }>>, now?: Date): PriceHistory;
