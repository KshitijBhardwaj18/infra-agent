export type ParsedEntry = { key: string; value: string };

export type DotenvParseResult = {
  entries: ParsedEntry[];
  warnings: string[];
  errors: { line: number; message: string }[];
};

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseDotenv(input: string): DotenvParseResult {
  const errors: DotenvParseResult["errors"] = [];
  const warnings: string[] = [];
  const map = new Map<string, { value: string; firstSeenLine: number }>();
  const lines = input.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

    const eqIdx = raw.indexOf("=");
    if (eqIdx < 0) {
      errors.push({ line: lineNo, message: `Missing "=" — expected KEY=value` });
      continue;
    }

    const rawKey = raw.slice(0, eqIdx).trim();
    let rawValue = raw.slice(eqIdx + 1);

    if (!KEY_RE.test(rawKey)) {
      errors.push({
        line: lineNo,
        message: `Invalid key "${rawKey}" — must match [A-Za-z_][A-Za-z0-9_]*`,
      });
      continue;
    }

    rawValue = rawValue.replace(/^\s+/, "");
    let value: string;
    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      const quote = rawValue[0];
      const closingIdx = rawValue.indexOf(quote, 1);
      if (closingIdx < 0) {
        errors.push({ line: lineNo, message: `Unterminated ${quote === '"' ? "double" : "single"} quote` });
        continue;
      }
      value = rawValue.slice(1, closingIdx);
    } else {
      const hashIdx = rawValue.indexOf("#");
      value = (hashIdx >= 0 ? rawValue.slice(0, hashIdx) : rawValue).trimEnd();
    }

    if (map.has(rawKey)) {
      const prev = map.get(rawKey)!;
      warnings.push(
        `Key "${rawKey}" appears multiple times (line ${prev.firstSeenLine} and ${lineNo}); using last value.`,
      );
    }
    map.set(rawKey, { value, firstSeenLine: map.get(rawKey)?.firstSeenLine ?? lineNo });
  }

  const entries: ParsedEntry[] = [];
  for (const [key, { value }] of map.entries()) {
    entries.push({ key, value });
  }
  return { entries, warnings, errors };
}

/**
 * Serialize entries back to `.env` text. Single-quotes wrap values that
 * contain whitespace or special characters; otherwise unquoted.
 */
export function serializeDotenv(entries: ParsedEntry[]): string {
  return entries
    .map((e) => {
      const needsQuote = /[\s"'#$=\\]/.test(e.value) || e.value !== e.value.trim();
      const value = needsQuote
        ? `'${e.value.replace(/'/g, "'\\''")}'`
        : e.value;
      return `${e.key}=${value}`;
    })
    .join("\n");
}
