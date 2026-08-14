import { describe, expect, it } from "vitest";
import { parseCsv, stringifyCsv } from "@/lib/utils/csv";

describe("parseCsv (RFC 4180)", () => {
  it("parse des lignes simples séparées par des virgules", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("retire le BOM UTF-8 en tête de fichier", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("gère les champs entre guillemets contenant une virgule", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("gère les guillemets doublés à l'intérieur d'un champ entre guillemets", () => {
    expect(parseCsv('"il dit ""bonjour""",ok')).toEqual([['il dit "bonjour"', "ok"]]);
  });

  it("gère les sauts de ligne à l'intérieur d'un champ entre guillemets", () => {
    expect(parseCsv('"ligne1\nligne2",ok')).toEqual([["ligne1\nligne2", "ok"]]);
  });

  it("gère les fins de ligne CRLF et LF de façon équivalente", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual(parseCsv("a,b\n1,2\n"));
  });

  it("ignore les lignes vides finales", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("retourne un tableau vide pour une chaîne vide", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("stringifyCsv", () => {
  it("échappe un champ contenant une virgule, un guillemet ou un saut de ligne", () => {
    const csv = stringifyCsv([["a,b", 'c"d', "e\nf", "plain"]]);
    expect(csv).toBe('"a,b","c""d","e\nf",plain');
  });

  it("convertit null/undefined en champ vide", () => {
    expect(stringifyCsv([[null, undefined, "x"]])).toBe(",,x");
  });

  it("joint les lignes avec CRLF", () => {
    expect(
      stringifyCsv([
        ["a", "b"],
        ["1", "2"],
      ])
    ).toBe("a,b\r\n1,2");
  });

  it("fait un aller-retour parse → stringify → parse sans perte", () => {
    const original = [
      ["Référence", "Commune", "Note"],
      ["DOS-2026-000001", "Abidjan", 'avec "guillemets", virgule et\nsaut de ligne'],
    ];
    const roundTripped = parseCsv(stringifyCsv(original));
    expect(roundTripped).toEqual(original);
  });
});
