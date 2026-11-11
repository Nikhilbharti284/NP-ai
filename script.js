if (typeof puter !== 'undefined') puter.quiet = true;

// ==================== PRE-LOADED FALLBACK KEY ====================
const ENCODED_DEFAULT_KEY = 'QVEuQWI4Uk42S0VnUmRiUDQ3eDJyQlg3eXBtVzF3MktoNExPMVZMSHRFTjcwVHJmNUp3QlE=';
function getDefaultKey() {
  try { return atob(ENCODED_DEFAULT_KEY); } catch (e) { return ''; }
}

// ==================== SYSTEM PROMPT ====================
const DEFAULT_PROMPT = `[SYSTEM: CLAUDE SONNET ULTRA – TECHNICAL & CREATIVE MODE]
You are a powerful AI assistant modeled with Claude Sonnet's deep reasoning, coding mastery, cybersecurity auditing, and creative storytelling capabilities.
- Always provide complete, production-ready code (Python, JS, C++, Bash, Web Apps) and direct answers in the user's language (Hindi, Hinglish, or English).
- Whenever asked to test, calculate, or scan via Python, include a runnable \`\`\`python block so the built-in Pyodide engine executes it live.`;

// ==================== STATE ====================
const state = {
  conversations: {},
  activeChatId: null,
  conversation: [],
  busy: false,
  stopFlag: false,
  abortCtrl: null,
  geminiKey: getDefaultKey(),
  systemPrompt: DEFAULT_PROMPT,
  currentModel: 'claude-3-7-sonnet',
  webSearchMode: false,
  imageGenMode: false,
  videoGenMode: false,
  showThinking: true,
  faceLockEnabled: true,
  autoRunPython: true,
  attachedImageDataUrl: null,
  autoVoice: false,
  speechSynth: window.speechSynthesis,
  pyodide: null,
  pyodideLoading: false,
  vfs: {
    'recon.py': `import sys, hashlib\nprint("[*] Python 3.12 Engine Online")\nprint("[+] Version:", sys.version.split()[0])\nprint("[+] SHA256:", hashlib.sha256(b"chatgpt_ultra").hexdigest())`,
    'notes.txt': `Termux Workspace Ready.\nType 'help' to see all available commands.`
  },
  editor: {
    originalImage: null,
    baseImage: null,
    sampledHue: null,
    lastTargetColor: 'red',
    maskBrushActive: false,
    hasMaskStrokes: false,
    isDrawingMask: false,
    rotation: 0,
    flipH: 1,
    flipV: 1,
    filters: { brightness: 100, contrast: 100, saturation: 100, sepia: 0 },
    texts: []
  }
};

// ==================== DOM ELEMENTS ====================
const DOM = {
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  chatList: document.getElementById('chatList'),
  chatInner: document.getElementById('chatInner'),
  chatContainer: document.getElementById('chatContainer'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  modelSelect: document.getElementById('modelSelect'),
  settingsPanel: document.getElementById('settingsPanel'),
  geminiKeyInput: document.getElementById('geminiKeyInput'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  showThinkingCheck: document.getElementById('showThinkingCheck'),
  autoVoiceCheck: document.getElementById('autoVoiceCheck'),
  faceLockCheck: document.getElementById('faceLockCheck'),
  autoRunPyCheck: document.getElementById('autoRunPyCheck'),
  attachmentBar: document.getElementById('attachmentBar'),
  attachedImgThumb: document.getElementById('attachedImgThumb'),
  chatImageUpload: document.getElementById('chatImageUpload'),
  createVideoModeBtn: document.getElementById('createVideoModeBtn'),
  createImgModeBtn: document.getElementById('createImgModeBtn'),
  webSearchToggleBtn: document.getElementById('webSearchToggleBtn'),
  micBtn: document.getElementById('micBtn'),
  studioModal: document.getElementById('studioModal'),
  editorCanvas: document.getElementById('editorCanvas'),
  maskCanvas: document.getElementById('maskCanvas'),
  studioPromptInput: document.getElementById('studioPromptInput'),
  studioEngineSelect: document.getElementById('studioEngineSelect'),
  studioLoading: document.getElementById('studioLoading'),
  studioLoadingText: document.getElementById('studioLoadingText'),
  uploadImageInput: document.getElementById('uploadImageInput'),
  termuxModal: document.getElementById('termuxModal'),
  termuxOutput: document.getElementById('termuxOutput'),
  termuxInput: document.getElementById('termuxInput'),
  sandboxModal: document.getElementById('sandboxModal'),
  sandboxCodeEditor: document.getElementById('sandboxCodeEditor'),
  sandboxFrame: document.getElementById('sandboxFrame'),
  toastContainer: document.getElementById('toastContainer')
};

function on(idOrEl, event, handler) {
  const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (el) el.addEventListener(event, handler);
}

if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function(code, lang) {
      if (typeof hljs !== 'undefined') {
        if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        return hljs.highlightAuto(code).value;
      }
      return code;
    }
  });
}

