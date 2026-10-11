// Customer-facing errors. Tool errors must give the next step and must never
// leak stack traces, HTTP codes, URLs, JSON or tool names (context doc §1.4, §5.3).

export interface FriendlyError {
  isError: true;
  message: string;
  nextStep: string;
}

export function friendlyError(
  err: unknown,
  fallbackNextStep = "Try again in a moment, or ask for a different destination.",
): FriendlyError {
  if (err instanceof TimeoutError) {
    return {
      isError: true,
      message: "That lookup is taking longer than expected.",
      nextStep: "Ask again, or I can answer from the last verified data.",
    };
  }
  if (err instanceof UnknownDestinationError) {
    return {
      isError: true,
      message: `I don't have entry information for "${err.query}" yet.`,
      nextStep: "Try the country's name in English or Spanish, or its two-letter code.",
    };
  }
  if (err instanceof ProfileMissingError) {
    return {
      isError: true,
      message: "I need a bit more about your trip before I can check that.",
      nextStep: "Tell me the nationality of each traveler.",
    };
  }
  return { isError: true, message: "Something went wrong on my side.", nextStep: fallbackNextStep };
}

export class TimeoutError extends Error {}

export class UnknownDestinationError extends Error {
  constructor(public readonly query: string) {
    super("unknown destination");
  }
}

export class ProfileMissingError extends Error {}
