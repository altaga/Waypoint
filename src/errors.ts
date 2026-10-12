// Customer-facing errors. Tool errors must give the next step and must never
// leak stack traces, HTTP codes, URLs, JSON or tool names (context doc §1.4, §5.3).

export interface FriendlyError {
  isError: true;
  message: string;
  nextStep: string;
}

export type ErrorLocale = "en" | "es";

export function friendlyError(
  err: unknown,
  fallbackNextStep?: string,
  locale: ErrorLocale = "en",
): FriendlyError {
  const es = locale === "es";
  if (err instanceof TimeoutError) {
    return {
      isError: true,
      message: es ? "Esa consulta tarda más de lo esperado." : "That lookup is taking longer than expected.",
      nextStep: es ? "Pregunta de nuevo, o puedo responder con los últimos datos verificados." : "Ask again, or I can answer from the last verified data.",
    };
  }
  if (err instanceof UnknownDestinationError) {
    return {
      isError: true,
      message: es ? `No tengo información de entrada para "${err.query}" todavía.` : `I don't have entry information for "${err.query}" yet.`,
      nextStep: es ? "Prueba con el nombre del país en inglés o en español, o con su código de dos letras." : "Try the country's name in English or Spanish, or its two-letter code.",
    };
  }
  if (err instanceof ProfileMissingError) {
    return {
      isError: true,
      message: es ? "Necesito un poco más de datos de tu viaje para revisar eso." : "I need a bit more about your trip before I can check that.",
      nextStep: es ? "Dime el país del pasaporte de cada viajero." : "Tell me the nationality of each traveler.",
    };
  }
  return {
    isError: true,
    message: es ? "Algo salió mal de mi lado." : "Something went wrong on my side.",
    nextStep: fallbackNextStep ?? (es ? "Intenta de nuevo en un momento, o pide otro destino." : "Try again in a moment, or ask for a different destination."),
  };
}

export class TimeoutError extends Error {}

export class UnknownDestinationError extends Error {
  constructor(public readonly query: string) {
    super("unknown destination");
  }
}

export class ProfileMissingError extends Error {}