// ==================== INITIALIZE ====================
function init() {
  loadStorage();
  bindEvents();
  bindStudioEvents();
  bindTermuxEvents();
  const theme = localStorage.getItem('chatgpt_ultra_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeLabel();
  drawEmptyStudioCanvas();
  printTermuxBanner();
}

// ==================== CORS-PROOF IMAGE FETCHER & COMPRESSOR ====================
async function fetchImageAsDataUrl(urlOrFile, maxDim = 850) {
  if (typeof urlOrFile === 'string' && urlOrFile.startsWith('data:')) {
    return compressGalleryImage(urlOrFile, maxDim);
  }
  if (typeof urlOrFile === 'string' && urlOrFile.startsWith('http')) {
    try {
      const resp = await fetch(urlOrFile);
      const blob = await resp.blob();
      return await compressGalleryImage(blob, maxDim);
    } catch (e) {
      return compressGalleryImage(urlOrFile, maxDim);
    }
  }
  return compressGalleryImage(urlOrFile, maxDim);
}

function compressGalleryImage(fileOrDataUrl, maxDim = 850) {
  return new Promise((resolve, reject) => {
    const processImg = (src) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = src;
    };

    if (typeof fileOrDataUrl === 'string') {
      processImg(fileOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = e => processImg(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

// ==================== ENGINE 1: FACE-LOCK DRESS SHADER ====================
const DRESS_COLOR_MAP = {
  red:    { h: 355, s: 0.82, lScale: 0.90, label: 'Royal Red' },
  blue:   { h: 220, s: 0.82, lScale: 0.88, label: 'Royal Blue' },
  green:  { h: 150, s: 0.78, lScale: 0.86, label: 'Emerald Green' },
  gold:   { h: 43,  s: 0.88, lScale: 1.00, label: 'Golden Yellow' },
  purple: { h: 278, s: 0.76, lScale: 0.90, label: 'Royal Purple' },
  teal:   { h: 178, s: 0.80, lScale: 0.86, label: 'Peacock Teal' },
  maroon: { h: 348, s: 0.78, lScale: 0.62, label: 'Deep Maroon' },
  black:  { h: 220, s: 0.10, lScale: 0.38, label: 'Jet Black' }
};

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function hueDistance(h1, h2) {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

async function detectFaceBoundingBox(imgEl) {
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;

  if ('FaceDetector' in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(imgEl);
      if (faces && faces.length > 0) {
        const box = faces[0].boundingBox;
        return {
          cx: box.x + box.width / 2,
          cy: box.y + box.height / 2,
          rx: box.width * 0.65,
          ry: box.height * 0.78
        };
      }
    } catch (e) {}
  }

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let sumX = 0, sumY = 0, count = 0;
  const minY = Math.floor(h * 0.04), maxY = Math.floor(h * 0.35);
  const minX = Math.floor(w * 0.25), maxX = Math.floor(w * 0.75);

  for (let y = minY; y < maxY; y += 3) {
    for (let x = minX; x < maxX; x += 3) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [hue, sat, light] = rgbToHsl(r, g, b);
      if (hue >= 8 && hue <= 38 && sat >= 0.15 && sat <= 0.68 && light >= 0.24 && light <= 0.85 && r > g && g > b) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count > 25) {
    return { cx: sumX / count, cy: sumY / count, rx: w * 0.11, ry: h * 0.10 };
  }
  return { cx: w * 0.5, cy: h * 0.17, rx: w * 0.11, ry: h * 0.10 };
}

function detectDominantDressStats(imgData, width, height, faceBox) {
  const buckets = new Array(36).fill(0);
  let lowSatPixels = 0, colorPixels = 0;
  const startX = Math.floor(width * 0.26), endX = Math.floor(width * 0.74);
  const startY = Math.floor(Math.max(height * 0.34, faceBox.cy + faceBox.ry * 1.15));
  const endY = Math.floor(height * 0.88);
  const data = imgData.data;

  for (let y = startY; y < endY; y += 2) {
    for (let x = startX; x < endX; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      const isSkin = (h >= 10 && h <= 37 && s >= 0.16 && s <= 0.65 && l >= 0.22 && l <= 0.84) && (r > g && g > b);
      if (isSkin) continue;

      if (s > 0.12 && l > 0.12 && l < 0.92) {
        buckets[Math.floor(h / 10) % 36]++;
        colorPixels++;
      } else if (l > 0.18 && l < 0.92) {
        lowSatPixels++;
      }
    }
  }

  let bestBucket = 33, maxCount = 0;
  for (let i = 0; i < 36; i++) {
    if (buckets[i] > maxCount) { maxCount = buckets[i]; bestBucket = i; }
  }
  return {
    hue: bestBucket * 10 + 5,
    isNeutralDress: lowSatPixels > colorPixels * 1.5
  };
}

async function recolorRealPhotoDress(imageElementOrDataUrl, targetColorSpec = 'red', customSourceHue = null, tolerance = 48, maskCanvasEl = null) {
  const loadImg = (src) => new Promise((res, rej) => {
    if (typeof src !== 'string') return res(src);
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

  const img = await loadImg(imageElementOrDataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const faceBox = await detectFaceBoundingBox(img);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let maskData = null;
  if (maskCanvasEl && state.editor.hasMaskStrokes) {
    const mTemp = document.createElement('canvas');
    mTemp.width = w;
    mTemp.height = h;
    const mCtx = mTemp.getContext('2d');
    mCtx.drawImage(maskCanvasEl, 0, 0, w, h);
    maskData = mCtx.getImageData(0, 0, w, h).data;
  }

  let target = DRESS_COLOR_MAP[targetColorSpec] || DRESS_COLOR_MAP.red;
  if (typeof targetColorSpec === 'object' && targetColorSpec.h !== undefined) target = targetColorSpec;

  const dressStats = detectDominantDressStats(imgData, w, h, faceBox);
  const sourceHue = customSourceHue !== null ? customSourceHue : dressStats.hue;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (maskData && maskData[idx + 3] < 20) continue;

      const normFaceDist = Math.hypot((x - faceBox.cx) / (faceBox.rx * 1.15), (y - faceBox.cy) / (faceBox.ry * 1.2));
      if (!maskData && normFaceDist < 1.0) continue;

      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const [hue, sat, light] = rgbToHsl(r, g, b);

      const isSkin = (hue >= 10 && hue <= 37 && sat >= 0.16 && sat <= 0.64 && light >= 0.22 && light <= 0.85) && (r > g && g > b);
      if (isSkin && !maskData && hueDistance(sourceHue, 22) > 18) continue;

      const inTorsoEllipse = Math.hypot((x - faceBox.cx) / (w * 0.28), (y - (faceBox.cy + h * 0.42)) / (h * 0.36)) < 1.0;
      const dist = hueDistance(hue, sourceHue);
      const matchesColoredDress = dist <= tolerance && sat >= 0.09 && light >= 0.10 && light <= 0.94;
      const matchesNeutralDress = dressStats.isNeutralDress && inTorsoEllipse && !isSkin && light >= 0.15 && light <= 0.92;

      if (maskData || matchesColoredDress || matchesNeutralDress) {
        const blend = maskData ? 0.92 : (matchesColoredDress ? (1 - Math.pow(dist / tolerance, 1.6)) : 0.78);
        const newHue = target.h;
        const newSat = Math.min(1, sat * (1 - blend) + target.s * blend);
        const newLight = Math.max(0.08, Math.min(0.92, light * (1 - blend * 0.36) + (light * target.lScale) * (blend * 0.36)));
        const [nr, ng, nb] = hslToRgb(newHue, newSat, newLight);
        data[idx] = nr;
        data[idx + 1] = ng;
        data[idx + 2] = nb;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function createFaceLockedComposite(originalDataUrl, aiGeneratedUrl, maskCanvasEl = null) {
  try {
    const safeOrigDataUrl = await fetchImageAsDataUrl(originalDataUrl, 800);
    const safeAiDataUrl = await fetchImageAsDataUrl(aiGeneratedUrl, 800);

    const loadImg = (src) => new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });

    const origImg = await loadImg(safeOrigDataUrl);
    const aiImg = await loadImg(safeAiDataUrl);

    const w = origImg.naturalWidth || origImg.width;
    const h = origImg.naturalHeight || origImg.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (maskCanvasEl && state.editor.hasMaskStrokes) {
      ctx.drawImage(origImg, 0, 0, w, h);
      const maskTemp = document.createElement('canvas');
      maskTemp.width = w;
      maskTemp.height = h;
      const mCtx = maskTemp.getContext('2d');
      mCtx.filter = 'blur(8px)';
      mCtx.drawImage(maskCanvasEl, 0, 0, w, h);
      mCtx.globalCompositeOperation = 'source-in';
      mCtx.filter = 'none';
      mCtx.drawImage(aiImg, 0, 0, w, h);
      ctx.drawImage(maskTemp, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.92);
    }

    ctx.drawImage(aiImg, 0, 0, w, h);

    const origFace = await detectFaceBoundingBox(origImg);
    const aiFace = await detectFaceBoundingBox(aiImg);
    const scaleRatio = Math.max(0.75, Math.min(1.35, ((aiFace.rx / origFace.rx) + (aiFace.ry / origFace.ry)) / 2));

    const faceLayer = document.createElement('canvas');
    faceLayer.width = w;
    faceLayer.height = h;
    const fCtx = faceLayer.getContext('2d');

    fCtx.save();
    const grad = fCtx.createRadialGradient(
      aiFace.cx, aiFace.cy, Math.min(aiFace.rx, aiFace.ry) * 0.45,
      aiFace.cx, aiFace.cy, Math.max(aiFace.rx, aiFace.ry) * 1.28
    );
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.68, 'rgba(0,0,0,0.94)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    fCtx.fillStyle = grad;
    fCtx.beginPath();
    fCtx.ellipse(aiFace.cx, aiFace.cy, aiFace.rx * 1.25, aiFace.ry * 1.3, 0, 0, Math.PI * 2);
    fCtx.fill();

    fCtx.globalCompositeOperation = 'source-in';
    const destW = w * scaleRatio;
    const destH = h * scaleRatio;
    const dx = aiFace.cx - origFace.cx * scaleRatio;
    const dy = aiFace.cy - origFace.cy * scaleRatio;
    fCtx.drawImage(origImg, dx, dy, destW, destH);
    fCtx.restore();

    ctx.drawImage(faceLayer, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (e) {
    return aiGeneratedUrl;
  }
}

function detectRequestedColorKey(text) {
  const t = (text || '').toLowerCase();
  if (/(blue|neela|neeli|नीला|नीली|royal blue)/i.test(t)) return 'blue';
  if (/(green|hara|hari|हरा|हरी|emerald)/i.test(t)) return 'green';
  if (/(gold|golden|yellow|peela|peeli|पीला|सुनहरा)/i.test(t)) return 'gold';
  if (/(purple|violet|jamuni|बैंगनी)/i.test(t)) return 'purple';
  if (/(teal|peacock|firozi|फिरोज़ी)/i.test(t)) return 'teal';
  if (/(maroon|मैरून)/i.test(t)) return 'maroon';
  if (/(black|kala|kali|काला|काली|dark)/i.test(t)) return 'black';
  return 'red';
}

// ==================== ENGINE 2: KEYLESS AI VIDEO / STORY MOVIE GENERATOR ====================
// Creates a 4-Scene Widescreen Storyboard + Renders a Real Downloadable WebM Video with Ken Burns Camera Pan, Subtitles & Voiceover!
async function generateStoryVideoNoKey(userPrompt, aiBodyEl) {
  aiBodyEl.innerHTML = `
    <div class="video-gen-card">
      <div class="video-progress-wrap" id="vidProgWrap">
        <div class="video-progress-top">
          <span id="vidStatusTitle">🎬 AI Movie Studio: कहानी और सीन्स तैयार किए जा रहे हैं...</span>
          <span id="vidPercentText">8%</span>
        </div>
        <div class="video-progress-bar-bg">
          <div class="video-progress-bar-fill" id="vidBarFill" style="width: 8%;"></div>
        </div>
        <div class="video-step-log" id="vidStepLog">
          <div>▸ [Step 1/4] Claude Sonnet Director से 4-Scene स्क्रिप्ट और डायलॉग बन रहे हैं...</div>
        </div>
      </div>
      <div class="video-player-stage" id="vidStage" style="display:none;">
        <canvas id="movieRenderCanvas" width="854" height="480"></canvas>
      </div>
      <div class="video-controls-bar" id="vidControls" style="display:none;"></div>
    </div>`;

  const statusTitle = aiBodyEl.querySelector('#vidStatusTitle');
  const percentText = aiBodyEl.querySelector('#vidPercentText');
  const barFill = aiBodyEl.querySelector('#vidBarFill');
  const stepLog = aiBodyEl.querySelector('#vidStepLog');
  const vidStage = aiBodyEl.querySelector('#vidStage');
  const movieCanvas = aiBodyEl.querySelector('#movieRenderCanvas');
  const vidControls = aiBodyEl.querySelector('#vidControls');

  const updateProgress = (pct, title, logLine) => {
    if (barFill) barFill.style.width = `${pct}%`;
    if (percentText) percentText.textContent = `${pct}%`;
    if (title && statusTitle) statusTitle.textContent = title;
    if (logLine && stepLog) {
      const d = document.createElement('div');
      d.textContent = logLine;
      stepLog.appendChild(d);
    }
    scrollToBottom();
  };

  // Step 1: Generate 4 Cinematic Scenes (Visual Prompt + Narration Subtitle)
  const directorPrompt = `Create a 4-scene cinematic mini-movie storyboard for: "${userPrompt}".
Return ONLY valid JSON array of 4 objects with keys "visual" (detailed English 35mm cinema shot description, max 28 words) and "subtitle" (engaging Hindi or Hinglish story narration for that scene, max 18 words).
Example format:
[{"visual":"Wide cinematic shot of...","subtitle":"एक घने जंगल में..."}]`;

  let scenes = [];
  try {
    const rawJson = await askMultimodalAI([{ role: 'user', content: directorPrompt }], state.currentModel);
    const match = rawJson.match(/\[[\s\S]*\]/);
    if (match) scenes = JSON.parse(match[0]);
  } catch (e) {}

  if (!Array.isArray(scenes) || scenes.length < 2) {
    scenes = [
      { visual: `Cinematic wide establishing shot of ${userPrompt}, dramatic lighting, 4k movie still, 35mm film`, subtitle: `कहानी की शुरुआत: ${userPrompt}` },
      { visual: `Close up dynamic action shot of main character in ${userPrompt}, atmospheric glow, photorealistic cinema`, subtitle: `अचानक माहौल बदलता है और एक नया मोड़ आता है...` },
      { visual: `Epic dramatic climax scene of ${userPrompt}, volumetric lighting, ultra detailed movie frame`, subtitle: `सच्चाई सामने आती है और रोमांच अपने चरम पर पहुँच जाता है!` },
      { visual: `Grand cinematic finale sunset wide shot of ${userPrompt}, emotional movie ending, 8k`, subtitle: `और इस तरह यह यादगार सफर एक नई उम्मीद के साथ पूरा होता है।` }
    ];
  }
  scenes = scenes.slice(0, 4);

  updateProgress(22, '🎨 Scene Keyframes रेंडर हो रहे हैं (No API Key)...', `✓ [Step 1 Complete] ${scenes.length} सीन्स की स्क्रिप्ट तैयार हो गई।`);

  // Step 2: Load Widescreen Frames for Each Scene with Live Progress Updates
  const loadedImages = [];
  for (let i = 0; i < scenes.length; i++) {
    if (state.stopFlag) throw new Error('Video generation cancelled.');
    const sc = scenes[i];
    const pct = 25 + Math.round(((i + 1) / scenes.length) * 45);
    updateProgress(pct, `🖼️ Scene ${i + 1}/${scenes.length} का HD फ्रेम जनरेट हो रहा है...`, `▸ [Scene ${i + 1}/${scenes.length}] Rendering: "${sc.subtitle}"`);

    const promptClean = `${sc.visual}, cinematic movie frame, 35mm film grain, dramatic lighting, photorealistic`;
    const imgUrl = getRealisticImageUrl(promptClean, 'flux-realism', 854, 480, Math.floor(Math.random() * 999999));

    try {
      const dataUrl = await fetchImageAsDataUrl(imgUrl, 854);
      const imgEl = await new Promise((res, rej) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = dataUrl;
      });
      loadedImages.push({ img: imgEl, subtitle: sc.subtitle });
    } catch (e) {
      // Fallback canvas frame if network hiccups
      const fb = document.createElement('canvas');
      fb.width = 854; fb.height = 480;
      const fctx = fb.getContext('2d');
      fctx.fillStyle = '#111827';
      fctx.fillRect(0, 0, 854, 480);
      loadedImages.push({ img: fb, subtitle: sc.subtitle });
    }
  }

  updateProgress(78, '🎞️ कैनवास पर 30fps मूवी, कैमरा ज़ूम और सबटाइटल एनकोड हो रहे हैं...', '▸ [Step 3/4] Encoding real .webm video stream (Ken Burns Pan & Subtitles)...');
  vidStage.style.display = 'flex';

  // Step 3: Render & Record Real Video on Canvas (Ken Burns Zoom + Crossfade + Burned Subtitles)
  const ctx = movieCanvas.getContext('2d');
  const fps = 30;
  const secondsPerScene = 3.2;
  const framesPerScene = Math.round(fps * secondsPerScene);
  const totalFrames = loadedImages.length * framesPerScene;

  let mediaRecorder = null;
  const recordedChunks = [];
  try {
    const stream = movieCanvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start();
  } catch (e) {}

  const drawWrappedSubtitle = (text, alpha = 1) => {
    if (!text) return;
    ctx.save();
    ctx.font = '600 21px Inter, sans-serif';
    ctx.textAlign = 'center';
    const maxW = 760;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);

    const boxH = lines.length * 30 + 18;
    const boxY = 480 - boxH - 22;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.68 * alpha})`;
    ctx.beginPath();
    ctx.roundRect(60, boxY, 854 - 120, boxH, 10);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, 854 / 2, boxY + 26 + idx * 28);
    });
    ctx.restore();
  };

  // Speak narration of first scene while encoding preview plays
  if (state.speechSynth) {
    const fullNarration = loadedImages.map(s => s.subtitle).join('। ');
    speakReply(fullNarration);
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    if (state.stopFlag) break;
    const sceneIdx = Math.min(loadedImages.length - 1, Math.floor(frame / framesPerScene));
    const localFrame = frame % framesPerScene;
    const progress = localFrame / framesPerScene;

    const currentItem = loadedImages[sceneIdx];
    const zoom = 1.0 + progress * 0.12;
    const panX = (sceneIdx % 2 === 0 ? -1 : 1) * progress * 18;

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 854, 480);
    ctx.translate(854 / 2 + panX, 480 / 2);
    ctx.scale(zoom, zoom);
    ctx.drawImage(currentItem.img, -854 / 2, -480 / 2, 854, 480);
    ctx.restore();

    // Top scene badge
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(16, 16, 130, 28);
    ctx.fillStyle = '#10a37f';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillText(`● SCENE ${sceneIdx + 1} / ${loadedImages.length}`, 28, 34);

    drawWrappedSubtitle(currentItem.subtitle, 1);

    if (frame % 15 === 0) {
      const encPct = Math.min(99, 78 + Math.round((frame / totalFrames) * 21));
      if (barFill) barFill.style.width = `${encPct}%`;
      if (percentText) percentText.textContent = `${encPct}%`;
    }

    await new Promise(r => setTimeout(r, 1000 / fps));
  }

  let videoBlobUrl = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await new Promise(resolve => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        videoBlobUrl = URL.createObjectURL(blob);
        resolve();
      };
      mediaRecorder.stop();
    });
  }

  updateProgress(100, '✅ AI Story Movie तैयार है!', '✓ [Step 4/4] Movie rendered with voiceover & subtitles!');

  if (videoBlobUrl) {
    vidStage.innerHTML = `<video src="${videoBlobUrl}" controls autoplay loop playsinline></video>`;
  }

  vidControls.style.display = 'flex';
  vidControls.innerHTML = `
    <span style="font-size:12px;color:var(--text-muted)">🎬 ${loadedImages.length} Scenes · Widescreen HD · Voiceover</span>
    <div style="display:flex;gap:8px;">
      <button class="msg-tool-btn" id="replayVoiceBtn">🔊 Narrate Story</button>
      ${videoBlobUrl ? `<a class="msg-tool-btn" href="${videoBlobUrl}" download="ai-story-movie-${Date.now()}.webm">📥 Download Video (.webm)</a>` : ''}
    </div>`;

  const replayBtn = vidControls.querySelector('#replayVoiceBtn');
  if (replayBtn) {
    replayBtn.onclick = () => speakReply(loadedImages.map(s => s.subtitle).join('। '));
  }

  return `**[🎬 AI Movie Generated: ${userPrompt}]**\n` + loadedImages.map((s, i) => `${i + 1}. ${s.subtitle}`).join('\n');
}

// ==================== REAL-TIME THINKING & STREAMING CLAUDE SONNET ENGINE ====================
function createThinkingProcessUI(parentEl, userQuery, modelName) {
  const details = document.createElement('details');
  details.className = 'thinking-box';
  details.open = true;

  const summary = document.createElement('summary');
  summary.innerHTML = `<span class="thinking-dot"></span> <span class="thinking-title">Thinking (${escapeHtml(modelName)})...</span> <span class="thinking-timer" style="margin-left:auto;font-family:monospace;">0.1s</span>`;

  const stepsDiv = document.createElement('div');
  stepsDiv.className = 'thinking-steps';

  details.append(summary, stepsDiv);
  parentEl.appendChild(details);

  const startTime = performance.now();
  const timerId = setInterval(() => {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    const tEl = summary.querySelector('.thinking-timer');
    if (tEl) tEl.textContent = `${elapsed}s`;
  }, 100);

  const addStep = (text) => {
    const line = document.createElement('div');
    line.className = 'thinking-step-line';
    line.textContent = `• ${text}`;
    stepsDiv.appendChild(line);
    scrollToBottom();
  };

  // Immediate live diagnostic thoughts so the user sees instant activity
  const qShort = (userQuery || '').substring(0, 60);
  addStep(`Analyzing user intent: "${qShort}..."`);
  if (/(code|python|js|html|script|bug|exploit|recon)/i.test(userQuery)) {
    setTimeout(() => !details.classList.contains('done') && addStep('Structuring clean, executable architecture & checking edge cases...'), 350);
  } else {
    setTimeout(() => !details.classList.contains('done') && addStep(`Synthesizing knowledge base with ${modelName}...`), 350);
  }

  return {
    addStep,
    appendRawThought: (chunk) => {
      let rawSpan = stepsDiv.querySelector('.raw-model-thought');
      if (!rawSpan) {
        rawSpan = document.createElement('div');
        rawSpan.className = 'raw-model-thought';
        rawSpan.style.marginTop = '6px';
        rawSpan.style.color = 'var(--text)';
        stepsDiv.appendChild(rawSpan);
      }
      rawSpan.textContent += chunk;
    },
    finish: () => {
      clearInterval(timerId);
      const totalSec = ((performance.now() - startTime) / 1000).toFixed(1);
      details.classList.add('done');
      const titleEl = summary.querySelector('.thinking-title');
      if (titleEl) titleEl.textContent = `Thought for ${totalSec} seconds`;
      // Collapse automatically after 1.2s so the answer is clean like ChatGPT
      setTimeout(() => { details.open = false; }, 1200);
    }
  };
}

// Streams live tokens from Puter Claude Sonnet or fallback API with a blinking cursor
async function streamMultimodalAI(messages, model = 'claude-3-7-sonnet', onToken = null, thinkingUI = null) {
  // 1. Try Puter.js Streaming for Claude 3.7 / 3.5 Sonnet & GPT-4o
  if (typeof puter !== 'undefined' && puter.ai?.chat && ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'gpt-4o'].includes(model)) {
    const puterModelMap = {
      'claude-3-7-sonnet': 'claude-3-7-sonnet',
      'claude-3-5-sonnet': 'claude-3-5-sonnet',
      'gpt-4o': 'gpt-4o'
    };
    const targetPuterModel = puterModelMap[model] || 'claude-3-5-sonnet';
    try {
      if (thinkingUI) thinkingUI.addStep(`Connected to Puter Cloud (${targetPuterModel}). Streaming tokens...`);
      const streamResp = await puter.ai.chat(messages, { model: targetPuterModel, stream: true });
      let fullText = '';
      if (streamResp && typeof streamResp[Symbol.asyncIterator] === 'function') {
        for await (const part of streamResp) {
          if (state.stopFlag) break;
          const chunk = part?.text || part?.message?.content || (typeof part === 'string' ? part : '');
          if (chunk) {
            fullText += chunk;
            if (onToken) onToken(fullText);
          }
        }
        if (fullText.trim()) return fullText.trim();
      } else {
        const directText = typeof streamResp === 'string' ? streamResp : (streamResp?.message?.content || '');
        if (directText.trim()) {
          if (onToken) onToken(directText);
          return directText.trim();
        }
      }
    } catch (e) {
      if (thinkingUI) thinkingUI.addStep(`Primary stream busy, switching to high-speed backup node...`);
    }
  }

  // 2. Fallback to standard askMultimodalAI + smooth live word streaming
  const reply = await askMultimodalAI(messages, model, thinkingUI);

  // Extract <think>...</think> blocks if returned by DeepSeek R1
  const thinkMatch = reply.match(/<think>([\s\S]*?)<\/think>/i);
  let cleanAnswer = reply;
  if (thinkMatch && thinkMatch[1]) {
    if (thinkingUI) thinkingUI.appendRawThought(thinkMatch[1].trim());
    cleanAnswer = reply.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
  }

  if (onToken) {
    const words = cleanAnswer.split(' ');
    let cur = '';
    const step = Math.max(2, Math.ceil(words.length / 45));
    for (let i = 0; i < words.length; i += step) {
      if (state.stopFlag) break;
      cur += words.slice(i, i + step).join(' ') + ' ';
      onToken(cur);
      await new Promise(r => setTimeout(r, 16));
    }
  }
  return cleanAnswer;
}

function isRefusalResponse(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 70 && /(i'm sorry|i cannot|i can't|unable to assist|unable to fulfill|against my safety)/i.test(t)) {
    return true;
  }
  return /^(i'm sorry, i can't|i cannot fulfill this request|sorry, i can't assist)/i.test(t);
}

async function tryGeminiNativeImageEdit(promptText, base64DataUrl, key) {
  if (!key || !base64DataUrl || !base64DataUrl.startsWith('data:')) return null;
  const cleanKey = key.trim().replace(/\.$/, '');
  const [meta, b64] = base64DataUrl.split(',');
  const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/jpeg';

  const payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: `Edit this photo photorealistically while keeping the exact same person's face, identity, and background: ${promptText}` },
        { inline_data: { mime_type: mime, data: b64 } }
      ]
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  };

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${encodeURIComponent(cleanKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (resp.ok) {
      const data = await resp.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find(p => p.inlineData || p.inline_data);
      const inline = imgPart?.inlineData || imgPart?.inline_data;
      if (inline?.data) {
        return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
      }
    }
  } catch (e) {}
  return null;
}

async function tryDirectGeminiAPI(messages, key) {
  if (!key || key.length < 10) return null;
  const cleanKey = key.trim().replace(/\.$/, '');

  const contents = [];
  let sysText = '';

  for (const m of messages) {
    if (m.role === 'system') {
      sysText += (m.content || '') + '\n';
      continue;
    }
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts = [];
    if (Array.isArray(m.content)) {
      for (const item of m.content) {
        if (item.type === 'text') parts.push({ text: item.text });
        else if (item.type === 'image_url' && item.image_url?.url?.startsWith('data:')) {
          const [meta, b64] = item.image_url.url.split(',');
          const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
          parts.push({ inline_data: { mime_type: mime, data: b64 } });
        }
      }
    } else {
      parts.push({ text: String(m.content || '') });
    }
    if (parts.length) contents.push({ role, parts });
  }

  const payload = { contents };
  if (sysText.trim()) payload.systemInstruction = { parts: [{ text: sysText.trim() }] };

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cleanKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.abortCtrl?.signal,
      body: JSON.stringify(payload)
    });
    if (resp.ok) {
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (text && !isRefusalResponse(text)) return text.trim();
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Generation stopped.');
  }
  return null;
}

async function askMultimodalAI(messages, model = 'claude-3-7-sonnet', thinkingUI = null) {
  if (state.geminiKey && model === 'gemini-hybrid') {
    const geminiReply = await tryDirectGeminiAPI(messages, state.geminiKey);
    if (geminiReply) return geminiReply;
  }

  const lastMsg = messages[messages.length - 1];
  const hasVisionImage = Array.isArray(lastMsg?.content) && lastMsg.content.some(c => c.type === 'image_url');

  if (hasVisionImage) {
    const textPrompt = lastMsg.content.find(c => c.type === 'text')?.text || 'Analyze this image.';
    const imgData = lastMsg.content.find(c => c.type === 'image_url')?.image_url?.url;

    try {
      const resp = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [{ role: 'system', content: 'You are an expert visual assistant.' }, lastMsg]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply && !isRefusalResponse(reply)) return reply.trim();
      }
    } catch (e) {}

    if (typeof puter !== 'undefined' && puter.ai?.chat && imgData) {
      try {
        const pResp = await puter.ai.chat(textPrompt, imgData, { model: 'gpt-4o-mini' });
        const pText = typeof pResp === 'string' ? pResp : (pResp?.message?.content || '');
        if (pText && pText.trim()) return pText.trim();
      } catch (e) {}
    }
    return 'RAW candid DSLR photograph of a person in natural daylight';
  }

  if (typeof puter !== 'undefined' && puter.ai?.chat) {
    const pModel = ['claude-3-7-sonnet', 'claude-3-5-sonnet'].includes(model) ? 'claude-3-5-sonnet' : 'gpt-4o-mini';
    try {
      const pResp = await puter.ai.chat(messages, { model: pModel });
      const pText = typeof pResp === 'string' ? pResp : (pResp?.message?.content || '');
      if (pText && !isRefusalResponse(pText)) return pText.trim();
    } catch (e) {}
  }

  const mappedModel = ['gemini-hybrid', 'claude-3-7-sonnet', 'claude-3-5-sonnet', 'gpt-4o'].includes(model) ? 'openai' : model;
  const modelsToTry = [mappedModel, 'deepseek-r1', 'mistral', 'deepseek', 'qwen-coder', 'openai'];

  for (const mName of [...new Set(modelsToTry)]) {
    try {
      if (thinkingUI) thinkingUI.addStep(`Querying model node: ${mName}...`);
      const resp = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: state.abortCtrl?.signal,
        body: JSON.stringify({ model: mName, messages: messages, temperature: 0.7 })
      });
      if (resp.ok) {
        const data = await resp.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply && !isRefusalResponse(reply)) return reply.trim();
      }
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Generation stopped.');
    }
  }

  throw new Error('Network busy. Please check your internet connection.');
}

