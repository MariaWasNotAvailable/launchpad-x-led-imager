"use strict";

import { parseColor, gridMessage, matchingScore, sysexHeader, type Color } from "./logic.js";

const grid = document.querySelector("#led-grid")! as HTMLDivElement;
const clearButton = document.querySelector("#clear-grid")! as HTMLButtonElement;
const imageFileInput = document.querySelector("#image-file")! as HTMLInputElement;
const imageFitSelect = document.querySelector("#image-fit-mode")! as HTMLSelectElement;
const sendImageButton = document.querySelector("#send-image")! as HTMLButtonElement;
const pasteImageButton = document.querySelector("#paste-image")! as HTMLButtonElement;
const imageGrid = document.querySelector("#image-grid")! as HTMLDivElement;
const videoFileInput = document.querySelector("#video-file")! as HTMLInputElement;
const videoFitSelect = document.querySelector("#video-fit-mode")! as HTMLSelectElement;
const previewVideoButton = document.querySelector("#preview-video")! as HTMLButtonElement;
const playVideoButton = document.querySelector("#play-video")! as HTMLButtonElement;
const videoPreview = document.querySelector("#video-preview")! as HTMLVideoElement;
const videoGrid = document.querySelector("#video-grid")! as HTMLDivElement;
const outputSelect = document.querySelector("#midi-output")! as HTMLSelectElement;
const connectButton = document.querySelector("#connect-midi")! as HTMLButtonElement;
const midiStatus = document.querySelector("#midi-status")! as HTMLElement;
const responsiveButton = document.querySelector("#responsive-layout")! as HTMLButtonElement;
const navbar = document.querySelector(".app-navbar")! as HTMLElement;

const videoPreviewFrameInterval = 1000 / 24;
const videoSendInterval = 110;
const colorCanvas = document.createElement("canvas");
const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true })! as CanvasRenderingContext2D;
colorCanvas.width = 1;
colorCanvas.height = 1;

let midiAccess: MIDIAccess | null = null;
let midiOutput: MIDIOutput | null = null;
let updateScheduled = false;
let connecting = false;
let videoObjectUrl: string | null = null;
let videoLoaded = false;
let videoColors: Color[] | null = null;
let videoPlaybackOnLaunchpad = false;
let videoFrameRequestId: number | null = null;
let videoFrameRequestKind: string | null = null;
let videoFrameLoopToken = 0;
let nextVideoPreviewAt: number | null = null;
let lastVideoSendAt = -Infinity;
let videoFramesSent = 0;
let videoFramesDropped = 0;

function updateNavbarHeight() {
  document.documentElement.style.setProperty("--navbar-height", `${navbar.offsetHeight}px`);
}

updateNavbarHeight();
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(updateNavbarHeight).observe(navbar);
} else {
  window.addEventListener("resize", () => updateNavbarHeight());
}

responsiveButton.addEventListener("click", () => {
  const isResponsive = responsiveButton.getAttribute("aria-pressed") !== "true";
  responsiveButton.setAttribute("aria-pressed", String(isResponsive));
  const container = document.querySelector(".container")! as HTMLElement;
  container.classList.toggle("is-responsive", isResponsive);
});

const tabs = Array.from(document.querySelectorAll('[role="tab"]')) as HTMLElement[];

function activateTab(selectedTab: HTMLElement) {
  if (selectedTab.id !== "tab-video") {
    if (!videoPreview.paused) {
      videoPreview.pause();
    }
    stopVideoLaunchpadPlayback("Video mode left");
  }

  tabs.forEach((tab) => {
    const isSelected = tab === selectedTab;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
    const controls = tab.getAttribute("aria-controls");
    const panel = controls ? document.getElementById(controls) : null;
    if (panel) {
      panel.hidden = !isSelected;
    }
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event: KeyboardEvent) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index + tabs.length - 1) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex!];
    activateTab(nextTab);
    nextTab.focus();
  });
});

const padColors: Color[] = new Array(64).fill(null);

