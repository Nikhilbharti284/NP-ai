if (typeof puter !== 'undefined') puter.quiet = true;

// ==================== SYSTEM PROMPT ====================
const DEFAULT_PROMPT = `You are Dolphin AI (ChatGPT-4o class assistant).
- Speak naturally in the user's preferred language (Hindi, Hinglish, or English).
- Give direct, accurate, complete answers and working code without unnecessary disclaimers.`;

// ==================== STATE ====================
const state = {
  conversations: {},
  activeChatId: null,
  conversation: [],
  busy: false,
  stopFlag: false,
  systemPrompt: DEFAULT_PROMPT,
  currentModel: 'openai',
  webSearchMode: false,
  imageGenMode: false,
  attachedImageDataUrl: null,
  autoVoice: false,
  speechSynth: window.speechSynthesis,
  editor: {
    baseImage: null,
    rotation: 0,
    flipH: 1,
    flipV: 1,
    filters: { brightness: 100, contrast: 100, saturation: 100, sepia: 0, blur: 0 },
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
  systemPromptInput: document.getElementById('systemPromptInput'),
  autoVoiceCheck: document.getElementById('autoVoiceCheck'),
  attachmentBar: document.getElementById('attachmentBar'),
  attachedImgThumb: document.getElementById('attachedImgThumb'),
  chatImageUpload: document.getElementById('chatImageUpload'),
  createImgModeBtn: document.getElementById('createImgModeBtn'),
  webSearchToggleBtn: document.getElementById('webSearchToggleBtn'),
  micBtn: document.getElementById('micBtn'),
  studioModal: document.getElementById('studioModal'),
  editorCanvas: document.getElementById('editorCanvas'),
  studioPromptInput: document.getElementById('studioPromptInput'),
  studioLoading: document.getElementById('studioLoading'),
  studioLoadingText: document.getElementById('studioLoadingText'),
  uploadImageInput: document.getElementById('uploadImageInput'),
  sandboxModal: document.getElementById('sandboxModal'),
  sandboxCodeEditor: document.getElementById('sandboxCodeEditor'),
  sandboxFrame: document.getElementById('sandboxFrame'),
  toastContainer: document.getElementById('toastContainer')
};

marked.setOptions({
  breaks: true,
  gfm: true,
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  }
});

// ==================== INITIALIZE ====================
function init() {
  loadStorage();
  bindEvents();
  bindStudioEvents();
  const theme = localStorage.getItem('dolphin_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeLabel();
  drawEmptyStudioCanvas();
}

// ==================== IMAGE COMPRESSOR (FIXES GALLERY PHOTO ERRORS!) ====================
// Compresses 10MB phone gallery photos down to a crisp ~60KB 800px JPEG so Vision APIs never fail
function compressGalleryImage(fileOrDataUrl, maxDim = 800) {
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
        resolve(c.toDataURL('image/jpeg', 0.82));
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

// ==================== BULLETPROOF MULTIMODAL AI ENGINE (NO 404, NO POPUPS) ====================
// Uses Pollinations OpenAI-compatible POST endpoint (supports Text + Base64 Vision!) with Puter fallback
async function askMultimodalAI(messages, model = 'openai') {
  const mappedModel = model === 'puter-gpt4o' ? 'openai' : model;

  // 1. Primary: Pollinations OpenAI-Compatible POST Endpoint
  try {
    const resp = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: mappedModel,
        messages: messages,
        temperature: 0.7
      })
    });
    if (resp.ok) {
      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content;
      if (reply && reply.trim()) return reply.trim();
    }
  } catch (e) {}

  // 2. Secondary: Pollinations Raw POST Endpoint
  try {
    const flatMessages = messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.map(c => c.text || '').join(' ')
        : m.content
    }));
    const resp2 = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: flatMessages, model: 'openai' })
    });
    if (resp2.ok) {
      const txt = await resp2.text();
      if (txt && !txt.includes('404 Not Found')) return txt.trim();
    }
  } catch (e) {}

  // 3. Tertiary: Puter.js Cloud AI
  if (typeof puter !== 'undefined' && puter.ai?.chat) {
    const lastMsg = messages[messages.length - 1];
    let textPrompt = '';
    let imgData = null;
    if (Array.isArray(lastMsg.content)) {
      textPrompt = lastMsg.content.find(c => c.type === 'text')?.text || 'Describe this image';
      imgData = lastMsg.content.find(c => c.type === 'image_url')?.image_url?.url;
    } else {
      textPrompt = lastMsg.content;
    }
    const pResp = imgData
      ? await puter.ai.chat(textPrompt, imgData)
      : await puter.ai.chat(textPrompt);
    return typeof pResp === 'string' ? pResp : (pResp?.message?.content || String(pResp));
  }

  throw new Error('Network busy. Please check your internet connection and try again.');
}

