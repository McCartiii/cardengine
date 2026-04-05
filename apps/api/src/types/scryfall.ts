export interface ScryfallLivePrices {
  usd: string | null;
  usd_foil: string | null;
  usd_etched: string | null;
  eur: string | null;
  eur_foil: string | null;
  eur_etched: string | null;
  tix: string | null;
}

export interface ScryfallLiveData {
  prices: ScryfallLivePrices;
  purchase_uris?: Record<string, string>;
  related_uris?: Record<string, string>;
}
