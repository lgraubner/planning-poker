export const maxNameLength = 40;
export const maxTitleLength = 100;

export function validLabel(value: string, max: number) {
  const trimmed = value.trim();

  return trimmed !== '' && Array.from(trimmed).length <= max && !/\p{Cc}/u.test(value);
}