// ==================== REAL CHATGPT PHOTO EDITING & IMAGE GENERATION ====================
// Converts Hindi/Hinglish or Gallery Photo + User Edit Prompt into a clean English Flux prompt
async function craftSmartImagePrompt(userRequest, attachedBase64 = null) {
  if (attachedBase64) {
    // Vision-to-Image: Read the exact uploaded gallery photo and merge the user's edit request!
    const visionMessages = [
      {
        role: 'system',
        content: 'You are an expert AI photo editor and visual prompt engineer. Look closely at the attached image. Describe the subject (person/object, gender, approximate age, hairstyle, facial expression, glasses/beard, clothing, pose, camera framing, and lighting) accurately, and then apply the user\'s requested modification or style transfer. Output ONLY the final detailed English image generation prompt (max 65 words). No intro, no quotes.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Modify this photo as follows: "${userRequest}"` },
          { type: 'image_url', image_url: { url: attachedBase64 } }
        ]
      }
    ];
    try {
      const crafted = await askMultimodalAI(visionMessages, 'openai');
      if (crafted && crafted.length > 10) return crafted.replace(/["`]/g, '').trim();
    } catch (e) {}
  } else {
    // Translate Hindi/Hinglish/short prompt into rich English Flux prompt
    const translateMessages = [
      {
        role: 'system',
        content: 'Convert the user\'s image request (which may be in Hindi, Hinglish, or English) into a vivid, detailed English image generation prompt (under 55 words) for Flux AI. Output ONLY the English prompt, nothing else.'
      },
      { role: 'user', content: userRequest }
    ];
    try {
      const enhanced = await askMultimodalAI(translateMessages, 'openai');
      if (enhanced && enhanced.length > 5) return enhanced.replace(/["`]/g, '').trim();
    } catch (e) {}
  }
  return userRequest;
}

function getFluxImageUrl(englishPrompt, width = 768, height = 768) {
  const seed = Math.floor(Math.random() * 9999999);
  const safePrompt = englishPrompt.substring(0, 450);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true`;
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error('Image server timed out'));
    img.src = url;
  });
}

// ==================== LIVE WEB SEARCH (WIKIPEDIA + HACKERNEWS + JINA) ====================
async function runLiveWebSearch(query) {
  const snippets = [];

  // 1. Wikipedia Search API (Instant, 100% CORS-supported)
  try {
    const wUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
    const r = await fetch(wUrl);
    if (r.ok) {
      const d = await r.json();
      const items = (d?.query?.search || []).slice(0, 3).map(s =>
        `• [${s.title}](https://en.wikipedia.org/wiki/${encodeURIComponent(s.title)}): ${s.snippet.replace(/<[^>]+>/g, '')}`
      );
      if (items.length) snippets.push(`Wikipedia Live Data:\n${items.join('\n')}`);
    }
  } catch (e) {}

  // 2. HackerNews Algolia Tech/News Search (Instant, 100% CORS-supported)
  try {
    const hnUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=4`;
    const r2 = await fetch(hnUrl);
    if (r2.ok) {
      const d2 = await r2.json();
      const hits = (d2?.hits || []).filter(h => h.title).map(h =>
        `• [${h.title}](${h.url || `https://news.ycombinator.com/item?id=${h.objectID}`}) (${h.created_at?.substring(0, 10)})`
      );
      if (hits.length) snippets.push(`Tech & Web News:\n${hits.join('\n')}`);
    }
  } catch (e) {}

  // 3. Jina Live Web Reader (with 3.5s timeout so it never hangs)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const jUrl = `https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const r3 = await fetch(jUrl, { headers: { 'Accept': 'text/plain' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (r3.ok) {
      const txt = await r3.text();
      if (txt && txt.length > 80) snippets.push(`DuckDuckGo Web Results:\n${txt.substring(0, 2200)}`);
    }
  } catch (e) {}

  return snippets.join('\n\n');
}

// ==================== DETECT USER INTENT AUTOMATICALLY (LIKE REAL CHATGPT) ====================
function detectUserIntent(text, hasAttachedImage) {
  const lower = text.toLowerCase();

  // Did user explicitly toggle Image Mode or type an image creation phrase?
  if (state.imageGenMode || /^(\/image|\/img)\b/i.test(lower)) {
    return hasAttachedImage ? 'edit_uploaded_photo' : 'generate_new_image';
  }

  // If a gallery photo is attached, check if user wants to EDIT/CONVERT it vs ASK a question about it
  if (hasAttachedImage) {
    const editKeywords = /(edit|change|modify|convert|transform|make|turn|style|anime|cartoon|sketch|cyberpunk|pixar|3d|background|bg|remove|add|wear|dress|glasses|suit|color|filter|banao|bna do|badal|kar do|kr do|laga do|lga do|hata do)/i;
    if (editKeywords.test(lower) || !text.trim()) {
      return 'edit_uploaded_photo';
    }
    return 'vision_qa';
  }

  // Check if user naturally asked to generate/create a photo in Hindi/Hinglish/English
  const createImgKeywords = /(generate an? image|create an? image|draw an? |make a photo of|make an image of|photo bnao|photo banao|image bnao|image banao|pic bnao|tasveer bnao|फोटो बनाओ|इमेज बनाओ)/i;
  if (createImgKeywords.test(lower)) {
    return 'generate_new_image';
  }

  return 'normal_chat';
}

// ==================== MAIN SEND FLOW ====================
async function sendMessage(overrideText = null, forceIntent = null) {
  let text = (overrideText !== null ? overrideText : DOM.userInput.value).trim();
  const hasImage = !!state.attachedImageDataUrl;
  if ((!text && !hasImage) || state.busy) return;
  if (!state.activeChatId) createNewChat();

  const intent = forceIntent || detectUserIntent(text, hasImage);
  const currentImage = state.attachedImageDataUrl;
  clearAttachment();

  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';

  // Turn off one-shot Create Image pill after sending
  if (state.imageGenMode) {
    state.imageGenMode = false;
    DOM.createImgModeBtn.classList.remove('active');
  }

  const userDisplay = text || (intent === 'edit_uploaded_photo' ? '🪄 Edit this photo with AI' : '👁️ Analyze this photo');
  state.conversation.push({ role: 'user', content: userDisplay, timestamp: Date.now() });
  appendUserMessage(userDisplay, currentImage);

  state.busy = true;
  state.stopFlag = false;
  updateSendBtn(true);

  const aiBodyEl = appendAssistantPlaceholder();
  scrollToBottom();

  try {
    // 1. GENERATE NEW IMAGE OR EDIT GALLERY PHOTO
    if (intent === 'generate_new_image' || intent === 'edit_uploaded_photo') {
      const cleanReq = text.replace(/^(\/image|\/img)\s*/i, '') || 'Enhance this photo into a high quality artistic portrait';
      aiBodyEl.innerHTML = `
        <div class="img-skeleton">
          <div class="loader-ring"></div>
          <span>${currentImage ? '👁️ AI आपकी फोटो को पढ़कर नया एडिटेड वर्जन बना रहा है...' : '🎨 AI इमेज बना रहा है...'}</span>
        </div>`;
      scrollToBottom();

      const smartEnglishPrompt = await craftSmartImagePrompt(cleanReq, currentImage);
      const imgUrl = getFluxImageUrl(smartEnglishPrompt, 768, 768);
      await preloadImage(imgUrl);

      const finalMarkdown = `**${currentImage ? '🪄 AI Edited Photo' : '🎨 Generated Image'}:**\n\n![AI Image](${imgUrl})\n\n<small style="color:var(--text-muted)">Prompt: ${escapeHtml(smartEnglishPrompt)}</small>`;
      renderFinalAssistantContent(aiBodyEl, finalMarkdown, { imageUrl: imgUrl, imagePrompt: smartEnglishPrompt });
      state.conversation.push({ role: 'assistant', content: finalMarkdown, timestamp: Date.now() });
    }
    // 2. VISION Q&A (READ/SOLVE UPLOADED PHOTO)
    else if (intent === 'vision_qa') {
      aiBodyEl.innerHTML = `<span style="color:var(--text-muted)">👁️ फोटो को ध्यान से देखा जा रहा है...</span>`;
      const visionMessages = [
        { role: 'system', content: state.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userDisplay },
            { type: 'image_url', image_url: { url: currentImage } }
          ]
        }
      ];
      const answer = await askMultimodalAI(visionMessages, 'openai');
      await streamTextToElement(aiBodyEl, answer);
      renderFinalAssistantContent(aiBodyEl, answer);
      state.conversation.push({ role: 'assistant', content: answer, timestamp: Date.now() });
      if (state.autoVoice) speakReply(answer);
    }
    // 3. NORMAL CHAT + OPTIONAL LIVE WEB SEARCH
    else {
      let historyMsgs = [
        { role: 'system', content: state.systemPrompt },
        ...state.conversation.slice(-10).map(m => ({ role: m.role, content: m.content }))
      ];

      if (state.webSearchMode || /^\/web\b/i.test(text)) {
        const q = text.replace(/^\/web\s*/i, '');
        aiBodyEl.innerHTML = `<span style="color:var(--text-muted)">🌐 इंटरनेट से ताज़ा जानकारी खोजी जा रही है...</span>`;
        const webData = await runLiveWebSearch(q);
        if (webData) {
          historyMsgs.push({
            role: 'system',
            content: `Here is live web search data for the user's query. Use it to answer accurately and include markdown links:\n\n${webData}`
          });
        }
      } else {
        aiBodyEl.innerHTML = `<span style="color:var(--text-muted)">Thinking...</span>`;
      }

      const reply = await askMultimodalAI(historyMsgs, state.currentModel);
      await streamTextToElement(aiBodyEl, reply);
      renderFinalAssistantContent(aiBodyEl, reply);
      state.conversation.push({ role: 'assistant', content: reply, timestamp: Date.now() });
      if (state.autoVoice) speakReply(reply);
    }
  } catch (err) {
    aiBodyEl.innerHTML = `<span style="color:var(--danger)">⚠️ ${escapeHtml(err.message)}</span>`;
  } finally {
    state.busy = false;
    updateSendBtn(false);
    saveActiveChat();
    renderSidebarList();
    scrollToBottom();
  }
}

// Smooth ChatGPT-style typing effect
async function streamTextToElement(el, fullText) {
  const words = fullText.split(' ');
  let current = '';
  const step = Math.max(2, Math.ceil(words.length / 35));
  for (let i = 0; i < words.length; i += step) {
    if (state.stopFlag) break;
    current += words.slice(i, i + step).join(' ') + ' ';
    el.innerHTML = marked.parse(current);
    scrollToBottom();
    await new Promise(r => setTimeout(r, 18));
  }
}

// ==================== CHAT UI RENDERERS ====================
function showWelcomeScreen() {
  DOM.chatInner.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-logo">🐬</div>
      <h1>What can I help with?</h1>
      <p>ChatGPT-style Vision, Gallery Photo AI Editing, Live Web Search & Code Execution</p>
      <div class="starter-grid">
        <div class="starter-card" data-action="upload-photo">
          <strong>🪄 Edit Gallery Photo</strong>
          <span>अपनी फोटो अपलोड करें और प्रॉम्प्ट लिखकर बदलें</span>
        </div>
        <div class="starter-card" data-prompt="Create an image of a futuristic cyberpunk motorcycle in Himachal mountains at sunset">
          <strong>🎨 Generate AI Art</strong>
          <span>हिंदी या इंग्लिश में बोलकर नई फोटो बनवाएं</span>
        </div>
        <div class="starter-card" data-action="web-news">
          <strong>🌐 Search Live Web</strong>
          <span>आज की ताज़ा टेक और दुनिया की खबरें पूछें</span>
        </div>
        <div class="starter-card" data-prompt="Build a modern interactive Calculator in single-file HTML/CSS/JS">
          <strong>💻 Write & Run Code</strong>
          <span>वेबसाइट और ऐप्स बनवाकर तुरंत लाइव चलाएं</span>
        </div>
      </div>
    </div>`;

  DOM.chatInner.querySelectorAll('.starter-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.dataset.action === 'upload-photo') {
        DOM.chatImageUpload.click();
      } else if (card.dataset.action === 'web-news') {
        state.webSearchMode = true;
        DOM.webSearchToggleBtn.classList.add('active');
        sendMessage('आज की लेटेस्ट टेक्नोलॉजी और AI खबरें क्या हैं?');
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
  const imgHtml = imageUrl ? `<img src="${imageUrl}" alt="Uploaded">` : '';
  row.innerHTML = `<div class="user-pill">${imgHtml}${escapeHtml(text)}</div>`;
  DOM.chatInner.appendChild(row);
}

function appendAssistantPlaceholder() {
  document.querySelector('.welcome-screen')?.remove();
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `<div class="ai-avatar">🐬</div><div class="ai-body"></div>`;
  DOM.chatInner.appendChild(row);
  return row.querySelector('.ai-body');
}

function renderFinalAssistantContent(aiBodyEl, markdownText, meta = null) {
  aiBodyEl.innerHTML = marked.parse(markdownText || '');

  // Enhance Code Blocks with Copy + Run Live
  aiBodyEl.querySelectorAll('pre code').forEach(b => { try { hljs.highlightElement(b); } catch (e) {} });
  aiBodyEl.querySelectorAll('pre').forEach(pre => {
    const codeEl = pre.querySelector('code');
    const raw = codeEl ? codeEl.textContent : pre.textContent;
    const langClass = codeEl ? [...codeEl.classList].find(c => c.startsWith('language-')) : '';
    const lang = langClass ? langClass.replace('language-', '') : 'code';

    const box = document.createElement('div');
    box.className = 'code-box';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    bar.innerHTML = `<span>${escapeHtml(lang.toUpperCase())}</span><div class="code-bar-btns"></div>`;
    const btnGroup = bar.querySelector('.code-bar-btns');

    if (['html', 'xml', 'javascript', 'js'].includes(lang.toLowerCase()) || raw.includes('<html')) {
      const runBtn = document.createElement('button');
      runBtn.className = 'code-btn run';
      runBtn.textContent = '▶ Run Live';
      runBtn.onclick = () => openCodeSandbox(raw);
      btnGroup.appendChild(runBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-btn';
    copyBtn.textContent = '📋 Copy';
    copyBtn.onclick = () => { navigator.clipboard.writeText(raw); toast('Code copied!'); };
    btnGroup.appendChild(copyBtn);

    pre.parentNode.insertBefore(box, pre);
    box.appendChild(bar);
    box.appendChild(pre);
  });

  // Action Bar under AI Message
  const tools = document.createElement('div');
  tools.className = 'msg-tools';

  const imgEl = aiBodyEl.querySelector('img');
  if (imgEl) {
    const src = meta?.imageUrl || imgEl.src;
    const promptUsed = meta?.imagePrompt || '';

    const studioBtn = document.createElement('button');
    studioBtn.className = 'msg-tool-btn';
    studioBtn.innerHTML = '🎛️ Filters & Studio';
    studioBtn.onclick = () => openStudioWithImage(src, promptUsed);

    const modifyBtn = document.createElement('button');
    modifyBtn.className = 'msg-tool-btn';
    modifyBtn.innerHTML = '🪄 Modify Again';
    modifyBtn.onclick = async () => {
      const editReq = prompt('🪄 इस फोटो में आगे क्या बदलाव करना है?', 'Change lighting to neon cyberpunk');
      if (editReq) {
        state.attachedImageDataUrl = src;
        sendMessage(editReq, 'edit_uploaded_photo');
      }
    };

    const dlBtn = document.createElement('a');
    dlBtn.className = 'msg-tool-btn';
    dlBtn.href = src;
    dlBtn.target = '_blank';
    dlBtn.innerHTML = '📥 Full Image';

    tools.append(studioBtn, modifyBtn, dlBtn);
  }

  const speakBtn = document.createElement('button');
  speakBtn.className = 'msg-tool-btn';
  speakBtn.innerHTML = '🔊 Listen';
  speakBtn.onclick = () => speakReply(markdownText);

  const copyMsgBtn = document.createElement('button');
  copyMsgBtn.className = 'msg-tool-btn';
  copyMsgBtn.innerHTML = '📋 Copy';
  copyMsgBtn.onclick = () => { navigator.clipboard.writeText(markdownText); toast('Copied!'); };

  tools.append(speakBtn, copyMsgBtn);
  aiBodyEl.appendChild(tools);
}

// ==================== PHOTO STUDIO & CANVAS FILTER EDITOR ====================
function drawEmptyStudioCanvas() {
  const ctx = DOM.editorCanvas.getContext('2d');
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, DOM.editorCanvas.width, DOM.editorCanvas.height);
  ctx.fillStyle = '#888';
  ctx.font = '18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📂 Upload a Gallery Photo or ✨ Generate with AI', DOM.editorCanvas.width / 2, DOM.editorCanvas.height / 2);
}

function openStudioWithImage(url = null, promptText = '') {
  DOM.studioModal.classList.add('open');
  if (promptText) DOM.studioPromptInput.value = promptText;
  if (url) loadStudioImage(url);
}

function loadStudioImage(url) {
  DOM.studioLoading.style.display = 'flex';
  DOM.studioLoadingText.textContent = 'Loading photo...';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    state.editor.baseImage = img;
    resetStudioFilters(false);
    renderStudioCanvas();
    DOM.studioLoading.style.display = 'none';
  };
  img.onerror = () => {
    DOM.studioLoading.style.display = 'none';
    toast('Could not load image into canvas');
  };
  img.src = url;
}

function resetStudioFilters(redraw = true) {
  state.editor.rotation = 0;
  state.editor.flipH = 1;
  state.editor.flipV = 1;
  state.editor.filters = { brightness: 100, contrast: 100, saturation: 100, sepia: 0, blur: 0 };
  state.editor.texts = [];
  ['Brightness', 'Contrast', 'Saturation'].forEach(k => document.getElementById('filter' + k).value = 100);
  ['Sepia', 'Blur'].forEach(k => document.getElementById('filter' + k).value = 0);
  if (redraw) renderStudioCanvas();
}

function renderStudioCanvas() {
  const img = state.editor.baseImage;
  if (!img) return;
  const c = DOM.editorCanvas;
  const ctx = c.getContext('2d');
  const rot90 = Math.abs(state.editor.rotation) % 180 === 90;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  c.width = rot90 ? h : w;
  c.height = rot90 ? w : h;

  const f = state.editor.filters;
  ctx.save();
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) sepia(${f.sepia}%) blur(${f.blur}px)`;
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

async function runStudioAiEdit(customPrompt = null) {
  const req = (customPrompt || DOM.studioPromptInput.value).trim();
  if (!req) return toast('पहले लिखें कि फोटो में क्या बदलना है!');
  DOM.studioLoading.style.display = 'flex';
  DOM.studioLoadingText.textContent = '👁️ AI आपकी फोटो को देखकर नया वर्जन बना रहा है...';
  try {
    let base64Snap = null;
    if (state.editor.baseImage) {
      base64Snap = await compressGalleryImage(DOM.editorCanvas.toDataURL('image/jpeg', 0.85), 768);
    }
    const smartPrompt = await craftSmartImagePrompt(req, base64Snap);
    const newUrl = getFluxImageUrl(smartPrompt, 768, 768);
    await preloadImage(newUrl);
    loadStudioImage(newUrl);
    toast('✨ Photo Edited!');
  } catch (e) {
    DOM.studioLoading.style.display = 'none';
    toast(e.message);
  }
}

function bindStudioEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    };
  });

  document.getElementById('headerStudioBtn').onclick = () => openStudioWithImage();
  document.getElementById('openStudioQuickBtn').onclick = () => openStudioWithImage();
  document.getElementById('openStudioSidebarBtn').onclick = () => { closeSidebar(); openStudioWithImage(); };
  document.getElementById('closeStudioBtn').onclick = () => DOM.studioModal.classList.remove('open');

  document.getElementById('triggerUploadBtn').onclick = () => DOM.uploadImageInput.click();
  DOM.uploadImageInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressGalleryImage(file, 900);
    loadStudioImage(compressed);
    toast('Photo loaded! Click 🪄 AI Edit or use presets.');
  };

  document.getElementById('studioGenerateBtn').onclick = async () => {
    const p = DOM.studioPromptInput.value.trim();
    if (!p) return toast('Write a prompt first!');
    DOM.studioLoading.style.display = 'flex';
    DOM.studioLoadingText.textContent = '✨ Creating image...';
    try {
      const eng = await craftSmartImagePrompt(p, null);
      const url = getFluxImageUrl(eng, 768, 768);
      await preloadImage(url);
      loadStudioImage(url);
    } catch (e) {
      DOM.studioLoading.style.display = 'none';
      toast(e.message);
    }
  };

  document.getElementById('studioAiRemixBtn').onclick = () => runStudioAiEdit();

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.onclick = () => {
      DOM.studioPromptInput.value = btn.dataset.prompt;
      runStudioAiEdit(btn.dataset.prompt);
    };
  });

  const sMap = {
    filterBrightness: 'brightness', filterContrast: 'contrast',
    filterSaturation: 'saturation', filterSepia: 'sepia', filterBlur: 'blur'
  };
  Object.entries(sMap).forEach(([id, key]) => {
    document.getElementById(id).oninput = e => {
      state.editor.filters[key] = parseFloat(e.target.value);
      renderStudioCanvas();
    };
  });

  document.getElementById('rotateImgBtn').onclick = () => { state.editor.rotation = (state.editor.rotation + 90) % 360; renderStudioCanvas(); };
  document.getElementById('flipHImgBtn').onclick = () => { state.editor.flipH *= -1; renderStudioCanvas(); };
  document.getElementById('flipVImgBtn').onclick = () => { state.editor.flipV *= -1; renderStudioCanvas(); };
  document.getElementById('resetFiltersBtn').onclick = () => resetStudioFilters(true);

  document.getElementById('addTextOverlayBtn').onclick = () => {
    const inp = document.getElementById('overlayTextInput');
    const col = document.getElementById('overlayColorInput').value;
    if (!inp.value.trim() || !state.editor.baseImage) return;
    const y = state.editor.texts.length === 0 ? DOM.editorCanvas.height - 40 : 60 * (state.editor.texts.length + 1);
    state.editor.texts.push({ text: inp.value.trim(), color: col, y });
    inp.value = '';
    renderStudioCanvas();
  };

  document.getElementById('downloadStudioImgBtn').onclick = () => {
    if (!state.editor.baseImage) return;
    const a = document.createElement('a');
    a.href = DOM.editorCanvas.toDataURL('image/png');
    a.download = `photo-${Date.now()}.png`;
    a.click();
  };

  document.getElementById('sendToChatStudioBtn').onclick = () => {
    if (!state.editor.baseImage) return;
    if (!state.activeChatId) createNewChat();
    const dataUrl = DOM.editorCanvas.toDataURL('image/jpeg', 0.9);
    const md = `**🖼️ Studio Edited Photo:**\n\n![Studio Photo](${dataUrl})`;
    const bodyEl = appendAssistantPlaceholder();
    renderFinalAssistantContent(bodyEl, md, { imageUrl: dataUrl });
    state.conversation.push({ role: 'assistant', content: md, timestamp: Date.now() });
    saveActiveChat();
    DOM.studioModal.classList.remove('open');
    scrollToBottom();
  };
}

