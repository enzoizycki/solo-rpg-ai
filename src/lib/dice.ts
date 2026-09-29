export type DiceGroup = { count: number; sides: number };

/**
 * Parse a notation like "2d6+1d8+3" into its dice groups (ignores modifiers).
 * Used by the UI to render the correct polyhedral dice.
 */
export function parseDiceGroups(notation: string): DiceGroup[] {
  const clean = (notation || "").replace(/\s+/g, "").toLowerCase();
  const groups: DiceGroup[] = [];
  const terms = clean.match(/[+-]?[^+-]+/g) ?? [];
  for (const term of terms) {
    const body = term.replace(/^[+-]/, "");
    if (!body.includes("d")) continue;
    const [c, s] = body.split("d");
    const count = c === "" ? 1 : parseInt(c, 10);
    const sides = parseInt(s, 10);
    if (!Number.isNaN(count) && !Number.isNaN(sides) && count > 0 && sides > 1) {
      groups.push({ count: Math.min(count, 20), sides });
    }
  }
  return groups;
}

/**
 * Break a notation into the tray controls (first die group + total modifier).
 * "1d20+3" -> { count: 1, sides: 20, mod: 3 }
 */
export function parseNotationParts(
  notation: string,
): { count: number; sides: number; mod: number } {
  const clean = (notation || "").replace(/\s+/g, "").toLowerCase();
  const terms = clean.match(/[+-]?[^+-]+/g) ?? [];
  let count = 1;
  let sides = 20;
  let mod = 0;
  let foundDie = false;
  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");
    if (body.includes("d")) {
      if (foundDie) continue;
      const [c, s] = body.split("d");
      const pc = c === "" ? 1 : parseInt(c, 10);
      const ps = parseInt(s, 10);
      if (!Number.isNaN(pc) && !Number.isNaN(ps) && pc > 0 && ps > 1) {
        count = Math.min(pc, 10);
        sides = ps;
        foundDie = true;
      }
    } else {
      const v = parseInt(body, 10);
      if (!Number.isNaN(v)) mod += sign * v;
    }
  }
  return { count, sides, mod };
}

export function buildNotation(count: number, sides: number, mod: number): string {
  return `${count}d${sides}${mod > 0 ? `+${mod}` : mod < 0 ? mod : ""}`;
}

export type DiceResult = {
  notation: string;
  rolls: number[];
  modifier: number;
  total: number;
  detail: string;
};

/**
 * Roll dice using standard RPG notation like "2d6+3", "d20", "1d8-1", "4d6".
 * Supports multiple groups separated by "+" e.g. "1d8+2d6+1".
 */
export function rollDice(notation: string): DiceResult {
  const clean = notation.replace(/\s+/g, "").toLowerCase();
  if (!clean) {
    throw new Error("Notação de dado vazia");
  }

  // Split into signed terms.
  const terms = clean.match(/[+-]?[^+-]+/g);
  if (!terms) {
    throw new Error(`Notação inválida: ${notation}`);
  }

  const allRolls: number[] = [];
  let modifier = 0;
  let total = 0;
  const parts: string[] = [];

  for (const term of terms) {
    const sign = term.startsWith("-") ? -1 : 1;
    const body = term.replace(/^[+-]/, "");

    if (body.includes("d")) {
      const [countRaw, sidesRaw] = body.split("d");
      const count = countRaw === "" ? 1 : parseInt(countRaw, 10);
      const sides = parseInt(sidesRaw, 10);
      if (
        Number.isNaN(count) ||
        Number.isNaN(sides) ||
        count < 1 ||
        count > 100 ||
        sides < 2 ||
        sides > 1000
      ) {
        throw new Error(`Termo de dado inválido: ${term}`);
      }
      const groupRolls: number[] = [];
      for (let i = 0; i < count; i++) {
        const r = 1 + Math.floor(Math.random() * sides);
        groupRolls.push(r);
        allRolls.push(r);
        total += sign * r;
      }
      parts.push(`${sign < 0 ? "-" : ""}${count}d${sides}[${groupRolls.join(", ")}]`);
    } else {
      const val = parseInt(body, 10);
      if (Number.isNaN(val)) throw new Error(`Modificador inválido: ${term}`);
      modifier += sign * val;
      total += sign * val;
      parts.push(`${sign < 0 ? "-" : "+"}${val}`);
    }
  }

  return {
    notation: clean,
    rolls: allRolls,
    modifier,
    total,
    detail: parts.join(" "),
  };
}
