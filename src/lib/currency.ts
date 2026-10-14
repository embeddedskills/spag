export type Currency = "USD" | "EUR" | "BTC";

export type ExchangeRates = Record<Currency, number>;

export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  USD: 1,
  EUR: 0.92,
  BTC: 1 / 65_000,
};

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES,
) {
  return (amount / rates[fromCurrency]) * rates[toCurrency];
}

export function getCurrencyMinorDigits(currency: Currency) {
  return currency === "BTC" ? 8 : 2;
}