// ==================== STORAGE & SIDEBAR ====================
function loadStorage() {
  try {
    const raw = localStorage.getItem('dolphin_chatgpt_v5');
    if (raw) {
      const d = JSON.parse(raw);
      state.conversations = d.conversations || {};
      state.activeChatId = d.activeChatId || null;
      state.systemPrompt = d.systemPrompt || DEFAULT_PROMPT;
      state.currentModel = d.model || 'openai';
    }
  } catch (e) {}
  DOM.systemPromptInput.value = state.systemPrompt;
  DOM.modelSelect.value = state.currentModel;

  if (state.activeChatId && state.conversations[state.activeChatId]) {
    switchChat(state.activeChatId);
  } else {
    renderSidebarList();
    showWelcomeScreen();
  }
}

function saveStorage() {
  try {
    localStorage.setItem('dolphin_chatgpt_v5', JSON.stringify({
      conversations: state.conversations,
      activeChatId: state.activeChatId,
      systemPrompt: state.systemPrompt,
      model: state.currentModel
    }));
  } catch (e) {}
}

function createNewChat() {
  saveActiveChat();
  const id = 'c_' + Date.now();
  state.conversations[id] = { id, title: 'New Chat', messages: [], timestamp: Date.now() };
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
  DOM.chatInner.innerHTML = '';
  if (state.conversation.length === 0) {
    showWelcomeScreen();
  } else {
    state.conversation.forEach(m => {
      if (m.role === 'user') appendUserMessage(m.content);
      else {
        const b = appendAssistantPlaceholder();
        renderFinalAssistantContent(b, m.content);
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
    if (state.conversations[state.activeChatId].title === 'New Chat') {
      const first = state.conversation.find(m => m.role === 'user');
      if (first) state.conversations[state.activeChatId].title = first.content.substring(0, 34);
    }
    saveStorage();
  }
}

function renderSidebarList() {
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
    el.onclick = e => {
      if (!e.target.classList.contains('del-chat')) switchChat(el.dataset.id);
    };
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
  DOM.chatImageUpload.value = '';
  DOM.attachmentBar.style.display = 'none';
}

function openCodeSandbox(code = '') {
  if (code) DOM.sandboxCodeEditor.value = code;
  else if (!DOM.sandboxCodeEditor.value.trim()) {
    DOM.sandboxCodeEditor.value = `<!DOCTYPE html>\n<html>\n<body style="background:#111;color:#10a37f;font-family:sans-serif;text-align:center;padding-top:20%">\n  <h1>🐬 Live Code Sandbox</h1>\n</body>\n</html>`;
  }
  DOM.sandboxModal.classList.add('open');
  DOM.sandboxFrame.srcdoc = DOM.sandboxCodeEditor.value;
}

function speakReply(text) {
  if (!state.speechSynth) return;
  state.speechSynth.cancel();
  const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`_~>\[\]\(\)]/g, ' ').trim().substring(0, 1000);
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = /[\u0900-\u097F]/.test(clean) ? 'hi-IN' : 'en-IN';
  state.speechSynth.speak(u);
}

function openSidebar() { DOM.sidebar.classList.add('open'); DOM.sidebarOverlay.classList.add('open'); }
function closeSidebar() { DOM.sidebar.classList.remove('open'); DOM.sidebarOverlay.classList.remove('open'); }
function updateSendBtn(busy) {
  DOM.sendBtn.classList.toggle('stop-mode', busy);
  DOM.sendBtn.textContent = busy ? '⏹' : '↑';
}
function scrollToBottom() { DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight; }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  DOM.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
function updateThemeLabel() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  document.getElementById('themeIcon').textContent = isDark ? '☀️' : '🌙';
  document.getElementById('themeText').textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

function bindEvents() {
  DOM.userInput.oninput = function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  };
  DOM.userInput.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      sendMessage();
    }
  };
  DOM.sendBtn.onclick = () => {
    if (state.busy) state.stopFlag = true;
    else sendMessage();
  };

  // Gallery Photo Upload & Instant Compression
  document.getElementById('attachImgBtn').onclick = () => DOM.chatImageUpload.click();
  document.getElementById('uploadPhotoSidebarBtn').onclick = () => { closeSidebar(); DOM.chatImageUpload.click(); };

  DOM.chatImageUpload.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Optimizing photo...');
      state.attachedImageDataUrl = await compressGalleryImage(file, 800);
      DOM.attachedImgThumb.src = state.attachedImageDataUrl;
      DOM.attachmentBar.style.display = 'flex';
      DOM.userInput.placeholder = 'बताइये इस फोटो में क्या बदलना है या क्या पूछना है...';
      DOM.userInput.focus();
    } catch (err) {
      toast('Error loading photo');
    }
  };

  document.getElementById('removeAttachmentBtn').onclick = clearAttachment;

  // Quick Action Pills on Uploaded Gallery Photo
  document.getElementById('aiEditAttachedBtn').onclick = () => {
    const custom = DOM.userInput.value.trim() || prompt('🪄 इस फोटो में क्या बदलाव (Edit) करना है?', 'Make it look cinematic 8k');
    if (custom) sendMessage(custom, 'edit_uploaded_photo');
  };
  document.getElementById('animeAttachedBtn').onclick = () => sendMessage('Convert this exact person and pose into high-budget Japanese Anime Studio Ghibli style', 'edit_uploaded_photo');
  document.getElementById('cyberAttachedBtn').onclick = () => sendMessage('Transform this exact photo into futuristic cyberpunk style with neon lights', 'edit_uploaded_photo');
  document.getElementById('ocrAttachedBtn').onclick = () => sendMessage('Extract all visible text from this image accurately and explain it.', 'vision_qa');
  document.getElementById('studioAttachedBtn').onclick = () => {
    const img = state.attachedImageDataUrl;
    clearAttachment();
    openStudioWithImage(img);
  };

  // Mode Pills
  DOM.createImgModeBtn.onclick = () => {
    state.imageGenMode = !state.imageGenMode;
    DOM.createImgModeBtn.classList.toggle('active', state.imageGenMode);
    DOM.userInput.placeholder = state.imageGenMode
      ? '🎨 Describe the image you want to create (Hindi or English)...'
      : 'Message Dolphin AI...';
    DOM.userInput.focus();
  };

  DOM.webSearchToggleBtn.onclick = () => {
    state.webSearchMode = !state.webSearchMode;
    DOM.webSearchToggleBtn.classList.toggle('active', state.webSearchMode);
    toast(state.webSearchMode ? '🌐 Live Web Search Enabled' : 'Web Search Off');
  };

  // Sidebar & Nav
  document.getElementById('menuBtn').onclick = openSidebar;
  document.getElementById('closeSidebarBtn').onclick = closeSidebar;
  DOM.sidebarOverlay.onclick = closeSidebar;
  document.getElementById('newChatBtn').onclick = createNewChat;
  document.getElementById('newChatSidebarBtn').onclick = createNewChat;
  DOM.modelSelect.onchange = function() { state.currentModel = this.value; saveStorage(); };

  document.getElementById('themeToggleBtn').onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dolphin_theme', next);
    updateThemeLabel();
  };

  document.getElementById('settingsBtn').onclick = () => { closeSidebar(); DOM.settingsPanel.classList.toggle('open'); };
  document.getElementById('applySettingsBtn').onclick = () => {
    state.systemPrompt = DOM.systemPromptInput.value.trim() || DEFAULT_PROMPT;
    state.autoVoice = DOM.autoVoiceCheck.checked;
    DOM.settingsPanel.classList.remove('open');
    saveStorage();
    toast('Settings saved!');
  };
  document.getElementById('resetSettingsBtn').onclick = () => {
    state.systemPrompt = DEFAULT_PROMPT;
    DOM.systemPromptInput.value = DEFAULT_PROMPT;
    saveStorage();
  };
  document.getElementById('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state.conversation, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat-${Date.now()}.json`;
    a.click();
  };
  document.getElementById('clearAllBtn').onclick = () => {
    if (confirm('Delete all chats?')) {
      state.conversations = {};
      state.activeChatId = null;
      state.conversation = [];
      saveStorage();
      renderSidebarList();
      showWelcomeScreen();
    }
  };

  // Sandbox
  document.getElementById('openSandboxSidebarBtn').onclick = () => { closeSidebar(); openCodeSandbox(); };
  document.getElementById('closeSandboxBtn').onclick = () => DOM.sandboxModal.classList.remove('open');
  document.getElementById('runSandboxBtn').onclick = () => { DOM.sandboxFrame.srcdoc = DOM.sandboxCodeEditor.value; };

  // Voice Input
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const rec = new SR();
    rec.lang = 'hi-IN';
    let active = false;
    rec.onstart = () => { active = true; DOM.micBtn.classList.add('recording'); };
    rec.onend = () => { active = false; DOM.micBtn.classList.remove('recording'); };
    rec.onresult = e => { DOM.userInput.value = e.results[0][0].transcript; };
    DOM.micBtn.onclick = () => active ? rec.stop() : rec.start();
  } else {
    DOM.micBtn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', init);