for (let index = 0; index < 64; index += 1) {
  const row = Math.floor(index / 8) + 1;
  const column = (index % 8) + 1;
  const pad = document.createElement("label");
  const input = document.createElement("input");

  pad.className = "led";
  input.type = "text";
  input.inputMode = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Color";
  input.setAttribute("aria-label", `Row ${row}, column ${column} color`);
  input.setAttribute("aria-invalid", "false");

  input.addEventListener("input", () => {
    const color = parseColor(input.value, colorContext);
    padColors[index] = color;
    input.setAttribute("aria-invalid", String(input.value.trim().length > 0 && !color));
    pad.classList.toggle("is-lit", Boolean(color));

    if (color) {
      const cssColor = `rgb(${color.join(", ")})`;
      pad.style.backgroundColor = cssColor;
      pad.style.setProperty("--led-color", cssColor);
    } else {
      pad.style.removeProperty("background-color");
      pad.style.removeProperty("--led-color");
    }

    scheduleGridUpdate();
  });

  pad.append(input);
  grid.append(pad);
}

function setStatus(message: string, connected = false) {
  midiStatus.textContent = message;
  midiStatus.classList.toggle("is-connected", connected);
}

function sendMidiMessage(output: MIDIOutput, message: number[], purpose: string) {
  const destination = output.name || output.id || "MIDI output";
  const payload = message.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  console.info(`[MIDI] Sending ${purpose} to ${destination} (${message.length} bytes): ${payload}`);
  try {
    output.send(message, 0);
  } catch (error) {
    console.error(`[MIDI] Failed to send ${purpose} to ${destination}.`, error);
    throw error;
  }
}

function scheduleGridUpdate() {
  if (!midiOutput || updateScheduled) {
    return;
  }

  updateScheduled = true;
  requestAnimationFrame(() => {
    updateScheduled = false;
    if (midiOutput) {
      try {
        sendGridColors();
      } catch (error) {
        setStatus(`MIDI send failed: ${(error as Error).message}`);
      }
    }
  });
}

function sendGridColors(output: MIDIOutput = midiOutput!) {
  sendMidiMessage(output, gridMessage(padColors), "grid colors");
}

const sampleCanvas = document.createElement("canvas");
sampleCanvas.width = 8;
sampleCanvas.height = 8;
const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true })! as CanvasRenderingContext2D;

let currentImage: HTMLImageElement | null = null;
let currentImageUrl: string | null = null;
let imageColors: Color[] | null = null;

function createPreviewCells(previewGrid: HTMLDivElement): HTMLDivElement[] {
  const cells: HTMLDivElement[] = [];
  for (let index = 0; index < 64; index += 1) {
    const cell = document.createElement("div");
    cell.className = "image-cell";
    previewGrid.append(cell);
    cells.push(cell);
  }
  return cells;
}

const imageCells = createPreviewCells(imageGrid);
const videoCells = createPreviewCells(videoGrid);

function updateSendImageButton() {
  sendImageButton.disabled = !imageColors || !midiOutput;
}

function renderMediaPreview(cells: HTMLDivElement[], colors: Color[]) {
  cells.forEach((cell, index) => {
    const color = colors[index];
    if (color) {
      cell.style.backgroundColor = `rgb(${color.join(", ")})`;
    } else {
      cell.style.removeProperty("background-color");
    }
  });
}

function sampleImage(image: HTMLImageElement | HTMLVideoElement, mode: string): Color[] {
  const isVideo = image instanceof HTMLVideoElement;
  const iw = isVideo ? image.videoWidth : image.naturalWidth;
  const ih = isVideo ? image.videoHeight : image.naturalHeight;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;

  if (mode !== "stretch") {
    const scale = mode === "fill" ? Math.max(8 / iw, 8 / ih) : Math.min(8 / iw, 8 / ih);
    sw = 8 / scale;
    sh = 8 / scale;
    sx = (iw - sw) / 2;
    sy = (ih - sh) / 2;
  }

  sampleContext.clearRect(0, 0, 8, 8);
  sampleContext.drawImage(image, sx, sy, sw, sh, 0, 0, 8, 8);
  const data = sampleContext.getImageData(0, 0, 8, 8).data;
  const colors: Color[] = new Array(64);

  for (let index = 0; index < 64; index += 1) {
    const alpha = data[index * 4 + 3];
    colors[index] = alpha === 0
      ? null
      : [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]];
  }

  return colors;
}

