# Launchpad X LED Imager

A small, standalone browser app for creating and displaying colors on the 8 × 8 pad grid of a Novation Launchpad X. Use the Video mode to stream video frames, the Image mode to map a still image to the grid, or the Manual mode to edit pad colors directly. Connect the Launchpad over USB MIDI to display your work on the controller.

## Features

- Three tabs for different workflows: video playback (Video), still-image mapping (Image), and direct color editing (Manual).
- Video tab previews local MP4/WebM video as an 8 × 8 color grid and can stream sampled frames to the Launchpad during playback. Slow MIDI output skips stale frames; videos can be selected by file picker or drag & drop.
- Image tab loads a still image from a file, clipboard, or drag & drop; it samples and previews the image as an 8 × 8 grid and sends it to the Launchpad when connected. Choose Fit, Fill, or Stretch sizing.
- Manual 8 × 8 pad grid with an on-page color preview and live updates to a connected Launchpad.
- Accepts case-insensitive 3- or 6-digit hexadecimal colors, with or without `#`.
- Accepts comma-separated RGB channels from `0` to `255`.
- Accepts standard named CSS/HTML colors, case-insensitively.
- Sends RGB LED updates to the Launchpad X over Web MIDI.
- **Clear all** clears the grid and turns off its pads.
- **Responsive** keeps the active tab within the available browser height; turn it off to allow the page to grow naturally.
- **Disconnect** returns the Launchpad X to Live mode. The app also attempts this when leaving the page.

## Usage

1. Connect the Launchpad X to your computer over USB.
2. Open the [hosted app](https://mariawasnotavailable.github.io/launchpad-x-led-manager/) in a browser that supports the Web MIDI API. Chromium-based browsers are recommended.
3. The app attempts to connect automatically after loading; grant MIDI SysEx access if prompted.
4. If it does not connect automatically, click **Connect** and select the Launchpad X MIDI output.

The device is often listed as **LPX** or **LPX MIDI**, rather than “Launchpad X”. If multiple Launchpad ports are listed, select its MIDI output rather than a DAW port.

Once connected, the app switches the Launchpad X to Programmer mode and sends color changes as you edit the grid. Disconnect to return it to Live mode.

### Video: preview or stream frames

Select the **Video** tab and choose an MP4 or WebM file, or drag and drop it. The app reads it locally and updates the 8 × 8 sampled-frame preview at up to 24 fps; the video itself keeps its source frame rate. Choose **Fit**, **Fill**, or **Stretch** to control how frames map to the grid. Use **Preview** or the video's native controls to play it locally. Connect the Launchpad X, then choose **Play on Launchpad** to restart the video and stream its sampled frames. Pausing temporarily suspends frame sending and holds the last displayed frame; resume with the video controls, **Preview**, or **Resume on Launchpad**.

Each frame contains 64 pad colors, so transfer is limited to about nine frames per second. Intermediate frames are skipped rather than queued when playback is faster than the MIDI output can handle. Video playback and codec support depend on the browser and the MP4/WebM codecs; video files are never uploaded.

### Image: map a still image

Select the **Image** tab and choose an image file, drag and drop it, or use **Paste image** / Ctrl+V. The app reads the image locally (it is not uploaded), samples it into an 8 × 8 color preview, and sends the colors automatically when a Launchpad X is connected. **Fit** preserves the image's aspect ratio within the grid, **Fill** crops it to cover the grid, and **Stretch** resizes it to the grid dimensions. Use **Send to Launchpad** to send the current preview again.

### Manual: edit pad colors

In the **Manual** tab, enter a color directly into each pad:

| Format | Examples |
| --- | --- |
| Hexadecimal | `#00ff00`, `00FF00`, `abc` |
| RGB | `0,0,255`, `192,    0, 0` |
| Named color | `darkred`, `RebeccaPurple` |

Hexadecimal and named-color input is case-insensitive. RGB values are decimal, comma-separated, and each channel must be between `0` and `255`. Valid colors are sent as you edit when the Launchpad is connected; invalid input is not sent to the device.

## Development

The app is written in TypeScript and compiled to JavaScript before serving. Web MIDI requires a secure context, so serve the files from `localhost` or deploy them over HTTPS.

Install dependencies:

```sh
npm install
```

Build the TypeScript source:

```sh
npm run build
```

Then start the local development server:

```sh
npm run dev
```

Open [http://localhost:8000](http://localhost:8000) in a browser that supports Web MIDI.
After building, the workspace-root `index.html` can also be served by a static development server such as VS Code Live Server.

To rebuild on every source change, run `npx tsc --watch` in another terminal while the dev server is running.

## Testing

Unit tests are written with [Mocha](https://mochajs.org/) and [Chai](https://www.chaijs.com/) and cover the pure logic functions (color parsing, MIDI message encoding, Launchpad output scoring) in `src/logic.ts`:

```sh
npm test
```

This compiles the TypeScript test sources and runs the mocha suite.

## Support

The app uses the Web MIDI API with SysEx access. Use a compatible browser and allow MIDI access for the page. Web MIDI is available only in secure contexts such as HTTPS and localhost. Browser support and permission handling can vary; if MIDI access is unavailable, try a current browser that supports Web MIDI.

Video playback support depends on the codecs used inside the file and the browser/platform. See [Can I Use: WebM](https://caniuse.com/webm) and [Can I Use: MPEG-4/H.264](https://caniuse.com/mpeg4).

**Other Launchpad models** may use different SysEx headers. This script is not guaranteed to work with non-X models without adjusting the `HEADER` and command byte. Non-RGB models are not supported.


## Project files

- `package.json` — Node.js project manifest and scripts.
- `tsconfig.json` — TypeScript compiler configuration.
- `server.js` — lightweight Node.js static file server used for local development (serves `dist/`).
- `src/app.ts` — TypeScript source: color parsing, image/video sampling, LED previews, playback, and Web MIDI communication.
- `scripts/copy-assets.js` — build step that copies static assets into `dist/`.
- `dist/` — deployable output generated by `npm run build` (not committed):
  - `index.html` — page structure and usage instructions (copied).
  - `style.css` — responsive layout and grid styling (copied).
  - `app.js` — compiled JavaScript from `src/app.ts`.
  - `app.js.map` — source map.

## References

- [Web MIDI API on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
- [Novation Launchpad X](https://novationmusic.com/products/launchpad-x)