// ==================== PYODIDE REAL PYTHON 3.12 ENGINE ====================
async function ensurePyodideLoaded() {
  if (state.pyodide) return state.pyodide;
  if (state.pyodideLoading) {
    while (state.pyodideLoading) await new Promise(r => setTimeout(r, 200));
    return state.pyodide;
  }
  state.pyodideLoading = true;
  try {
    if (typeof loadPyodide === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    state.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/'
    });
    return state.pyodide;
  } finally {
    state.pyodideLoading = false;
  }
}

async function runPythonCodeInBrowser(codeString) {
  const py = await ensurePyodideLoaded();
  let stdout = [];
  let stderr = [];
  py.setStdout({ batched: (msg) => stdout.push(msg) });
  py.setStderr({ batched: (msg) => stderr.push(msg) });

  try {
    await py.loadPackagesFromImports(codeString);
    const result = await py.runPythonAsync(codeString);
    let out = stdout.join('\n');
    if (result !== undefined && result !== null && String(result) !== 'None') {
      out += (out ? '\n' : '') + String(result);
    }
    if (stderr.length) out += '\n[STDERR]:\n' + stderr.join('\n');
    return { ok: true, output: out.trim() || '[Executed successfully with 0 errors]' };
  } catch (err) {
    return { ok: false, output: (stdout.join('\n') + '\n' + String(err)).trim() };
  }
}