function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  currentImageUrl = url;

  image.onload = () => {
    if (url !== currentImageUrl) {
      URL.revokeObjectURL(url);
      return;
    }
    URL.revokeObjectURL(url);
    currentImage = image;
    imageColors = sampleImage(image, imageFitSelect.value);
    renderMediaPreview(imageCells, imageColors);
    updateSendImageButton();
    console.info(`[Image] Loaded ${file.name} (${image.width}x${image.height}), sampled ${imageColors.filter(Boolean).length}/64 lit pads.`);
    if (midiOutput) {
      sendImageColors();
    }
  };

  image.onerror = () => {
    if (url !== currentImageUrl) {
      return;
    }
    URL.revokeObjectURL(url);
    currentImage = null;
    imageColors = null;
    renderMediaPreview(imageCells, []);
    updateSendImageButton();
    setStatus("Failed to load image.");
  };

  image.src = url;
}

function sendImageColors(output: MIDIOutput = midiOutput!) {
  if (!imageColors) {
    return;
  }

  const litCount = imageColors.filter(Boolean).length;
  console.info(`[Image] Sending ${litCount}/64 lit pads to ${output.name || output.id}.`);
  sendMidiMessage(output, gridMessage(imageColors), "image colors");
}

imageFileInput.addEventListener("change", () => {
  const file = imageFileInput.files?.[0];
  if (!file) {
    return;
  }
  loadImage(file);
});

imageFitSelect.addEventListener("change", () => {
  if (!currentImage) {
    return;
  }

  imageColors = sampleImage(currentImage, imageFitSelect.value);
  renderMediaPreview(imageCells, imageColors);
  updateSendImageButton();
  if (midiOutput) {
    sendImageColors();
  }
});

sendImageButton.addEventListener("click", () => {
  sendImageColors();
});

pasteImageButton.addEventListener("click", () => {
  navigator.clipboard.read().then((items: ClipboardItem[]) => {
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          item.getType(type).then((blob: Blob) => {
            const file = new File([blob], "clipboard-image.png", { type });
            loadImage(file);
          });
          return;
        }
      }
    }
    setStatus("No image found on the clipboard.");
  }).catch((error: unknown) => {
    console.error("[Image] Clipboard read failed.", error);
    setStatus("Could not read the clipboard. Try pasting with Ctrl+V instead.");
  });
});

document.addEventListener("paste", (event: ClipboardEvent) => {
  const imagePanel = document.getElementById("panel-image");
  if (imagePanel!.hidden) {
    return;
  }

  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return;
  }
  const items = Array.from(clipboardData.items);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) {
    return;
  }

  event.preventDefault();
  const file = imageItem.getAsFile();
  if (file) {
    loadImage(file);
    console.info(`[Image] Pasted ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)} KB) from clipboard.`);
  }
});

function setupDragDrop(dropTarget: HTMLElement, acceptPrefix: string, mediaKind: string, onDrop: (file: File) => void) {
  const dragOverEvents: Array<keyof HTMLElementEventMap> = ["dragenter", "dragover"];
  dragOverEvents.forEach((eventName) => {
    dropTarget.addEventListener(eventName, ((event: DragEvent) => {
      event.preventDefault();
      dropTarget.classList.add("is-drag-over");
    }) as EventListener);
  });

  const dragEndEvents: Array<keyof HTMLElementEventMap> = ["dragleave", "drop"];
  dragEndEvents.forEach((eventName) => {
    dropTarget.addEventListener(eventName, ((event: DragEvent) => {
      event.preventDefault();
      dropTarget.classList.remove("is-drag-over");
    }) as EventListener);
  });

  dropTarget.addEventListener("drop", (event: DragEvent) => {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }
    const files = Array.from(dataTransfer.files).filter((file) => file.type.startsWith(acceptPrefix));
    if (files.length === 0) {
      setStatus(`No ${mediaKind} file found in the dropped items.`);
      return;
    }

    onDrop(files[0]);
    console.info(`[${mediaKind}] Dropped ${files[0].name} (${files[0].type}, ${(files[0].size / 1024).toFixed(1)} KB).`);
  });
}

