import { expect } from "chai";
import {
  colorChannel,
  gridMessage,
  matchingScore,
  parseColor,
} from "../src/logic";

type Color = [number, number, number] | null;

function mockContext(): CanvasRenderingContext2D {
  let fillStyle = "";
  let resolvedRgb = [0, 0, 0];
  return {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
      resolvedRgb = value === "red" ? [255, 0, 0] : [0, 0, 0];
    },
    fillRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray([...resolvedRgb, 255]) }),
  } as unknown as CanvasRenderingContext2D;
}

describe("colorChannel", () => {
  it("maps 0 to 0", () => {
    expect(colorChannel(0)).to.equal(0);
  });

  it("maps 255 to 127", () => {
    expect(colorChannel(255)).to.equal(127);
  });

  it("maps 128 to 64", () => {
    expect(colorChannel(128)).to.equal(64);
  });

  it("rounds intermediate values", () => {
    expect(colorChannel(1)).to.equal(0);
    expect(colorChannel(2)).to.equal(1);
  });
});

describe("gridMessage", () => {
  it("produces a sysex message with header and footer", () => {
    const colors: Color[] = [[255, 0, 0], null, [0, 255, 0]];
    const message = gridMessage(colors);

    expect(message[0]).to.equal(0xf0);
    expect(message[message.length - 1]).to.equal(0xf7);
    expect(message[6]).to.equal(0x03);
  });

  it("encodes pad colors with note numbers", () => {
    const colors: Color[] = new Array(64).fill(null);
    colors[0] = [255, 255, 255];
    const message = gridMessage(colors);

    // index 0 -> rowFromBottom 7, column 1 -> note (7+1)*10 + 1 = 81
    // message layout: [header(6), 0x03, then per-color: 0x03, note, r, g, b]
    expect(message[6]).to.equal(0x03);
    expect(message[7]).to.equal(0x03);
    expect(message[8]).to.equal(81);
    expect(message[9]).to.equal(127);
    expect(message[10]).to.equal(127);
    expect(message[11]).to.equal(127);
  });

  it("sends zeros for null colors", () => {
    const colors: Color[] = new Array(64).fill(null);
    const message = gridMessage(colors);

    expect(message[6]).to.equal(0x03);
    expect(message[7]).to.equal(0x03);
    expect(message[8]).to.equal(81);
    expect(message[9]).to.equal(0);
    expect(message[10]).to.equal(0);
    expect(message[11]).to.equal(0);
  });
});

describe("matchingScore", () => {
  it("returns -1 for non-Launchpad names", () => {
    expect(matchingScore({ name: "Some Other Device" })).to.equal(-1);
  });

  it("returns 2 for Launchpad names", () => {
    expect(matchingScore({ name: "Launchpad X" })).to.equal(2);
  });

  it("returns 2 for LPX names", () => {
    expect(matchingScore({ name: "LPX" })).to.equal(2);
  });

  it("returns 0 for DAW ports", () => {
    expect(matchingScore({ name: "Launchpad X DAW" })).to.equal(0);
  });

  it("returns 3 for MIDI ports", () => {
    expect(matchingScore({ name: "Launchpad X MIDI" })).to.equal(3);
  });

  it("handles null name and manufacturer", () => {
    expect(matchingScore({})).to.equal(-1);
  });
});

describe("parseColor", () => {
  const ctx = mockContext();

  it("parses 6-digit hex with #", () => {
    expect(parseColor("#ff0000", ctx)).to.deep.equal([255, 0, 0]);
  });

  it("parses 6-digit hex without #", () => {
    expect(parseColor("00ff00", ctx)).to.deep.equal([0, 255, 0]);
  });

  it("parses 3-digit hex", () => {
    expect(parseColor("#f00", ctx)).to.deep.equal([255, 0, 0]);
  });

  it("is case-insensitive for hex", () => {
    expect(parseColor("#FF0000", ctx)).to.deep.equal([255, 0, 0]);
  });

  it("parses RGB values", () => {
    expect(parseColor("255, 0, 0", ctx)).to.deep.equal([255, 0, 0]);
    expect(parseColor("0,255,0", ctx)).to.deep.equal([0, 255, 0]);
    expect(parseColor("0, 0, 255", ctx)).to.deep.equal([0, 0, 255]);
  });

  it("rejects RGB values out of range", () => {
    expect(parseColor("256, 0, 0", ctx)).to.be.null;
    expect(parseColor("0, -1, 0", ctx)).to.be.null;
    expect(parseColor("0, 0, 999", ctx)).to.be.null;
  });

  it("rejects invalid input", () => {
    expect(parseColor("", ctx)).to.be.null;
    expect(parseColor("not a color", ctx)).to.be.null;
    expect(parseColor("#gggggg", ctx)).to.be.null;
  });

  it("parses named colors", () => {
    expect(parseColor("red", ctx)).to.deep.equal([255, 0, 0]);
    expect(parseColor("Red", ctx)).to.deep.equal([255, 0, 0]);
  });

  it("rejects unknown named colors", () => {
    expect(parseColor("notacolor", ctx)).to.be.null;
  });
});