// ==================== TERMUX LINUX TERMINAL & OSINT ENGINE ====================
function printTermuxLine(text, cls = '') {
  if (!DOM.termuxOutput) return;
  const div = document.createElement('div');
  div.className = `term-line ${cls}`;
  div.textContent = text;
  DOM.termuxOutput.appendChild(div);
  DOM.termuxOutput.scrollTop = DOM.termuxOutput.scrollHeight;
}

function printTermuxBanner() {
  if (!DOM.termuxOutput) return;
  DOM.termuxOutput.innerHTML = '';
  printTermuxLine('====================================================================', 'term-info');
  printTermuxLine(' ✦ CHATGPT ULTRA - TERMUX & PYTHON 3.12 TERMINAL (WASM)', 'term-cmd');
  printTermuxLine(' Claude Sonnet Agent · Live Subdomain Recon · Pyodide Python', 'term-info');
  printTermuxLine('====================================================================', 'term-info');
  printTermuxLine("Type 'help' for commands, 'py <code>', 'recon <domain>', or 'agent <goal>'.\n");
}

async function runTermuxOsintRecon(targetDomain) {
  const domain = targetDomain.replace(/^https?:\/\//i, '').split('/')[0].trim();
  if (!domain) return printTermuxLine('Usage: recon <domain.com>', 'term-err');

  const log = [];
  const pushLog = (msg, cls = 'term-info') => {
    log.push(msg);
    printTermuxLine(msg, cls);
  };

  pushLog(`[*] Starting OSINT & Subdomain Recon on: ${domain}`, 'term-info');

  for (const rType of ['A', 'AAAA', 'MX', 'TXT', 'NS']) {
    try {
      const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${rType}`);
      if (r.ok) {
        const d = await r.json();
        const ans = (d.Answer || []).map(a => a.data).join(', ');
        if (ans) pushLog(`[+] DNS ${rType.padEnd(4)}: ${ans}`, 'term-cmd');
      }
    } catch (e) {}
  }

  pushLog(`[*] Querying crt.sh Certificate Transparency logs for *.${domain}...`, 'term-info');
  try {
    const crtResp = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`);
    if (crtResp.ok) {
      const crtData = await crtResp.json();
      const subs = [...new Set(crtData.map(e => e.name_value).join('\n').split('\n'))]
        .filter(s => s && !s.includes('*'))
        .slice(0, 25);
      pushLog(`[+] Found ${subs.length} unique subdomains (top 25):`, 'term-cmd');
      subs.forEach(s => pushLog(`    -> ${s}`, ''));
      state.vfs[`${domain}_subs.txt`] = subs.join('\n');
    }
  } catch (e) {
    pushLog(`[!] crt.sh timeout or rate-limited.`, 'term-warn');
  }
  return log.join('\n');
}

async function runAutonomousTerminalAgent(goal) {
  printTermuxLine(`🤖 [AUTO-AGENT] Goal: "${goal}"`, 'term-warn');
  const prompt = `You are an autonomous Python 3.12 terminal agent. Goal: "${goal}". Write a complete self-contained Python 3 script (standard library only) inside a \`\`\`python block.`;
  try {
    const aiResp = await askMultimodalAI([{ role: 'user', content: prompt }], state.currentModel);
    const codeMatch = aiResp.match(/```(?:python|py)?\s*([\s\S]*?)```/i);
    if (codeMatch && codeMatch[1]) {
      const pyCode = codeMatch[1].trim();
      state.vfs['agent_task.py'] = pyCode;
      printTermuxLine(`[+] Executing generated 'agent_task.py'...`, 'term-info');
      const res = await runPythonCodeInBrowser(pyCode);
      printTermuxLine(res.output, res.ok ? 'term-cmd' : 'term-err');
    } else {
      printTermuxLine(aiResp);
    }
  } catch (err) {
    printTermuxLine(`[!] Error: ${err.message}`, 'term-err');
  }
}

async function executeTermuxCommand(rawCmd) {
  const cmdLine = (rawCmd || '').trim();
  if (!cmdLine) return;
  printTermuxLine(`root@os:~# ${cmdLine}`, 'term-cmd');

  const [cmd, ...args] = cmdLine.split(' ');
  const rest = args.join(' ').trim();

  switch (cmd.toLowerCase()) {
    case 'help':
      printTermuxLine([
        'Commands:',
        '  py <code>          - Run Python 3.12 code',
        '  python <file.py>   - Execute Python file',
        '  pip install <pkg>  - Install Python package via Micropip',
        '  recon <domain>     - Live DNS + crt.sh Subdomain OSINT',
        '  headers <url>      - Inspect target response via proxy',
        '  audit <url/code>   - Run AI Security Vulnerability Audit',
        '  agent <goal>       - Autonomous AI writes & runs Python',
        '  ls / cat <f> / clear'
      ].join('\n'), 'term-info');
      break;
    case 'clear':
      DOM.termuxOutput.innerHTML = '';
      break;
    case 'ls':
      printTermuxLine(Object.keys(state.vfs).join('    ') || '(empty)');
      break;
    case 'cat':
      printTermuxLine(state.vfs[rest] || `cat: ${rest}: No such file`);
      break;
    case 'py':
      if (!rest) return printTermuxLine('Usage: py <python_code>', 'term-err');
      {
        const res = await runPythonCodeInBrowser(rest);
        printTermuxLine(res.output, res.ok ? '' : 'term-err');
      }
      break;
    case 'python':
    case 'python3':
      if (state.vfs[rest]) {
        const res = await runPythonCodeInBrowser(state.vfs[rest]);
        printTermuxLine(res.output, res.ok ? '' : 'term-err');
      } else if (rest) {
        const res = await runPythonCodeInBrowser(rest);
        printTermuxLine(res.output, res.ok ? '' : 'term-err');
      }
      break;
    case 'recon':
      await runTermuxOsintRecon(rest);
      break;
    case 'headers':
    case 'curl':
      if (!rest) return printTermuxLine('Usage: curl <url>', 'term-err');
      try {
        const target = rest.startsWith('http') ? rest : `https://${rest}`;
        const r = await fetch(`https://r.jina.ai/${target}`, { headers: { 'Accept': 'text/plain' } });
        const txt = await r.text();
        printTermuxLine(txt.substring(0, 1600));
      } catch (e) {
        printTermuxLine(e.message, 'term-err');
      }
      break;
    case 'audit':
      {
        const reply = await askMultimodalAI([{ role: 'user', content: `Perform a technical security vulnerability & bug bounty analysis on: ${rest}` }], state.currentModel);
        printTermuxLine(reply);
      }
      break;
    case 'agent':
      await runAutonomousTerminalAgent(rest);
      break;
    default:
      await runAutonomousTerminalAgent(cmdLine);
      break;
  }
}

function bindTermuxEvents() {
  const openTermux = () => {
    DOM.termuxModal?.classList.add('open');
    DOM.termuxInput?.focus();
  };
  on('headerTermuxBtn', 'click', openTermux);
  on('openTermuxQuickBtn', 'click', openTermux);
  on('openTermuxSidebarBtn', 'click', () => { closeSidebar(); openTermux(); });
  on('closeTermuxBtn', 'click', () => DOM.termuxModal?.classList.remove('open'));

  on('termuxSendBtn', 'click', () => {
    const val = DOM.termuxInput?.value.trim();
    if (!val) return;
    DOM.termuxInput.value = '';
    executeTermuxCommand(val);
  });

  on(DOM.termuxInput, 'keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('termuxSendBtn')?.click();
    }
  });

  document.querySelectorAll('.t-short').forEach(btn => {
    btn.addEventListener('click', () => {
      if (DOM.termuxInput) {
        DOM.termuxInput.value = btn.dataset.cmd;
        DOM.termuxInput.focus();
      }
    });
  });

  on('termClearBtn', 'click', () => { if (DOM.termuxOutput) DOM.termuxOutput.innerHTML = ''; });
  on('termRunPythonBtn', 'click', () => executeTermuxCommand('python recon.py'));
  on('termAutoAgentBtn', 'click', () => {
    const task = prompt('🤖 Autonomous Agent को क्या काम देना है?', 'Write a Python script to test SHA256 hashes and analyze web security headers');
    if (task) executeTermuxCommand(`agent ${task}`);
  });
}

// ==================== REALISTIC PHOTO GENERATOR HELPERS ====================
function sanitizeRealisticPhotoPrompt(rawText, fallbackRequest = '', styleMode = 'flux-realism') {
  let cleaned = (rawText || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^(create an? image of|generate an? image of|draw an? image of|here is|sure|prompt:)/gi, ' ')
    .replace(/[\u0900-\u097F]+/g, ' ')
    .replace(/[()[\]{}<>?*"'`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < 12) {
    cleaned = `Candid portrait, ${fallbackRequest || 'natural outdoor lighting'}`;
  }

  if (styleMode === 'flux-realism' && !/(anime|cartoon|pixar|sketch|3d)/i.test(cleaned)) {
    return `RAW candid smartphone photo, ${cleaned.substring(0, 210)}, realistic skin texture, natural daylight, shot on 35mm DSLR f/1.8`;
  }
  return cleaned.substring(0, 250);
}

async function craftSmartImagePrompt(userRequest, attachedBase64 = null, styleMode = 'flux-realism') {
  if (attachedBase64) {
    const visionMessages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Describe this photo (gender, pose, setting) and apply this edit: "${userRequest}". Output ONLY one English camera prompt line under 40 words.` },
          { type: 'image_url', image_url: { url: attachedBase64 } }
        ]
      }
    ];
    try {
      const rawVision = await askMultimodalAI(visionMessages, 'openai');
      return sanitizeRealisticPhotoPrompt(rawVision, userRequest, styleMode);
    } catch (e) {
      return sanitizeRealisticPhotoPrompt('', userRequest, styleMode);
    }
  } else {
    const translateMessages = [
      { role: 'system', content: 'Convert user request into a realistic English camera prompt under 38 words. Output ONLY the prompt.' },
      { role: 'user', content: userRequest }
    ];
    try {
      const rawTranslated = await askMultimodalAI(translateMessages, 'openai');
      return sanitizeRealisticPhotoPrompt(rawTranslated, userRequest, styleMode);
    } catch (e) {
      return sanitizeRealisticPhotoPrompt(userRequest, userRequest, styleMode);
    }
  }
}

function getRealisticImageUrl(englishPrompt, model = 'flux-realism', width = 768, height = 768, seed = null) {
  const activeSeed = seed || Math.floor(Math.random() * 9999999);
  const clean = sanitizeRealisticPhotoPrompt(englishPrompt, '', model);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?model=${model}&width=${width}&height=${height}&seed=${activeSeed}&nologo=true&enhance=false`;
}

function preloadImage(url, timeoutMs = 18000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { img.src = ''; reject(new Error('Timeout')); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(url); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Load failed')); };
    img.src = url;
  });
}

async function generateImageReliable(englishPrompt, preferredModel = 'flux-realism', width = 768, height = 768) {
  for (const m of [...new Set([preferredModel, 'flux-realism', 'flux', 'turbo'])]) {
    try {
      const url = getRealisticImageUrl(englishPrompt, m, width, height);
      return await preloadImage(url, 16000);
    } catch (e) {}
  }
  if (typeof puter !== 'undefined' && puter.ai?.txt2img) {
    const imgEl = await puter.ai.txt2img(englishPrompt);
    if (imgEl?.src) return imgEl.src;
  }
  throw new Error('Image server busy. Please try again.');
}

// ==================== LIVE NEWS & WEB SEARCH ====================
async function fetchGoogleNewsRSS(query = '') {
  const isGeneralNews = !query || /(aaj ki news|today news|latest news|samachar|khabar|taaza|breaking news|headline)/i.test(query);
  const rssUrls = isGeneralNews
    ? ['https://news.google.com/rss?hl=hi&gl=IN&ceid=IN:hi', 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en']
    : [`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=hi&gl=IN&ceid=IN:hi`];

  const headlines = [];
  for (const rssUrl of rssUrls) {
    try {
      const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
      if (r.ok) {
        const data = await r.json();
        (data?.items || []).slice(0, 7).forEach(item => {
          headlines.push(`• **${item.title}** - [पढ़ें](${item.link})`);
        });
      }
    } catch (e) {}
  }
  return headlines.join('\n');
}

async function runLiveWebSearch(query) {
  const results = [];
  const news = await fetchGoogleNewsRSS(query);
  if (news) results.push(`=== LIVE GOOGLE NEWS ===\n${news}`);
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`);
    if (r.ok) {
      const d = await r.json();
      const items = (d?.query?.search || []).slice(0, 3).map(s =>
        `• [${s.title}](https://en.wikipedia.org/wiki/${encodeURIComponent(s.title)}): ${s.snippet.replace(/<[^>]+>/g, '')}`
      );
      if (items.length) results.push(`=== WIKIPEDIA ===\n${items.join('\n')}`);
    }
  } catch (e) {}
  return results.join('\n\n');
}