window.addEventListener("dragover", (event: DragEvent) => event.preventDefault());
window.addEventListener("drop", (event: DragEvent) => event.preventDefault());

setupDragDrop(document.getElementById("panel-image")! as HTMLElement, "image/", "Image", loadImage);
setupDragDrop(document.getElementById("panel-video")! as HTMLElement, "video/", "Video", loadVideo);

function updateVideoButtons() {
  previewVideoButton.disabled = !videoLoaded;
  previewVideoButton.textContent = videoPreview.paused ? "Preview" : "Pause preview";
  playVideoButton.disabled = !videoLoaded || !midiOutput;
  if (!videoPlaybackOnLaunchpad) {
    playVideoButton.textContent = "Play on Launchpad";
  } else {
    playVideoButton.textContent = videoPreview.paused ? "Resume on Launchpad" : "Pause on Launchpad";
  }
}

function stopVideoFrameLoop() {
  videoFrameLoopToken += 1;
  nextVideoPreviewAt = null;
  if (videoFrameRequestId === null) {
    return;
  }

  if (videoFrameRequestKind === "video" && typeof videoPreview.cancelVideoFrameCallback === "function") {
    videoPreview.cancelVideoFrameCallback(videoFrameRequestId);
  } else if (videoFrameRequestKind === "animation") {
    cancelAnimationFrame(videoFrameRequestId);
  }
  videoFrameRequestId = null;
  videoFrameRequestKind = null;
}

function scheduleVideoFrame(token: number) {
  if (token !== videoFrameLoopToken || videoPreview.paused) {
    return;
  }

  if (typeof videoPreview.requestVideoFrameCallback === "function") {
    videoFrameRequestKind = "video";
    videoFrameRequestId = videoPreview.requestVideoFrameCallback((now: number) => {
      videoFrameRequestId = null;
      videoFrameRequestKind = null;
      if (token !== videoFrameLoopToken || videoPreview.paused) {
        return;
      }
      updateVideoFrame(now);
      scheduleVideoFrame(token);
    });
    return;
  }

  videoFrameRequestKind = "animation";
  videoFrameRequestId = requestAnimationFrame((now: number) => {
    videoFrameRequestId = null;
    videoFrameRequestKind = null;
    if (token !== videoFrameLoopToken || videoPreview.paused) {
      return;
    }
    updateVideoFrame(now);
    scheduleVideoFrame(token);
  });
}

function startVideoFrameLoop() {
  stopVideoFrameLoop();
  scheduleVideoFrame(videoFrameLoopToken);
}

