export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  );
}