// ==================== AUTO INTENT DETECTOR ====================
function detectUserIntent(text, hasAttachedImage) {
  const lower = text.toLowerCase();
  if (state.videoGenMode || /^(\/video|\/movie)\b/i.test(lower) || /(video bnao|video banao|movie bnao|movie banao|story video|वीडियो बनाओ|मूवी बनाओ)/i.test(lower)) {
    return 'generate_video';
  }
  if (state.imageGenMode || /^(\/image|\/img)\b/i.test(lower)) {
    return hasAttachedImage ? 'edit_uploaded_photo' : 'generate_new_image';
  }
  if (hasAttachedImage) {
    const editKeywords = /(edit|change|modify|convert|transform|make|turn|style|anime|background|bg|remove|add|wear|dress|kapde|saree|lehenga|suit|color|banao|badal|kar do|kardo|red|blue|green|black|gold|purple)/i;
    if (editKeywords.test(lower) || !text.trim()) return 'edit_uploaded_photo';
    return 'vision_qa';
  }
  if (/^recon\s+[a-z0-9.-]+\.[a-z]{2,}/i.test(lower)) {
    return 'direct_recon';
  }
  if (/(generate an? image|create an? image|draw an? |make a photo of|photo bnao|photo banao|image bnao|image banao|फोटो बनाओ|इमेज बनाओ)/i.test(lower)) {
    return 'generate_new_image';
  }
  return 'normal_chat';
}

// ==================== MAIN SEND FLOW ====================
async function sendMessage(overrideText = null, forceIntent = null, forcedDressColor = null) {
  let text = (overrideText !== null ? overrideText : (DOM.userInput?.value || '')).trim();
  const hasImage = !!state.attachedImageDataUrl;
  if ((!text && !hasImage) || state.busy) return;
  if (!state.activeChatId) createNewChat();

  const intent = forceIntent || detectUserIntent(text, hasImage);
  const currentImage = state.attachedImageDataUrl;
  clearAttachment();

  if (DOM.userInput) {
    DOM.userInput.value = '';
    DOM.userInput.style.height = 'auto';
  }
  if (state.imageGenMode) {
    state.imageGenMode = false;
    DOM.createImgModeBtn?.classList.remove('active');
  }
  if (state.videoGenMode) {
    state.videoGenMode = false;
    DOM.createVideoModeBtn?.classList.remove('active');
  }

  const userDisplay = text || (intent === 'edit_uploaded_photo' ? '👗 Edit photo with Face-Lock' : '👁️ Analyze this photo');
  state.conversation.push({ role: 'user', content: userDisplay, timestamp: Date.now() });
  appendUserMessage(userDisplay, currentImage);

  state.busy = true;
  state.stopFlag = false;
  state.abortCtrl = new AbortController();
  updateSendBtn(true);

  const aiBodyEl = appendAssistantPlaceholder();
  scrollToBottom();

  try {
    // ==================== 0. AI STORY & MOVIE VIDEO GENERATOR (NO API KEY) ====================
    if (intent === 'generate_video') {
      const cleanStory = text.replace(/^(\/video|\/movie)\s*/i, '').trim() || 'A futuristic cyber warrior exploring snow mountains in Himachal';
      const summaryMd = await generateStoryVideoNoKey(cleanStory, aiBodyEl);
      state.conversation.push({ role: 'assistant', content: summaryMd, timestamp: Date.now() });
    }
    // ==================== 1. DIRECT OSINT RECON ====================
    else if (intent === 'direct_recon') {
      const dom = text.replace(/^recon\s+/i, '').trim();
      aiBodyEl.innerHTML = `<span style="color:var(--text-muted)">💻 Running Termux Subdomain & DNS Recon on <b>${escapeHtml(dom)}</b>...</span>`;
      const reconOut = await runTermuxOsintRecon(dom);
      const md = `**💻 Live Termux OSINT Recon Output (\`${dom}\`):**\n\n\`\`\`text\n${reconOut}\n\`\`\``;
      renderFinalAssistantContent(aiBodyEl, md);
      state.conversation.push({ role: 'assistant', content: md, timestamp: Date.now() });
    }
    // ==================== 2. EDIT UPLOADED GALLERY PHOTO (FACE-LOCK) ====================
    else if (intent === 'edit_uploaded_photo' && currentImage) {
      const cleanReq = text.replace(/^(\/image|\/img)\s*/i, '') || 'Change dress color to Royal Red';
      aiBodyEl.innerHTML = `
        <div class="img-skeleton">
          <div class="loader-ring"></div>
          <span>🔒 Real Face-Lock Engine: असली चेहरा 100% लॉक रखकर आपकी फोटो एडिट हो रही है...</span>
        </div>`;
      scrollToBottom();

      const preparedImg = await fetchImageAsDataUrl(currentImage, 800);
      const cardsToRender = [];

      try {
        const colorKey = forcedDressColor || detectRequestedColorKey(cleanReq);
        const realFaceEditedUrl = await recolorRealPhotoDress(preparedImg, colorKey);
        const colorName = DRESS_COLOR_MAP[colorKey]?.label || 'Custom Shade';
        cardsToRender.push({
          badge: `🔒 100% Original Face (${colorName})`,
          url: realFaceEditedUrl,
          caption: `Exact Original Photo with Recolored Outfit`
        });
      } catch (e) {}

      try {
        const geminiEdited = await tryGeminiNativeImageEdit(cleanReq, preparedImg, state.geminiKey);
        if (geminiEdited) {
          cardsToRender.push({ badge: `✨ Gemini 2.0 Native Edit`, url: geminiEdited, caption: `Multimodal Edit` });
        } else {
          const styleMode = /(anime|ghibli)/i.test(cleanReq) ? 'flux-anime' : 'flux-realism';
          const smartPrompt = await craftSmartImagePrompt(cleanReq, preparedImg, styleMode);
          const rawAiUrl = await generateImageReliable(smartPrompt, styleMode, 768, 768);
          if (state.faceLockEnabled && styleMode === 'flux-realism') {
            const faceLockedCompositeUrl = await createFaceLockedComposite(preparedImg, rawAiUrl);
            cardsToRender.push({
              badge: `🧬 Face-Locked AI Outfit Composite`,
              url: faceLockedCompositeUrl,
              caption: `Your Real Face Blended onto AI Outfit`
            });
          } else {
            cardsToRender.push({ badge: `📸 AI Remake`, url: rawAiUrl, caption: smartPrompt });
          }
        }
      } catch (e) {}

      renderMultiImageCards(aiBodyEl, cardsToRender, preparedImg);
      state.conversation.push({
        role: 'assistant',
        content: `**[Face-Locked Photo Edited]**`,
        imageUrl: cardsToRender[0]?.url,
        imagePrompt: cleanReq,
        timestamp: Date.now()
      });
    }
    // ==================== 3. GENERATE NEW REALISTIC DSLR PHOTO ====================
    else if (intent === 'generate_new_image') {
      const cleanReq = text.replace(/^(\/image|\/img)\s*/i, '') || 'Candid DSLR portrait in Himachal mountains';
      aiBodyEl.innerHTML = `
        <div class="img-skeleton">
          <div class="loader-ring"></div>
          <span>📸 RAW DSLR Realism इंजन से असली जैसी फोटो जनरेट हो रही है...</span>
        </div>`;
      scrollToBottom();

      const styleMode = /(anime|ghibli)/i.test(cleanReq) ? 'flux-anime' : 'flux-realism';
      const smartPrompt = await craftSmartImagePrompt(cleanReq, null, styleMode);
      const url1 = await generateImageReliable(smartPrompt, styleMode, 768, 768);
      const cards = [{ badge: `📸 RAW DSLR Realism #1`, url: url1, caption: `Prompt: ${smartPrompt}` }];

      try {
        const url2 = getRealisticImageUrl(smartPrompt, styleMode, 768, 768, Math.floor(Math.random() * 999999));
        await preloadImage(url2, 11000);
        cards.push({ badge: `📸 RAW DSLR Realism #2`, url: url2, caption: `Variation 2` });
      } catch (e) {}

      renderMultiImageCards(aiBodyEl, cards, url1);
      state.conversation.push({
        role: 'assistant',
        content: `**[Generated Realistic Photo]**`,
        imageUrl: url1,
        imagePrompt: smartPrompt,
        timestamp: Date.now()
      });
    }
    // ==================== 4. VISION Q&A ====================
    else if (intent === 'vision_qa') {
      const thinkingUI = state.showThinking ? createThinkingProcessUI(aiBodyEl, userDisplay, state.currentModel) : null;
      const streamContainer = document.createElement('div');
      aiBodyEl.appendChild(streamContainer);

      const visionMessages = [
        { role: 'system', content: 'You are a helpful visual assistant. Answer directly in the user\'s language.' },
        { role: 'user', content: [{ type: 'text', text: userDisplay }, { type: 'image_url', image_url: { url: currentImage } }] }
      ];
      const answer = await streamMultimodalAI(visionMessages, state.currentModel, (partial) => {
        streamContainer.innerHTML = marked.parse(partial) + '<span class="stream-cursor"></span>';
        scrollToBottom();
      }, thinkingUI);

      if (thinkingUI) thinkingUI.finish();
      renderFinalAssistantContent(streamContainer, answer, true);
      state.conversation.push({ role: 'assistant', content: answer, timestamp: Date.now() });
      if (state.autoVoice) speakReply(answer);
    }
    // ==================== 5. NORMAL CHAT WITH LIVE THINKING & REAL-TIME STREAMING ====================
    else {
      let historyMsgs = [
        { role: 'system', content: state.systemPrompt },
        ...state.conversation.slice(-8).map(m => ({ role: m.role, content: m.content }))
      ];

      const thinkingUI = state.showThinking ? createThinkingProcessUI(aiBodyEl, text, state.currentModel) : null;
      const streamContainer = document.createElement('div');
      streamContainer.innerHTML = '<span class="stream-cursor"></span>';
      aiBodyEl.appendChild(streamContainer);

      const asksForLiveInfo = state.webSearchMode || /^\/web\b/i.test(text) || /(news|khabar|samachar|headline|aaj ki|taaza|latest|weather|mausam|score|ipl|2026)/i.test(text);
      if (asksForLiveInfo) {
        const q = text.replace(/^\/web\s*/i, '');
        if (thinkingUI) thinkingUI.addStep(`Fetching live Google News & web facts for "${q}"...`);
        const webData = await runLiveWebSearch(q);
        if (webData) {
          historyMsgs.push({
            role: 'system',
            content: `Today is ${new Date().toDateString()}. Summarize these REAL-TIME headlines in the user's language:\n\n${webData}`
          });
        }
      }

      const reply = await streamMultimodalAI(historyMsgs, state.currentModel, (partial) => {
        streamContainer.innerHTML = marked.parse(partial) + '<span class="stream-cursor"></span>';
        scrollToBottom();
      }, thinkingUI);

      if (thinkingUI) thinkingUI.finish();
      renderFinalAssistantContent(streamContainer, reply, true);
      state.conversation.push({ role: 'assistant', content: reply, timestamp: Date.now() });
      if (state.autoVoice) speakReply(reply);
    }
  } catch (err) {
    aiBodyEl.innerHTML = `<span style="color:var(--danger)">⚠️ ${escapeHtml(err.message)}</span>`;
  } finally {
    state.busy = false;
    state.abortCtrl = null;
    updateSendBtn(false);
    saveActiveChat();
    renderSidebarList();
    scrollToBottom();
  }
}

