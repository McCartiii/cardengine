import { describe, expect, it } from "vitest";
import { collectionToCsv, parseCollectionFile, parseCsv, parseFinish } from "./collectionCsv.js";

const SID = "0afa0e33-4804-4b00-b625-c2d6b61090fc";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and newlines in quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });
});

describe("parseCollectionFile", () => {
  it("reads Moxfield", () => {
    const r = parseCollectionFile(
      '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"\n' +
        '"2","0","Lightning Bolt","2xm","Near Mint","English","foil","","2024-01-01","117","False","False",""\n' +
        '"1","0","Fire // Ice","mh2","Near Mint","English","","","2024-01-01","290","False","False",""\n'
    );
    expect(r.format).toBe("Moxfield");
    expect(r.entries).toEqual([
      { line: 2, name: "Lightning Bolt", quantity: 2, finish: "foil", setCode: "2xm", collectorNumber: "117", scryfallId: undefined },
      { line: 3, name: "Fire // Ice", quantity: 1, finish: "nonfoil", setCode: "mh2", collectorNumber: "290", scryfallId: undefined },
    ]);
  });

  it("reads ManaBox, with Scryfall IDs", () => {
    const r = parseCollectionFile(
      "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency\n" +
        `Sol Ring,c21,Commander 2021,263,normal,uncommon,3,123,${SID},1.2,false,false,near_mint,en,USD\n`
    );
    expect(r.format).toBe("ManaBox");
    expect(r.entries[0]).toMatchObject({ name: "Sol Ring", quantity: 3, finish: "nonfoil", setCode: "c21", collectorNumber: "263", scryfallId: SID });
  });

  it("reads TCGplayer, preferring the simple name and the set code over the set name", () => {
    const r = parseCollectionFile(
      "Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU\n" +
        '1,"Sheoldred, the Apocalypse (Borderless)","Sheoldred, the Apocalypse",Dominaria United,107,DMU,Foil,Near Mint,English,M,123,456\n'
    );
    expect(r.format).toBe("TCGplayer");
    expect(r.entries[0]).toMatchObject({ name: "Sheoldred, the Apocalypse", setCode: "dmu", collectorNumber: "107", finish: "foil" });
  });

  it("reads Deckbox, Archidekt and Dragon Shield", () => {
    const deckbox = parseCollectionFile(
      "Count,Tradelist Count,Name,Edition,Edition Code,Card Number,Condition,Language,Foil,Signed\n4,0,Counterspell,Ice Age,ice,64,Near Mint,English,,\n"
    );
    expect(deckbox.format).toBe("Deckbox");
    expect(deckbox.entries[0]).toMatchObject({ name: "Counterspell", quantity: 4, setCode: "ice", collectorNumber: "64" });

    const archidekt = parseCollectionFile(
      `Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,MTGO ID,Collector Number\n1,Rhystic Study,Etched,NM,2024-01-01,EN,,,Wilds of Eldraine: Enchanting Tales,wot,,${SID},,22\n`
    );
    expect(archidekt.format).toBe("Archidekt");
    expect(archidekt.entries[0]).toMatchObject({ name: "Rhystic Study", finish: "etched", setCode: "wot", scryfallId: SID });

    const ds = parseCollectionFile(
      '"sep=,"\nFolder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number,Condition,Printing,Language\nBinder,2,0,Cultivate,M21,Core Set 2021,177,NearMint,Normal,English\n'
    );
    expect(ds.format).toBe("Dragon Shield");
    expect(ds.entries[0]).toMatchObject({ line: 3, name: "Cultivate", quantity: 2, setCode: "m21", finish: "nonfoil" });
  });

  it("reads semicolon files and skips empty or zero rows", () => {
    const r = parseCollectionFile("Name;Quantity;Set code\nOpt;2;eld\n;;\nBrainstorm;0;ice\n");
    expect(r.entries.map((e) => e.name)).toEqual(["Opt"]);
    expect(r.skipped).toBe(1);
  });

  it("reads plain card lists", () => {
    const r = parseCollectionFile("Deck\n4 Lightning Bolt\n1x Sol Ring (C21) 263 *F*\nCounterspell\n// comment\n\n2 Fire // Ice (MH2) 290\n");
    expect(r.format).toBe("Card list");
    expect(r.entries).toEqual([
      { line: 2, name: "Lightning Bolt", quantity: 4, finish: "nonfoil", setCode: undefined, collectorNumber: undefined },
      { line: 3, name: "Sol Ring", quantity: 1, finish: "foil", setCode: "c21", collectorNumber: "263" },
      { line: 4, name: "Counterspell", quantity: 1, finish: "nonfoil", setCode: undefined, collectorNumber: undefined },
      { line: 7, name: "Fire // Ice", quantity: 2, finish: "nonfoil", setCode: "mh2", collectorNumber: "290" },
    ]);
  });
});

describe("parseFinish", () => {
  it("understands each app's words", () => {
    expect(["", "normal", "Non-foil", "false", "No"].map(parseFinish)).toEqual(["nonfoil", "nonfoil", "nonfoil", "nonfoil", "nonfoil"]);
    expect(["foil", "Foil", "true", "yes"].map(parseFinish)).toEqual(["foil", "foil", "foil", "foil"]);
    expect(parseFinish("Etched Foil")).toBe("etched");
  });
});

describe("collectionToCsv", () => {
  it("writes a CSV that reads back the same", () => {
    const csv = collectionToCsv([
      { quantity: 2, name: "Fire // Ice", setId: "mh2", collectorNumber: "290", finish: "foil", variantId: `scryfall:${SID}`, price: 1.5, binder: "Trade" },
      { quantity: 1, name: 'Sol "Ring", Jr.', setId: null, collectorNumber: null, finish: "nonfoil", variantId: "x", price: null, binder: "Collection" },
    ]);
    expect(csv.split("\r\n")[0]).toBe("Count,Name,Edition,Collector Number,Foil,Scryfall ID,Price (USD),Binder");
    const back = parseCollectionFile(csv);
    expect(back.format).toBe("CardEngine");
    expect(back.entries).toEqual([
      { line: 2, name: "Fire // Ice", quantity: 2, finish: "foil", setCode: "mh2", collectorNumber: "290", scryfallId: SID },
      { line: 3, name: 'Sol "Ring", Jr.', quantity: 1, finish: "nonfoil", setCode: undefined, collectorNumber: undefined, scryfallId: undefined },
    ]);
  });
});
