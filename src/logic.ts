export type Color = [number, number, number] | null;

export const sysexHeader = [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0c];

export const namedColors = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
  blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
  cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
  darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
  darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod
  gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
  lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
  lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
  mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod
  palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon
  sandybrown seagreen seashell sienna silver skyblue slateblue slategray
  slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet
  wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/));

export function parseColor(value: string, ctx: CanvasRenderingContext2D): Color {
  const color = value.trim();
  const hexMatch = color.match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? [...hexMatch[1]].map((digit) => digit + digit).join("")
      : hexMatch[1];
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
  }

  const rgbMatch = color.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (rgbMatch) {
    const channels = rgbMatch.slice(1).map(Number);
    return channels.every((channel) => channel >= 0 && channel <= 255) ? (channels as [number, number, number]) : null;
  }

  const name = color.toLowerCase();
  if (!namedColors.has(name)) {
    return null;
  }

  ctx.fillStyle = "#010203";
  ctx.fillStyle = name;
  if (ctx.fillStyle === "#010203") {
    return null;
  }

  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)] as [number, number, number];
}

export function colorChannel(channel: number) {
  return Math.round(channel * 127 / 255);
}

export function gridMessage(colors: Color[]) {
  const message = [...sysexHeader, 0x03];

  colors.forEach((color, index) => {
    const rowFromBottom = 7 - Math.floor(index / 8);
    const column = (index % 8) + 1;
    const note = (rowFromBottom + 1) * 10 + column;

    message.push(
      0x03,
      note,
      color ? colorChannel(color[0]) : 0,
      color ? colorChannel(color[1]) : 0,
      color ? colorChannel(color[2]) : 0
    );
  });

  message.push(0xf7);
  return message;
}

export function matchingScore(output: { name?: string | null; manufacturer?: string | null }) {
  const name = `${output.name || ""} ${output.manufacturer || ""}`.toLowerCase();
  if (!name.includes("launchpad") && !/\blpx\b/.test(name)) {
    return -1;
  }
  if (/\bdaw\b/.test(name)) {
    return 0;
  }
  if (/\bmidi\b/.test(name)) {
    return 3;
  }
  return 2;
}