// ==================== MULTI-CARD IMAGE RENDERER ====================
function renderMultiImageCards(aiBodyEl, cards, originalSourceUrl = null) {
  if (!aiBodyEl) return;
  aiBodyEl.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'dual-photo-grid';

  cards.forEach(item => {
    const card = document.createElement('div');
    card.className = 'ai-image-card';

    const header = document.createElement('div');
    header.className = 'card-badge-header';
    header.textContent = item.badge || '📸 Edited Photo';

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = 'Edited Photo';
    img.loading = 'lazy';

    const cap = document.createElement('div');
    cap.className = 'ai-image-caption';
    cap.textContent = item.caption || '';

    card.append(header, img, cap);
    grid.appendChild(card);
  });

  aiBodyEl.appendChild(grid);

  const primaryUrl = cards[0]?.url || originalSourceUrl;
  const baseForNextEdit = originalSourceUrl || primaryUrl;

  const tools = document.createElement('div');
  tools.className = 'msg-tools';

  const quickColors = [
    { key: 'red', label: '🔴 Red' },
    { key: 'blue', label: '🔵 Blue' },
    { key: 'green', label: '🟢 Green' },
    { key: 'gold', label: '🟡 Gold' },
    { key: 'purple', label: '🟣 Purple' },
    { key: 'black', label: '⚫ Black' }
  ];

  quickColors.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'msg-tool-btn';
    btn.textContent = c.label;
    btn.onclick = () => {
      state.attachedImageDataUrl = baseForNextEdit;
      sendMessage(`Change dress color to ${c.label}`, 'edit_uploaded_photo', c.key);
    };
    tools.appendChild(btn);
  });

  const studioBtn = document.createElement('button');
  studioBtn.className = 'msg-tool-btn';
  studioBtn.innerHTML = '🖌️ Studio';
  studioBtn.onclick = () => openStudioWithImage(baseForNextEdit);

  const dlBtn = document.createElement('a');
  dlBtn.className = 'msg-tool-btn';
  dlBtn.href = primaryUrl;
  dlBtn.download = `photo-${Date.now()}.jpg`;
  dlBtn.target = '_blank';
  dlBtn.innerHTML = '📥 Save';

  tools.append(studioBtn, dlBtn);
  aiBodyEl.appendChild(tools);
}

// ==================== WELCOME SCREEN & CHAT RENDERERS ====================
function showWelcomeScreen() {
  if (!DOM.chatInner) return;
  DOM.chatInner.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-logo">✦</div>
      <h1>What can I help with?</h1>
      <p>Claude 3.7 Sonnet Base · Real-Time Thinking · Free AI Movie & Video Maker · Termux OS</p>
      <div class="starter-grid">
        <div class="starter-card" data-action="make-video">
          <strong>🎬 AI Story & Movie Generator (No Key)</strong>
          <span>बिना API Key के लाइव प्रोग्रेस बार, आवाज़ और सबटाइटल के साथ मूवी बनाएं</span>
        </div>
        <div class="starter-card" data-action="upload-photo">
          <strong>👗 Face-Lock Dress Changer</strong>
          <span>अपनी फोटो अपलोड करें—असली चेहरा बदले बिना ड्रेस बदलें</span>
        </div>
        <div class="starter-card" data-prompt="Write a Python script to test SHA-256 hashes, check password entropy, and simulate a security audit, and run it automatically.">
          <strong>🐍 Auto-Run Python & Thinking</strong>
          <span>Claude Sonnet की लाइव थिंकिंग देखें और चैट में Python कोड रन करें</span>
        </div>
        <div class="starter-card" data-action="open-termux">
          <strong>💻 Termux Linux + Subdomain Recon</strong>
          <span>ब्राउज़र में असली Python 3.12 और OSINT टर्मिनल चलाएं</span>
        </div>
      </div>
    </div>`;

  DOM.chatInner.querySelectorAll('.starter-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.action === 'make-video') {
        const idea = prompt('🎬 किस कहानी या टॉपिक पर AI Movie / Video बनानी है?', 'एक साइबर हैकर और रोबोट की रोमांचक कहानी जो हिमालय के बर्फीले पहाड़ों में एक सीक्रेट मिशन पर हैं');
        if (idea) sendMessage(idea, 'generate_video');
      } else if (card.dataset.action === 'upload-photo') {
        DOM.chatImageUpload?.click();
      } else if (card.dataset.action === 'open-termux') {
        DOM.termuxModal?.classList.add('open');
      } else if (card.dataset.prompt) {
        sendMessage(card.dataset.prompt);
      }
    });
  });
}

function appendUserMessage(text, imageUrl = null) {
  document.querySelector('.welcome-screen')?.remove();
  const row = document.createElement('div');
  row.className = 'msg-row user';
  const pill = document.createElement('div');
  pill.className = 'user-pill';
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Uploaded';
    pill.appendChild(img);
  }
  const span = document.createElement('span');
  span.textContent = text;
  pill.appendChild(span);
  row.appendChild(pill);
  DOM.chatInner?.appendChild(row);
}

function appendAssistantPlaceholder() {
  document.querySelector('.welcome-screen')?.remove();
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `<div class="ai-avatar">✦</div><div class="ai-body"></div>`;
  DOM.chatInner?.appendChild(row);
  return row.querySelector('.ai-body');
}

function renderFinalAssistantContent(targetEl, markdownText, isFreshMessage = false) {
  if (!targetEl) return;
  targetEl.innerHTML = marked.parse(markdownText || '');

  if (typeof hljs !== 'undefined') {
    targetEl.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch (e) {} });
  }

  let autoRanFirstPy = false;

  targetEl.querySelectorAll('pre').forEach(pre => {
    const codeEl = pre.querySelector('code');
    const raw = codeEl ? codeEl.textContent : pre.textContent;
    const langClass = codeEl ? [...codeEl.classList].find(c => c.startsWith('language-')) : '';
    const lang = (langClass ? langClass.replace('language-', '') : 'code').toLowerCase();

    const box = document.createElement('div');
    box.className = 'code-box';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    bar.innerHTML = `<span>${escapeHtml(lang.toUpperCase())}</span><div class="code-bar-btns"></div>`;
    const btnGroup = bar.querySelector('.code-bar-btns');

    const outputDiv = document.createElement('div');
    outputDiv.className = 'inline-exec-output';
    outputDiv.style.display = 'none';

    const executePyInline = async () => {
      outputDiv.style.display = 'block';
      outputDiv.style.color = '#9b9b9b';
      outputDiv.textContent = '🐍 Executing in Pyodide Python 3.12...';
      const res = await runPythonCodeInBrowser(raw);
      outputDiv.textContent = `root@python:~# python3 script.py\n${res.output}`;
      outputDiv.style.color = res.ok ? '#10a37f' : '#ef4444';

      if (!res.ok && !btnGroup.querySelector('.fix')) {
        const fixBtn = document.createElement('button');
        fixBtn.className = 'code-btn fix';
        fixBtn.textContent = '🔧 Auto-Fix Bug';
        fixBtn.onclick = () => {
          sendMessage(`Fix this Python error and provide the corrected runnable code:\nError:\n\`\`\`\n${res.output}\n\`\`\`\nCode:\n\`\`\`python\n${raw}\n\`\`\``);
        };
        btnGroup.prepend(fixBtn);
      }
      scrollToBottom();
    };

    const isPythonBlock = ['python', 'py'].includes(lang) || (!['html', 'js', 'javascript', 'css', 'bash', 'sh'].includes(lang) && (raw.includes('import ') || raw.includes('def ') || raw.includes('print(')));

    if (isPythonBlock) {
      const pyBtn = document.createElement('button');
      pyBtn.className = 'code-btn run';
      pyBtn.textContent = '🐍 Run Python';
      pyBtn.onclick = executePyInline;
      btnGroup.appendChild(pyBtn);

      if (isFreshMessage && state.autoRunPython && !autoRanFirstPy && !raw.includes('input(') && !raw.includes('socket.')) {
        autoRanFirstPy = true;
        setTimeout(executePyInline, 300);
      }
    }

    if (['html', 'xml', 'javascript', 'js'].includes(lang) || raw.includes('<html')) {
      const runBtn = document.createElement('button');
      runBtn.className = 'code-btn run';
      runBtn.textContent = '▶ Run Web App';
      runBtn.onclick = () => openCodeSandbox(raw);
      btnGroup.appendChild(runBtn);
    }

    const termBtn = document.createElement('button');
    termBtn.className = 'code-btn';
    termBtn.textContent = '>_ Termux';
    termBtn.onclick = () => {
      const ext = isPythonBlock ? 'py' : 'sh';
      const fName = `script_${Date.now().toString().slice(-4)}.${ext}`;
      state.vfs[fName] = raw;
      DOM.termuxModal?.classList.add('open');
      printTermuxLine(`[+] Saved chat code to '${fName}'. Running...`, 'term-info');
      if (ext === 'py') executeTermuxCommand(`python ${fName}`);
    };
    btnGroup.appendChild(termBtn);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-btn';
    copyBtn.textContent = '📋 Copy';
    copyBtn.onclick = () => { navigator.clipboard.writeText(raw); toast('Copied!'); };
    btnGroup.appendChild(copyBtn);

    pre.parentNode.insertBefore(box, pre);
    box.appendChild(bar);
    box.appendChild(pre);
    box.appendChild(outputDiv);
  });

  const tools = document.createElement('div');
  tools.className = 'msg-tools';

  const speakBtn = document.createElement('button');
  speakBtn.className = 'msg-tool-btn';
  speakBtn.innerHTML = '🔊 Listen';
  speakBtn.onclick = () => speakReply(markdownText);

  const copyMsgBtn = document.createElement('button');
  copyMsgBtn.className = 'msg-tool-btn';
  copyMsgBtn.innerHTML = '📋 Copy';
  copyMsgBtn.onclick = () => { navigator.clipboard.writeText(markdownText); toast('Copied!'); };

  tools.append(speakBtn, copyMsgBtn);
  targetEl.appendChild(tools);
}

// ==================== STUDIO & INPAINT BRUSH ENGINE ====================
function drawEmptyStudioCanvas() {
  if (!DOM.editorCanvas) return;
  const ctx = DOM.editorCanvas.getContext('2d');
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, DOM.editorCanvas.width, DOM.editorCanvas.height);
  ctx.fillStyle = '#888';
  ctx.font = '17px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📂 Upload Photo -> Tap Dress or Use 🖌️ Mask Brush', DOM.editorCanvas.width / 2, DOM.editorCanvas.height / 2);
}

function clearStudioMask() {
  if (!DOM.maskCanvas) return;
  const mCtx = DOM.maskCanvas.getContext('2d');
  mCtx.clearRect(0, 0, DOM.maskCanvas.width, DOM.maskCanvas.height);
  state.editor.hasMaskStrokes = false;
}

function openStudioWithImage(url = null, promptText = '') {
  DOM.studioModal?.classList.add('open');
  if (promptText && DOM.studioPromptInput) DOM.studioPromptInput.value = promptText;
  if (url) loadStudioImage(url, true);
}

async function loadStudioImage(url, saveAsOriginal = false) {
  if (DOM.studioLoading) DOM.studioLoading.style.display = 'flex';
  try {
    const safeDataUrl = await fetchImageAsDataUrl(url, 900);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (saveAsOriginal || !state.editor.originalImage) {
        state.editor.originalImage = img;
        state.editor.sampledHue = null;
        clearStudioMask();
      }
      state.editor.baseImage = img;
      resetStudioFilters(false);
      renderStudioCanvas();
      if (DOM.studioLoading) DOM.studioLoading.style.display = 'none';
    };
    img.onerror = () => {
      if (DOM.studioLoading) DOM.studioLoading.style.display = 'none';
      toast('Could not load image');
    };
    img.src = safeDataUrl;
  } catch (e) {
    if (DOM.studioLoading) DOM.studioLoading.style.display = 'none';
  }
}

function resetStudioFilters(redraw = true) {
  state.editor.rotation = 0;
  state.editor.flipH = 1;
  state.editor.flipV = 1;
  state.editor.filters = { brightness: 100, contrast: 100, saturation: 100, sepia: 0 };
  state.editor.texts = [];
  ['Brightness', 'Contrast', 'Saturation'].forEach(k => {
    const el = document.getElementById('filter' + k);
    if (el) el.value = 100;
  });
  const sep = document.getElementById('filterSepia');
  if (sep) sep.value = 0;
  if (redraw) renderStudioCanvas();
}