function updateVideoFrame(now = performance.now(), force = false) {
  if (!videoLoaded || videoPreview.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  if (force) {
    nextVideoPreviewAt = now + videoPreviewFrameInterval;
  } else {
    if (nextVideoPreviewAt === null) {
      nextVideoPreviewAt = now;
    }
    if (now + 0.5 < nextVideoPreviewAt) {
      return;
    }
    const elapsedIntervals = Math.floor(Math.max(0, now - nextVideoPreviewAt) / videoPreviewFrameInterval);
    nextVideoPreviewAt += (elapsedIntervals + 1) * videoPreviewFrameInterval;
  }

  try {
    videoColors = sampleImage(videoPreview, videoFitSelect.value);
  } catch (error) {
    console.error("[Video] Could not sample the current video frame.", error);
    setStatus(`Video frame sampling failed: ${(error as Error).message}`);
    videoPreview.pause();
    return;
  }

  renderMediaPreview(videoCells, videoColors);
  if (!videoPlaybackOnLaunchpad || !midiOutput || videoPreview.paused) {
    return;
  }

  if (now - lastVideoSendAt < videoSendInterval) {
    videoFramesDropped += 1;
    return;
  }

  lastVideoSendAt = now;
  try {
    sendVideoColors();
    videoFramesSent += 1;
  } catch (error) {
    console.error("[Video] Failed to send a video frame.", error);
    setStatus(`MIDI send failed: ${(error as Error).message}`);
    stopVideoLaunchpadPlayback("MIDI send failed");
  }
}

function sendVideoColors(output: MIDIOutput = midiOutput!) {
  if (!videoColors || !output) {
    return;
  }

  const litCount = videoColors.filter(Boolean).length;
  console.info(`[Video] Sending frame ${videoFramesSent + 1} (${litCount}/64 lit pads) to ${output.name || output.id}.`);
  sendMidiMessage(output, gridMessage(videoColors), "video frame");
}

function stopVideoLaunchpadPlayback(reason: string) {
  if (!videoPlaybackOnLaunchpad) {
    return;
  }

  videoPlaybackOnLaunchpad = false;
  updateVideoButtons();
  console.info(`[Video] Launchpad playback stopped (${reason}); sent ${videoFramesSent} frames and skipped ${videoFramesDropped} stale frames.`);
}

function playVideoPreview() {
  if (videoPreview.ended) {
    videoPreview.currentTime = 0;
  }
  videoPreview.play().catch((error: unknown) => {
    console.error("[Video] Playback failed.", error);
    stopVideoLaunchpadPlayback("video playback failed");
    setStatus(`Video playback failed: ${(error as Error).message}`);
  });
}

function startVideoLaunchpadPlayback() {
  if (!videoLoaded) {
    console.warn("[Video] Cannot play on the Launchpad: no video is loaded.");
    return;
  }
  if (!midiOutput) {
    console.warn("[Video] Cannot play on the Launchpad: no MIDI output is connected.");
    return;
  }

  videoPlaybackOnLaunchpad = true;
  videoFramesSent = 0;
  videoFramesDropped = 0;
  lastVideoSendAt = -Infinity;
  videoPreview.currentTime = 0;
  updateVideoButtons();
  console.info(`[Video] Starting Launchpad playback of ${videoPreview.videoWidth}x${videoPreview.videoHeight} video; sending at most one frame every ${videoSendInterval} ms.`);
  playVideoPreview();
}

function loadVideo(file: File) {
  stopVideoLaunchpadPlayback("video replaced");
  videoPreview.pause();
  videoLoaded = false;
  videoColors = null;
  renderMediaPreview(videoCells, []);
  updateVideoButtons();

  if (videoObjectUrl) {
    URL.revokeObjectURL(videoObjectUrl);
  }
  videoObjectUrl = null;
  videoPreview.removeAttribute("src");
  videoPreview.load();

  videoObjectUrl = URL.createObjectURL(file);
  videoPreview.src = videoObjectUrl;
  videoPreview.load();
  console.info(`[Video] Loading ${file.name} (${file.type || "unknown type"}, ${(file.size / 1024).toFixed(1)} KB).`);
}

videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files?.[0];
  if (file) {
    loadVideo(file);
  }
});

videoPreview.addEventListener("loadedmetadata", () => {
  if (!videoObjectUrl || videoPreview.currentSrc !== videoObjectUrl) {
    return;
  }
  videoLoaded = true;
  updateVideoButtons();
  updateVideoFrame(performance.now(), true);
  console.info(`[Video] Loaded ${videoPreview.videoWidth}x${videoPreview.videoHeight}, ${videoPreview.duration.toFixed(2)} seconds.`);
});

videoPreview.addEventListener("loadeddata", () => updateVideoFrame(performance.now(), true));
videoPreview.addEventListener("seeked", () => updateVideoFrame(performance.now(), true));
videoPreview.addEventListener("play", () => {
  startVideoFrameLoop();
  updateVideoButtons();
  console.info(videoPlaybackOnLaunchpad
    ? "[Video] Launchpad frame streaming resumed."
    : "[Video] Preview playback started.");
});
videoPreview.addEventListener("pause", () => {
  stopVideoFrameLoop();
  updateVideoButtons();
  if (videoLoaded) {
    console.info(videoPlaybackOnLaunchpad
      ? "[Video] Paused; Launchpad output is holding the last frame."
      : "[Video] Preview playback paused.");
  }
});
videoPreview.addEventListener("ended", () => {
  updateVideoFrame(performance.now(), true);
  stopVideoLaunchpadPlayback("video ended");
  updateVideoButtons();
  console.info("[Video] Playback ended.");
});
videoPreview.addEventListener("error", () => {
  if (!videoObjectUrl || videoPreview.currentSrc !== videoObjectUrl) {
    return;
  }
  const error = videoPreview.error;
  const message = error && error.message ? error.message : "The file could not be decoded.";
  console.error(`[Video] Failed to load video: ${message}`, error);
  videoLoaded = false;
  videoColors = null;
  renderMediaPreview(videoCells, []);
  stopVideoLaunchpadPlayback("video load failed");
  updateVideoButtons();
  setStatus(`Failed to load video: ${message}`);
});

