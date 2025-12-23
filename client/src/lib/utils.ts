type ClassValue = string | number | null | undefined | false | Record<string, boolean>;

export function cn(...inputs: ClassValue[]) {
  return inputs
    .flatMap((input) => {
      if (!input) return [];
      if (typeof input === "string" || typeof input === "number") return [input];
      return Object.entries(input)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key);
    })
    .join(" ");
}

export function formatDate(date: string | number | Date) {
  const value = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return value.toLocaleDateString();
}