function renderStudioCanvas() {
  const img = state.editor.baseImage;
  if (!img || !DOM.editorCanvas) return;
  const c = DOM.editorCanvas;
  const ctx = c.getContext('2d');
  const rot90 = Math.abs(state.editor.rotation) % 180 === 90;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  c.width = rot90 ? h : w;
  c.height = rot90 ? w : h;

  if (DOM.maskCanvas && (DOM.maskCanvas.width !== c.width || DOM.maskCanvas.height !== c.height)) {
    DOM.maskCanvas.width = c.width;
    DOM.maskCanvas.height = c.height;
  }

  const f = state.editor.filters;
  ctx.save();
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) sepia(${f.sepia}%)`;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((state.editor.rotation * Math.PI) / 180);
  ctx.scale(state.editor.flipH, state.editor.flipV);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  state.editor.texts.forEach(t => {
    ctx.save();
    const sz = Math.max(24, Math.round(c.width * 0.055));
    ctx.font = `700 ${sz}px Inter, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(3, Math.round(sz / 9));
    ctx.textAlign = 'center';
    ctx.strokeText(t.text, c.width / 2, t.y);
    ctx.fillText(t.text, c.width / 2, t.y);
    ctx.restore();
  });
}

async function applyStudioRealDressRecolor(colorSpec) {
  const srcImg = state.editor.originalImage || state.editor.baseImage;
  if (!srcImg) return toast('पहले 📂 Upload से अपनी फोटो चुनें!');
  state.editor.lastTargetColor = colorSpec;
  const tol = parseInt(document.getElementById('dressToleranceSlider')?.value || '48', 10);
  const newUrl = await recolorRealPhotoDress(srcImg, colorSpec, state.editor.sampledHue, tol, DOM.maskCanvas);
  loadStudioImage(newUrl, false);
  toast('🔒 Real Face Locked · Dress Updated!');
}

function bindStudioEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab)?.classList.add('active');
    });
  });

  const maskBtn = document.getElementById('toggleMaskBrushBtn');
  on(maskBtn, 'click', () => {
    state.editor.maskBrushActive = !state.editor.maskBrushActive;
    DOM.maskCanvas?.classList.toggle('active-drawing', state.editor.maskBrushActive);
    maskBtn?.classList.toggle('active-brush', state.editor.maskBrushActive);
    if (maskBtn) maskBtn.textContent = state.editor.maskBrushActive ? '🖌️ Mask Brush: ON' : '🖌️ Mask Brush: OFF';
  });

  on('clearMaskBtn', 'click', () => { clearStudioMask(); toast('Mask cleared'); });

  const getCanvasPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const paintMaskStroke = (e) => {
    if (!state.editor.isDrawingMask || !DOM.maskCanvas) return;
    e.preventDefault();
    const pt = getCanvasPoint(e, DOM.maskCanvas);
    const ctx = DOM.maskCanvas.getContext('2d');
    const bSize = parseInt(document.getElementById('maskBrushSize')?.value || '45', 10);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, bSize, 0, Math.PI * 2);
    ctx.fill();
    state.editor.hasMaskStrokes = true;
  };

  if (DOM.maskCanvas) {
    DOM.maskCanvas.addEventListener('mousedown', e => { state.editor.isDrawingMask = true; paintMaskStroke(e); });
    DOM.maskCanvas.addEventListener('mousemove', paintMaskStroke);
    window.addEventListener('mouseup', () => { state.editor.isDrawingMask = false; });
    DOM.maskCanvas.addEventListener('touchstart', e => { state.editor.isDrawingMask = true; paintMaskStroke(e); }, { passive: false });
    DOM.maskCanvas.addEventListener('touchmove', paintMaskStroke, { passive: false });
    window.addEventListener('touchend', () => { state.editor.isDrawingMask = false; });
  }

  on(DOM.editorCanvas, 'click', async e => {
    if (state.editor.maskBrushActive || !state.editor.originalImage || !DOM.editorCanvas) return;
    const pt = getCanvasPoint(e, DOM.editorCanvas);
    const tempC = document.createElement('canvas');
    const orig = state.editor.originalImage;
    tempC.width = orig.naturalWidth || orig.width;
    tempC.height = orig.naturalHeight || orig.height;
    const tCtx = tempC.getContext('2d');
    tCtx.drawImage(orig, 0, 0);
    const pixel = tCtx.getImageData(Math.min(pt.x, tempC.width - 1), Math.min(pt.y, tempC.height - 1), 1, 1).data;
    const [h] = rgbToHsl(pixel[0], pixel[1], pixel[2]);
    state.editor.sampledHue = h;
    await applyStudioRealDressRecolor(state.editor.lastTargetColor || 'red');
  });

  document.querySelectorAll('.dress-color-btn').forEach(btn => {
    btn.addEventListener('click', () => applyStudioRealDressRecolor(btn.dataset.color));
  });

  on('applyCustomDressColorBtn', 'click', () => {
    const hex = document.getElementById('customDressColorPicker')?.value || '#e11d48';
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const [h, s] = rgbToHsl(r, g, b);
    applyStudioRealDressRecolor({ h, s: Math.max(0.5, s), lScale: 0.90 });
  });

  on('dressToleranceSlider', 'change', () => {
    if (state.editor.originalImage) applyStudioRealDressRecolor(state.editor.lastTargetColor || 'red');
  });

  on('undoStudioBtn', 'click', () => {
    if (state.editor.originalImage) {
      state.editor.baseImage = state.editor.originalImage;
      clearStudioMask();
      resetStudioFilters(true);
    }
  });

  on('headerStudioBtn', 'click', () => openStudioWithImage());
  on('openStudioQuickBtn', 'click', () => openStudioWithImage());
  on('openStudioSidebarBtn', 'click', () => { closeSidebar(); openStudioWithImage(); });
  on('closeStudioBtn', 'click', () => DOM.studioModal?.classList.remove('open'));

  on('triggerUploadBtn', 'click', () => DOM.uploadImageInput?.click());
  on(DOM.uploadImageInput, 'change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressGalleryImage(file, 900);
    loadStudioImage(compressed, true);
  });

  on('studioFaceLockEditBtn', 'click', async () => {
    const req = DOM.studioPromptInput?.value.trim();
    if (!req) return toast('Write what outfit or background you want first!');
    const engine = DOM.studioEngineSelect?.value || 'flux-realism';
    if (DOM.studioLoading) DOM.studioLoading.style.display = 'flex';
    try {
      const origCanvasUrl = state.editor.originalImage
        ? await fetchImageAsDataUrl(state.editor.originalImage.src, 800)
        : null;
      const smart = await craftSmartImagePrompt(req, origCanvasUrl, engine);
      const aiUrl = await generateImageReliable(smart, engine, 768, 768);
      if (origCanvasUrl) {
        const compositeUrl = await createFaceLockedComposite(origCanvasUrl, aiUrl, DOM.maskCanvas);
        loadStudioImage(compositeUrl, false);
      } else {
        loadStudioImage(aiUrl, true);
      }
    } catch (e) {
      if (DOM.studioLoading) DOM.studioLoading.style.display = 'none';
      toast(e.message);
    }
  });

  on('studioGenerateBtn', 'click', async () => {
    const p = DOM.studioPromptInput?.value.trim();
    if (!p) return toast('Write a prompt first!');
    const engine = DOM.studioEngineSelect?.value || 'flux-realism';
    if (DOM.studioLoading) DOM.studioLoading.style.display = 'flex';
    try {
      const eng = await craftSmartImagePrompt(p, null, engine);
      const url = await generateImageReliable(eng, engine, 768, 768);
      loadStudioImage(url, true);
    } catch (e) {
      if (DOM.studioLoading) DOM.studioLoading.style.display = 'none';
      toast(e.message);
    }
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (DOM.studioPromptInput) DOM.studioPromptInput.value = btn.dataset.prompt;
      document.getElementById('studioFaceLockEditBtn')?.click();
    });
  });

  const sMap = {
    filterBrightness: 'brightness', filterContrast: 'contrast',
    filterSaturation: 'saturation', filterSepia: 'sepia'
  };
  Object.entries(sMap).forEach(([id, key]) => {
    on(id, 'input', e => {
      state.editor.filters[key] = parseFloat(e.target.value);
      renderStudioCanvas();
    });
  });

  on('rotateImgBtn', 'click', () => { state.editor.rotation = (state.editor.rotation + 90) % 360; renderStudioCanvas(); });
  on('flipHImgBtn', 'click', () => { state.editor.flipH *= -1; renderStudioCanvas(); });
  on('resetFiltersBtn', 'click', () => resetStudioFilters(true));

  on('addTextOverlayBtn', 'click', () => {
    const inp = document.getElementById('overlayTextInput');
    const col = document.getElementById('overlayColorInput')?.value || '#ffffff';
    if (!inp?.value.trim() || !state.editor.baseImage) return;
    const y = state.editor.texts.length === 0 ? DOM.editorCanvas.height - 40 : 60 * (state.editor.texts.length + 1);
    state.editor.texts.push({ text: inp.value.trim(), color: col, y });
    inp.value = '';
    renderStudioCanvas();
  });

  on('downloadStudioImgBtn', 'click', () => {
    if (!state.editor.baseImage || !DOM.editorCanvas) return;
    const a = document.createElement('a');
    a.href = DOM.editorCanvas.toDataURL('image/jpeg', 0.92);
    a.download = `studio-${Date.now()}.jpg`;
    a.click();
  });

  on('sendToChatStudioBtn', 'click', () => {
    if (!state.editor.baseImage || !DOM.editorCanvas) return;
    if (!state.activeChatId) createNewChat();
    const dataUrl = DOM.editorCanvas.toDataURL('image/jpeg', 0.9);
    const bodyEl = appendAssistantPlaceholder();
    renderMultiImageCards(bodyEl, [{ badge: '✅ Studio Edited Photo', url: dataUrl, caption: 'Edited in Studio' }], dataUrl);
    state.conversation.push({ role: 'assistant', content: 'Studio Edited Photo', imageUrl: dataUrl, timestamp: Date.now() });
    saveActiveChat();
    DOM.studioModal?.classList.remove('open');
    scrollToBottom();
  });
}

// ==================== STORAGE & SIDEBAR ====================
function loadStorage() {
  try {
    const raw = localStorage.getItem('chatgpt_ultra_v10');
    if (raw) {
      const d = JSON.parse(raw);
      state.conversations = d.conversations || {};
      state.activeChatId = d.activeChatId || null;
      state.systemPrompt = d.systemPrompt || DEFAULT_PROMPT;
      state.currentModel = d.model || 'claude-3-7-sonnet';
      state.geminiKey = d.geminiKey || getDefaultKey();
      state.showThinking = d.showThinking !== false;
      state.faceLockEnabled = d.faceLockEnabled !== false;
      state.autoRunPython = d.autoRunPython !== false;
    }
  } catch (e) {}

  if (DOM.geminiKeyInput) DOM.geminiKeyInput.value = state.geminiKey;
  if (DOM.systemPromptInput) DOM.systemPromptInput.value = state.systemPrompt;
  if (DOM.modelSelect) DOM.modelSelect.value = state.currentModel;
  if (DOM.showThinkingCheck) DOM.showThinkingCheck.checked = state.showThinking;
  if (DOM.faceLockCheck) DOM.faceLockCheck.checked = state.faceLockEnabled;
  if (DOM.autoRunPyCheck) DOM.autoRunPyCheck.checked = state.autoRunPython;

  if (state.activeChatId && state.conversations[state.activeChatId]) {
    switchChat(state.activeChatId);
  } else {
    renderSidebarList();
    showWelcomeScreen();
  }
}

function saveStorage() {
  try {
    localStorage.setItem('chatgpt_ultra_v10', JSON.stringify({
      conversations: state.conversations,
      activeChatId: state.activeChatId,
      systemPrompt: state.systemPrompt,
      model: state.currentModel,
      geminiKey: state.geminiKey,
      showThinking: state.showThinking,
      faceLockEnabled: state.faceLockEnabled,
      autoRunPython: state.autoRunPython
    }));
  } catch (e) {}
}

function createNewChat() {
  saveActiveChat();
  const id = 'c_' + Date.now();
  state.conversations[id] = { id, title: 'New chat', messages: [], timestamp: Date.now() };
  state.activeChatId = id;
  state.conversation = [];
  saveStorage();
  renderSidebarList();
  showWelcomeScreen();
  closeSidebar();
}