videoFitSelect.addEventListener("change", () => {
  console.info(`[Video] Frame sizing set to ${videoFitSelect.value}.`);
  updateVideoFrame(performance.now(), true);
});

previewVideoButton.addEventListener("click", () => {
  if (videoPreview.paused) {
    playVideoPreview();
  } else {
    videoPreview.pause();
  }
});

playVideoButton.addEventListener("click", () => {
  if (videoPlaybackOnLaunchpad) {
    if (videoPreview.paused) {
      playVideoPreview();
    } else {
      videoPreview.pause();
    }
  } else {
    startVideoLaunchpadPlayback();
  }
});

function refreshOutputs() {
  console.info("[MIDI] Searching for available MIDI outputs.");
  const previousId = outputSelect.value;
  const outputs = Array.from((midiAccess!.outputs as unknown as Map<string, MIDIOutput>).values())
    .filter((output) => output.state !== "disconnected")
    .sort((a, b) => matchingScore(b) - matchingScore(a));

  console.info("[MIDI] MIDI outputs found:", outputs.map((output) => ({
    id: output.id,
    name: output.name || "Unnamed MIDI output",
    manufacturer: output.manufacturer || "",
    state: output.state
  })));

  outputSelect.replaceChildren();
  outputs.forEach((output) => {
    const option = document.createElement("option");
    option.value = output.id;
    option.textContent = output.name || `MIDI output ${output.id}`;
    outputSelect.append(option);
  });

  if (outputs.some((output) => output.id === previousId)) {
    outputSelect.value = previousId;
  } else {
    const suggested = outputs.find((output) => matchingScore(output) > 0);
    outputSelect.value = suggested ? suggested.id : "";
  }

  if (outputs.length === 0) {
    console.warn("[MIDI] No MIDI outputs are currently available.");
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No MIDI outputs detected";
    outputSelect.append(option);
  } else {
    const selectedOutput = outputSelect.selectedOptions[0];
    console.info("[MIDI] Selected MIDI output:", selectedOutput ? selectedOutput.textContent : "No output selected");
  }

  outputSelect.disabled = Boolean(midiOutput) || outputs.length === 0;
}

async function disconnect() {
  if (!midiOutput) {
    return;
  }

  const output = midiOutput;
  midiOutput = null;
  stopVideoLaunchpadPlayback("MIDI disconnected");
  updateSendImageButton();
  updateVideoButtons();
  let message = "Not connected.";
  console.info(`[MIDI] Disconnecting from ${output.name || output.id}; attempting to restore Live mode.`);
  try {
    sendMidiMessage(output, [...sysexHeader, 0x0e, 0x00, 0xf7], "Live mode");
  } catch (error) {
    message = `Disconnected, but couldn't restore Live mode: ${(error as Error).message}`;
  }

  connectButton.textContent = "Connect";
  connectButton.disabled = false;
  refreshOutputs();
  console.info(`[MIDI] Disconnected from ${output.name || output.id}.`);
  setStatus(message);
}

