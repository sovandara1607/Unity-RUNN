const placeholderCopy = /^(?:lorem ipsum|placeholder(?: copy| text)?|tbd|todo)\b/i;

/** Keep unfinished admin copy from leaking into public event pages. */
export function publicEventDescription(value?: string | null): string | null {
  const description = value?.trim() || "";
  return description && !placeholderCopy.test(description) ? description : null;
}