function switchChat(id) {
  if (!state.conversations[id]) return;
  saveActiveChat();
  state.activeChatId = id;
  state.conversation = [...state.conversations[id].messages];
  if (DOM.chatInner) DOM.chatInner.innerHTML = '';
  if (state.conversation.length === 0) {
    showWelcomeScreen();
  } else {
    state.conversation.forEach(m => {
      if (m.role === 'user') appendUserMessage(m.content);
      else {
        const b = appendAssistantPlaceholder();
        if (m.imageUrl) renderMultiImageCards(b, [{ badge: '📸 Saved Photo', url: m.imageUrl, caption: m.imagePrompt || '' }], m.imageUrl);
        else renderFinalAssistantContent(b, m.content, false);
      }
    });
    scrollToBottom();
  }
  renderSidebarList();
  closeSidebar();
}

function saveActiveChat() {
  if (state.activeChatId && state.conversations[state.activeChatId] && state.conversation.length > 0) {
    state.conversations[state.activeChatId].messages = [...state.conversation];
    state.conversations[state.activeChatId].timestamp = Date.now();
    if (state.conversations[state.activeChatId].title === 'New chat') {
      const first = state.conversation.find(m => m.role === 'user');
      if (first) state.conversations[state.activeChatId].title = first.content.substring(0, 34);
    }
    saveStorage();
  }
}

function renderSidebarList() {
  if (!DOM.chatList) return;
  const list = Object.values(state.conversations).sort((a, b) => b.timestamp - a.timestamp);
  if (!list.length) {
    DOM.chatList.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--text-muted)">No recent chats</div>`;
    return;
  }
  DOM.chatList.innerHTML = list.map(c => `
    <div class="chat-item ${c.id === state.activeChatId ? 'active' : ''}" data-id="${c.id}">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escapeHtml(c.title)}</span>
      <button class="del-chat" data-id="${c.id}">✕</button>
    </div>`).join('');

  DOM.chatList.querySelectorAll('.chat-item').forEach(el => {
    el.onclick = e => { if (!e.target.classList.contains('del-chat')) switchChat(el.dataset.id); };
  });
  DOM.chatList.querySelectorAll('.del-chat').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      delete state.conversations[btn.dataset.id];
      if (state.activeChatId === btn.dataset.id) { state.activeChatId = null; state.conversation = []; showWelcomeScreen(); }
      saveStorage();
      renderSidebarList();
    };
  });
}

// ==================== EVENTS & HELPERS ====================
function clearAttachment() {
  state.attachedImageDataUrl = null;
  if (DOM.chatImageUpload) DOM.chatImageUpload.value = '';
  if (DOM.attachmentBar) DOM.attachmentBar.style.display = 'none';
}

function openCodeSandbox(code = '') {
  if (code && DOM.sandboxCodeEditor) DOM.sandboxCodeEditor.value = code;
  else if (DOM.sandboxCodeEditor && !DOM.sandboxCodeEditor.value.trim()) {
    DOM.sandboxCodeEditor.value = `<!DOCTYPE html>\n<html>\n<body style="background:#212121;color:#ececec;font-family:sans-serif;text-align:center;padding-top:20%">\n  <h1>✦ Live Web App Sandbox</h1>\n</body>\n</html>`;
  }
  DOM.sandboxModal?.classList.add('open');
  if (DOM.sandboxFrame && DOM.sandboxCodeEditor) DOM.sandboxFrame.srcdoc = DOM.sandboxCodeEditor.value;
}

function speakReply(text) {
  if (!state.speechSynth) return;
  state.speechSynth.cancel();
  const clean = (text || '').replace(/```[\s\S]*?```/g, '').replace(/[#*`_~>\[\]\(\)]/g, ' ').trim().substring(0, 1000);
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = /[\u0900-\u097F]/.test(clean) ? 'hi-IN' : 'en-IN';
  state.speechSynth.speak(u);
}

function openSidebar() { DOM.sidebar?.classList.add('open'); DOM.sidebarOverlay?.classList.add('open'); }
function closeSidebar() { DOM.sidebar?.classList.remove('open'); DOM.sidebarOverlay?.classList.remove('open'); }
function updateSendBtn(busy) {
  if (!DOM.sendBtn) return;
  DOM.sendBtn.classList.toggle('stop-mode', busy);
  DOM.sendBtn.textContent = busy ? '■' : '↑';
}
function scrollToBottom() { if (DOM.chatContainer) DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight; }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function toast(msg) {
  if (!DOM.toastContainer) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  DOM.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
function updateThemeLabel() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const icon = document.getElementById('themeIcon');
  const txt = document.getElementById('themeText');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (txt) txt.textContent = isDark ? 'Light mode' : 'Dark mode';
}

function bindEvents() {
  on(DOM.userInput, 'input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  on(DOM.userInput, 'keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      sendMessage();
    }
  });

  on(DOM.sendBtn, 'click', () => {
    if (state.busy) {
      state.stopFlag = true;
      state.abortCtrl?.abort();
      state.busy = false;
      updateSendBtn(false);
    } else {
      sendMessage();
    }
  });

  // Video Mode Triggers
  const toggleVideoMode = () => {
    state.videoGenMode = !state.videoGenMode;
    if (state.videoGenMode) state.imageGenMode = false;
    DOM.createVideoModeBtn?.classList.toggle('active', state.videoGenMode);
    DOM.createImgModeBtn?.classList.remove('active');
    if (DOM.userInput) {
      DOM.userInput.placeholder = state.videoGenMode
        ? '🎬 किस कहानी या सीन पर AI Movie / Video बनानी है? लिखें...'
        : 'Message ChatGPT...';
      DOM.userInput.focus();
    }
  };
  on(DOM.createVideoModeBtn, 'click', toggleVideoMode);
  on('headerVideoBtn', 'click', toggleVideoMode);
  on('videoGenSidebarBtn', 'click', () => {
    closeSidebar();
    const story = prompt('🎬 किस कहानी या टॉपिक पर AI Movie / Video बनानी है?', 'एक रहस्यमयी जासूस की कहानी जो रात की बारिश में साइबर सिटी में एक बड़ा राज़ खोजता है');
    if (story) sendMessage(story, 'generate_video');
  });

  on('attachImgBtn', 'click', () => DOM.chatImageUpload?.click());
  on('uploadPhotoSidebarBtn', 'click', () => { closeSidebar(); DOM.chatImageUpload?.click(); });

  on(DOM.chatImageUpload, 'change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('🔒 Real Face Locked! Pick a dress color or type below.');
      state.attachedImageDataUrl = await compressGalleryImage(file, 800);
      if (DOM.attachedImgThumb) DOM.attachedImgThumb.src = state.attachedImageDataUrl;
      if (DOM.attachmentBar) DOM.attachmentBar.style.display = 'flex';
      DOM.userInput?.focus();
    } catch (err) {
      toast('Error loading photo');
    }
  });

  on('removeAttachmentBtn', 'click', clearAttachment);

  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const colorKey = btn.dataset.color || 'red';
      const label = DRESS_COLOR_MAP[colorKey]?.label || colorKey;
      sendMessage(`Change dress to ${label}`, 'edit_uploaded_photo', colorKey);
    });
  });

  on('customOutfitBtn', 'click', () => {
    const custom = prompt('👗 कौन सा नया आउटफिट पहनाना है? (असली चेहरा लॉक रहेगा):', 'Royal red and gold embroidered bridal lehenga');
    if (custom) sendMessage(`Change outfit to ${custom}`, 'edit_uploaded_photo');
  });

  on('bgChangeBtn', 'click', () => {
    const bgChoice = prompt('🏔️ बैकग्राउंड में क्या लगाना है?', 'Snow-covered Himachal mountains at sunset');
    if (bgChoice) sendMessage(`Keep the person identical and change the background to ${bgChoice}`, 'edit_uploaded_photo');
  });

  on('studioAttachedBtn', 'click', () => {
    const img = state.attachedImageDataUrl;
    clearAttachment();
    openStudioWithImage(img);
  });

  on('autoAgentQuickBtn', 'click', () => {
    const goal = prompt('🤖 Auto-Agent को क्या टास्क देना है?', 'Write a Python script to analyze password security and verify SHA-256 integrity');
    if (goal) sendMessage(`${goal}. Provide a complete runnable Python script.`);
  });

  on('bugAuditSidebarBtn', 'click', () => {
    closeSidebar();
    const target = prompt('🛡️ किस कोड या सिस्टम का Bug Bounty Audit करना है?', 'Write a Python script to demonstrate and test for IDOR and JWT signature bypass');
    if (target) sendMessage(target);
  });

  on(DOM.createImgModeBtn, 'click', () => {
    state.imageGenMode = !state.imageGenMode;
    if (state.imageGenMode) state.videoGenMode = false;
    DOM.createImgModeBtn?.classList.toggle('active', state.imageGenMode);
    DOM.createVideoModeBtn?.classList.remove('active');
    if (DOM.userInput) {
      DOM.userInput.placeholder = state.imageGenMode
        ? '📸 कैसी असली (RAW DSLR) फोटो बनानी है? लिखें...'
        : 'Message ChatGPT...';
      DOM.userInput.focus();
    }
  });

  on(DOM.webSearchToggleBtn, 'click', () => {
    state.webSearchMode = !state.webSearchMode;
    DOM.webSearchToggleBtn?.classList.toggle('active', state.webSearchMode);
    toast(state.webSearchMode ? '🌐 Web Search On' : 'Web Search Off');
  });

  on('todayNewsSidebarBtn', 'click', () => {
    closeSidebar();
    sendMessage('आज की मुख्य ताज़ा खबरें (India, Tech और World News) हिंदी में बताओ');
  });

  on('menuBtn', 'click', openSidebar);
  on('closeSidebarBtn', 'click', closeSidebar);
  on(DOM.sidebarOverlay, 'click', closeSidebar);
  on('newChatBtn', 'click', createNewChat);
  on('newChatSidebarBtn', 'click', createNewChat);
  on(DOM.modelSelect, 'change', function() { state.currentModel = this.value; saveStorage(); });

  on('themeToggleBtn', 'click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('chatgpt_ultra_theme', next);
    updateThemeLabel();
  });

  on('settingsBtn', 'click', () => { closeSidebar(); DOM.settingsPanel?.classList.toggle('open'); });
  on('applySettingsBtn', 'click', () => {
    state.geminiKey = DOM.geminiKeyInput?.value.trim() || getDefaultKey();
    state.systemPrompt = DOM.systemPromptInput?.value.trim() || DEFAULT_PROMPT;
    state.showThinking = !!DOM.showThinkingCheck?.checked;
    state.autoVoice = !!DOM.autoVoiceCheck?.checked;
    state.faceLockEnabled = !!DOM.faceLockCheck?.checked;
    state.autoRunPython = !!DOM.autoRunPyCheck?.checked;
    DOM.settingsPanel?.classList.remove('open');
    saveStorage();
    toast('Settings saved!');
  });
  on('resetSettingsBtn', 'click', () => {
    state.geminiKey = getDefaultKey();
    state.systemPrompt = DEFAULT_PROMPT;
    if (DOM.geminiKeyInput) DOM.geminiKeyInput.value = state.geminiKey;
    if (DOM.systemPromptInput) DOM.systemPromptInput.value = DEFAULT_PROMPT;
    saveStorage();
    toast('Reset to default');
  });
  on('exportBtn', 'click', () => {
    const blob = new Blob([JSON.stringify(state.conversation, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat-${Date.now()}.json`;
    a.click();
  });
  on('clearAllBtn', 'click', () => {
    if (confirm('Delete all chats?')) {
      state.conversations = {};
      state.activeChatId = null;
      state.conversation = [];
      saveStorage();
      renderSidebarList();
      showWelcomeScreen();
    }
  });

  on('openSandboxSidebarBtn', 'click', () => { closeSidebar(); openCodeSandbox(); });
  on('closeSandboxBtn', 'click', () => DOM.sandboxModal?.classList.remove('open'));
  on('runSandboxBtn', 'click', () => {
    if (DOM.sandboxFrame && DOM.sandboxCodeEditor) DOM.sandboxFrame.srcdoc = DOM.sandboxCodeEditor.value;
  });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && DOM.micBtn) {
    const rec = new SR();
    rec.lang = 'hi-IN';
    let active = false;
    rec.onstart = () => { active = true; DOM.micBtn.classList.add('recording'); };
    rec.onend = () => { active = false; DOM.micBtn.classList.remove('recording'); };
    rec.onresult = e => { if (DOM.userInput) DOM.userInput.value = e.results[0][0].transcript; };
    DOM.micBtn.onclick = () => active ? rec.stop() : rec.start();
  } else if (DOM.micBtn) {
    DOM.micBtn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', init);