async function connect() {
  if (connecting) {
    console.warn("[MIDI] A connection attempt is already in progress.");
    return;
  }

  if (!window.isSecureContext) {
    console.error("[MIDI] Cannot connect: Web MIDI requires a secure context.");
    setStatus("Web MIDI requires HTTPS or localhost. Open this page from a secure origin and try again.");
    return;
  }

  if (!navigator.requestMIDIAccess) {
    console.error("[MIDI] Cannot connect: this browser does not expose the Web MIDI API.");
    setStatus("Web MIDI isn't exposed by this browser. Check Firefox's MIDI support and site permissions, then reload.");
    return;
  }

  connecting = true;
  connectButton.disabled = true;
  let output: MIDIOutput | null = null;
  let programmerModeSent = false;
  console.info("[MIDI] Starting connection; requesting SysEx access if needed.");
  try {
    if (!midiAccess) {
      midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      midiAccess.addEventListener("statechange", handleMidiStateChange);
      console.info("[MIDI] MIDI access granted with SysEx permission.");
      refreshOutputs();
    }

    output = (midiAccess.outputs as unknown as Map<string, MIDIOutput>).get(outputSelect.value) || null;
    if (!output || output.state === "disconnected") {
      console.warn("[MIDI] No available output is selected; connect the Launchpad and choose its MIDI port.");
      setStatus("No MIDI output selected. Connect the Launchpad X and choose its LPX or Launchpad X MIDI port.");
      return;
    }

    console.info(`[MIDI] Connecting to ${output.name || output.id}; switching to Programmer mode.`);
    sendMidiMessage(output, [...sysexHeader, 0x0e, 0x01, 0xf7], "Programmer mode");
    programmerModeSent = true;
    sendGridColors(output);
    midiOutput = output;
    outputSelect.disabled = true;
    connectButton.textContent = "Disconnect";
    updateSendImageButton();
    updateVideoButtons();
    console.info(`[MIDI] Connected to ${output.name || output.id} in Programmer mode.`);
    setStatus(`Connected to ${output.name || "MIDI output"} in Programmer mode.`, true);
  } catch (error) {
    console.error("[MIDI] Connection failed.", error);
    let message = `MIDI connection failed: ${(error as Error).message}`;
    if (output && output.state !== "disconnected") {
      try {
        if (programmerModeSent) {
          console.info(`[MIDI] Connection failed; attempting to restore Live mode on ${output.name || output.id}.`);
          sendMidiMessage(output, [...sysexHeader, 0x0e, 0x00, 0xf7], "Live mode");
        }
      } catch (closeError) {
        console.error("[MIDI] Could not restore Live mode after the connection failed.", closeError);
        message += `. Could not restore Live mode: ${(closeError as Error).message}`;
      }
    }
    outputSelect.disabled = false;
    connectButton.textContent = "Connect";
    updateVideoButtons();
    setStatus(message);
  } finally {
    connecting = false;
    connectButton.disabled = false;
  }
}

function handleMidiStateChange() {
  const connectedOutput = midiOutput;
  if (connectedOutput && connectedOutput.state === "disconnected") {
    console.warn(`[MIDI] Connected output disconnected: ${connectedOutput.name || connectedOutput.id}.`);
    midiOutput = null;
    stopVideoLaunchpadPlayback("MIDI output disconnected");
    connectButton.textContent = "Connect";
    updateVideoButtons();
    setStatus("Launchpad MIDI output disconnected.");
  }

  refreshOutputs();
}

function restoreLiveMode() {
  if (!midiOutput) {
    return;
  }

  try {
    console.info(`[MIDI] Page is leaving; attempting to restore Live mode on ${midiOutput.name || midiOutput.id}.`);
    sendMidiMessage(midiOutput, [...sysexHeader, 0x0e, 0x00, 0xf7], "Live mode");
  } catch (error) {
    console.error("Could not restore Launchpad X Live mode while leaving the page.", error);
  }
}

function restoreProgrammerMode(event: PageTransitionEvent) {
  if (!event.persisted || !midiOutput) {
    return;
  }

  try {
    console.info(`[MIDI] Page restored from browser cache; restoring Programmer mode on ${midiOutput.name || midiOutput.id}.`);
    sendMidiMessage(midiOutput, [...sysexHeader, 0x0e, 0x01, 0xf7], "Programmer mode");
    sendGridColors();
  } catch (error) {
    setStatus(`MIDI send failed after returning to the page: ${(error as Error).message}`);
  }
}

function autoConnect() {
  console.info("[MIDI] Page loaded; attempting automatic connection.");
  void connect();
}

clearButton.addEventListener("click", () => {
  grid.querySelectorAll("input").forEach((input) => {
    input.value = "";
    input.dispatchEvent(new Event("input"));
  });
});

connectButton.addEventListener("click", () => {
  if (midiOutput) {
    disconnect();
  } else {
    connect();
  }
});

window.addEventListener("pagehide", restoreLiveMode);
window.addEventListener("pageshow", restoreProgrammerMode);
window.addEventListener("load", autoConnect, { once: true });
