if (typeof puter !== 'undefined') puter.quiet = true;

// ==================== DEFAULT SYSTEM PROMPT ====================
const DEFAULT_SYSTEM_PROMPT = `You are Dolphin AI Ultra, a smart, helpful, uncensored, and technically accurate AI assistant.
- You speak naturally in the user's language (Hindi, Hinglish, or English).
- You provide complete working code, real facts, and practical solutions without lecturing.`;

// ==================== GLOBAL STATE ====================
const state = {
  conversations: {},
  activeChatId: null,
  conversation: [],
  busy: false,
  stopFlag: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  currentModel: 'gpt-4o-mini',
  webSearchEnabled: false,
  attachedImageDataUrl: null,
  usePuterTts: true,
  isSpeaking: false,
  speechSynth: window.speechSynthesis,
  editor: {
    baseImage: null,
    baseDataUrl: null,
    currentPrompt: '',
    rotation: 0,
    flipH: 1,
    flipV: 1,
    filters: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0 },
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
  headerTitle: document.getElementById('headerTitle'),
  tokenCount: document.getElementById('tokenCount'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  settingsPanel: document.getElementById('settingsPanel'),
  toastContainer: document.getElementById('toastContainer'),
  micBtn: document.getElementById('micBtn'),
  modelSelect: document.getElementById('modelSelect'),
  emojiBtn: document.getElementById('emojiBtn'),
  emojiPopover: document.getElementById('emojiPopover'),
  emojiGrid: document.getElementById('emojiGrid'),
  typingIndicator: document.getElementById('typingIndicator'),
  webSearchToggleBtn: document.getElementById('webSearchToggleBtn'),
  webModeBadge: document.getElementById('webModeBadge'),
  attachmentBar: document.getElementById('attachmentBar'),
  attachedImgThumb: document.getElementById('attachedImgThumb'),
  attachmentTitle: document.getElementById('attachmentTitle'),
  chatImageUpload: document.getElementById('chatImageUpload'),
  chatDocUpload: document.getElementById('chatDocUpload'),
  usePuterTtsCheck: document.getElementById('usePuterTtsCheck'),
  studioModal: document.getElementById('studioModal'),
  editorCanvas: document.getElementById('editorCanvas'),
  studioPromptInput: document.getElementById('studioPromptInput'),
  studioModelSelect: document.getElementById('studioModelSelect'),
  studioRatioSelect: document.getElementById('studioRatioSelect'),
  studioLoading: document.getElementById('studioLoading'),
  studioLoadingText: document.getElementById('studioLoadingText'),
  uploadImageInput: document.getElementById('uploadImageInput'),
  sandboxModal: document.getElementById('sandboxModal'),
  sandboxCodeEditor: document.getElementById('sandboxCodeEditor'),
  sandboxFrame: document.getElementById('sandboxFrame')
};

const EMOJIS = ['😀','😂','😍','😎','🤩','😈','💀','🐬','🔥','⚡','✨','🚀','💻','🛡️','🎯','🏆','❤️','👍','🙏','🎉','🍕'];

marked.setOptions({
  breaks: true,
  gfm: true,
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  }
});

// ==================== INIT ====================
function init() {
  loadData();
  setupEventListeners();
  setupStudioEvents();
  setupExtraTools();
  const savedTheme = localStorage.getItem('dolphin_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI();
  initPlaceholderCanvas();
  buildEmojiGrid();
}

// ==================== STORAGE ====================
function loadData() {
  try {
    const saved = localStorage.getItem('dolphin_ultra_v4');
    if (saved) {
      const data = JSON.parse(saved);
      state.conversations = data.conversations || {};
      state.activeChatId = data.activeChatId || null;
      state.systemPrompt = data.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      state.currentModel = data.model || 'gpt-4o-mini';
      state.usePuterTts = data.usePuterTts !== false;
    }
  } catch (e) { state.conversations = {}; }

  DOM.systemPromptInput.value = state.systemPrompt;
  DOM.modelSelect.value = state.currentModel;
  DOM.usePuterTtsCheck.checked = state.usePuterTts;

  if (state.activeChatId && state.conversations[state.activeChatId]) {
    loadChat(state.activeChatId);
  } else {
    renderSidebar();
    showEmptyState();
  }
}

function saveData() {
  try {
    localStorage.setItem('dolphin_ultra_v4', JSON.stringify({
      conversations: state.conversations,
      activeChatId: state.activeChatId,
      systemPrompt: state.systemPrompt,
      model: state.currentModel,
      usePuterTts: state.usePuterTts
    }));
  } catch (e) {}
}

function openSidebar() { DOM.sidebar.classList.add('open'); DOM.sidebarOverlay.classList.add('open'); }
function closeSidebar() { DOM.sidebar.classList.remove('open'); DOM.sidebarOverlay.classList.remove('open'); }

function renderSidebar() {
  const chats = Object.values(state.conversations).sort((a, b) => b.timestamp - a.timestamp);
  if (chats.length === 0) {
    DOM.chatList.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text2);font-size:12px;">No chats yet</div>';
    return;
  }
  DOM.chatList.innerHTML = chats.map(chat => `
    <div class="chat-item ${chat.id === state.activeChatId ? 'active' : ''}" data-id="${chat.id}">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(chat.title || 'New Chat')}</span>
      <button class="delete-chat-btn" data-id="${chat.id}">🗑</button>
    </div>
  `).join('');

  DOM.chatList.querySelectorAll('.chat-item').forEach(item => item.addEventListener('click', function(e) {
    if (!e.target.closest('.delete-chat-btn')) switchChat(this.dataset.id);
  }));
  DOM.chatList.querySelectorAll('.delete-chat-btn').forEach(btn => btn.addEventListener('click', function(e) {
    e.stopPropagation();
    delete state.conversations[this.dataset.id];
    if (state.activeChatId === this.dataset.id) { state.activeChatId = null; state.conversation = []; showEmptyState(); }
    saveData();
    renderSidebar();
  }));
}

function createNewChat() {
  if (state.busy) stopGeneration();
  saveCurrentChat();
  const id = 'chat_' + Date.now();
  state.conversations[id] = { id, title: 'New Chat', messages: [], timestamp: Date.now() };
  state.activeChatId = id;
  state.conversation = [];
  saveData();
  renderSidebar();
  showEmptyState();
  updateHeaderTitle();
  if (window.innerWidth <= 768) closeSidebar();
}

function switchChat(id) {
  if (state.busy || id === state.activeChatId) return;
  saveCurrentChat();
  loadChat(id);
  if (window.innerWidth <= 768) closeSidebar();
}

function loadChat(id) {
  if (!state.conversations[id]) return;
  state.activeChatId = id;
  state.conversation = [...state.conversations[id].messages];
  DOM.chatInner.innerHTML = '';
  if (state.conversation.length === 0) showEmptyState();
  else {
    state.conversation.forEach(msg => renderMessage(msg.role, msg.content, msg.timestamp, false));
    scrollToBottom();
  }
  updateHeaderTitle();
  renderSidebar();
  updateTokenCount();
}

function saveCurrentChat() {
  if (state.activeChatId && state.conversations[state.activeChatId] && state.conversation.length > 0) {
    state.conversations[state.activeChatId].messages = [...state.conversation];
    state.conversations[state.activeChatId].timestamp = Date.now();
    if (state.conversations[state.activeChatId].title === 'New Chat') {
      const first = state.conversation.find(m => m.role === 'user');
      if (first) state.conversations[state.activeChatId].title = first.content.substring(0, 36);
    }
    saveData();
  }
}

// ==================== VISION-TO-IMAGE AI PHOTO EDITOR (CHATGPT STYLE) ====================
async function buildVisionEditedPrompt(imageDataUrl, userEditInstruction) {
  const visionInstruction = `Look closely at this uploaded photo. Describe the main subject (person/object, gender, facial features, expression, clothing, pose, camera angle, lighting) in high detail, and then apply this exact modification requested by the user: "${userEditInstruction}".
Output ONLY the final merged English image generation prompt (under 75 words) ready for Flux image generator. Do not write any intro or explanation.`;

  if (typeof puter !== 'undefined' && puter.ai?.chat) {
    try {
      const resp = await puter.ai.chat(visionInstruction, imageDataUrl, { model: 'gpt-4o-mini' });
      const text = typeof resp === 'string' ? resp : (resp?.message?.content || '');
      if (text && text.trim().length > 10) return text.trim();
    } catch (e) {}
  }
  return `${userEditInstruction}, high quality detailed masterpiece, 8k resolution`;
}

function buildPollinationsImageUrl(prompt, model = 'flux', width = 768, height = 768) {
  const seed = Math.floor(Math.random() * 9999999);
  const cleanModel = ['flux', 'flux-realism', 'flux-anime', 'flux-3d', 'turbo'].includes(model) ? model : 'flux';
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${cleanModel}&width=${width}&height=${height}&seed=${seed}&nologo=true`;
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image server busy, trying backup...'));
    img.src = url;
  });
}

async function generateImageWithFallback(promptText, model = 'flux', w = 768, h = 768) {
  const url = buildPollinationsImageUrl(promptText, model, w, h);
  try {
    await loadImageElement(url);
    return url;
  } catch (err) {
    if (typeof puter !== 'undefined' && puter.ai?.txt2img) {
      const imgEl = await puter.ai.txt2img(promptText);
      return imgEl.src;
    }
    throw new Error('Image generation failed. Please try a simpler prompt.');
  }
}

// Edit an uploaded Gallery Photo using AI Vision + Flux right inside Chat!
async function handleGalleryPhotoAiEditInChat(imageDataUrl, editInstruction) {
  if (!state.activeChatId) createNewChat();
  const instruction = editInstruction || prompt('🪄 बताइये इस फोटो में क्या बदलाव (Edit) करना है?', 'Convert this photo into anime style with glowing neon background');
  if (!instruction) return;

  const userMsg = `🪄 Edit Uploaded Photo: "${instruction}"`;
  state.conversation.push({ role: 'user', content: userMsg, timestamp: Date.now() });
  renderMessage('user', userMsg, Date.now(), true, { attachedImage: imageDataUrl });
  clearAttachment();

  const assistantBubble = renderMessage('assistant', '👁️ Step 1/2: AI आपकी अपलोड की गई फोटो को पढ़ रहा है (Vision Analysis)...', Date.now(), false);
  setTypingIndicator(true);
  scrollToBottom();

  try {
    const smartPrompt = await buildVisionEditedPrompt(imageDataUrl, instruction);
    assistantBubble.innerHTML = `🎨 Step 2/2: आपके प्रॉम्प्ट के हिसाब से नई एडिटेड फोटो बनाई जा रही है...<br><small style="color:var(--text2)">Prompt: ${escapeHtml(smartPrompt)}</small>`;

    const finalImgUrl = await generateImageWithFallback(smartPrompt, 'flux', 768, 768);
    const mdContent = `**🪄 AI Edited Photo:** \`${instruction}\`\n\n![Edited Photo](${finalImgUrl})\n\n*AI Vision Prompt Used:* _${smartPrompt}_`;

    const msgDiv = assistantBubble.closest('.message');
    const finalBubble = renderMessage('assistant', mdContent, Date.now(), false, {
      imageUrl: finalImgUrl,
      imagePrompt: smartPrompt
    });
    msgDiv.replaceWith(finalBubble.closest('.message'));

    state.conversation.push({ role: 'assistant', content: mdContent, timestamp: Date.now() });
    saveCurrentChat();
    showToast('Photo Edited Successfully!', 'success');
  } catch (err) {
    assistantBubble.innerHTML = `<span style="color:var(--danger);">❌ Photo Edit Error: ${escapeHtml(err.message)}</span>`;
  } finally {
    setTypingIndicator(false);
    scrollToBottom();
  }
}

async function handleChatImageGeneration(rawPrompt) {
  if (!state.activeChatId) createNewChat();
  const cleanPrompt = rawPrompt.replace(/^(\/image|\/img)\s*/i, '').trim();
  if (!cleanPrompt) { openStudioModal(); return; }

  // If user has attached a gallery photo, edit that photo instead of generating blind!
  if (state.attachedImageDataUrl) {
    await handleGalleryPhotoAiEditInChat(state.attachedImageDataUrl, cleanPrompt);
    return;
  }

  const userText = `🎨 Create Image: ${cleanPrompt}`;
  state.conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
  renderMessage('user', userText, Date.now());

  const assistantBubble = renderMessage('assistant', '🎨 Generating high-resolution AI image...', Date.now(), false);
  setTypingIndicator(true);
  scrollToBottom();

  try {
    const imgUrl = await generateImageWithFallback(cleanPrompt, 'flux', 768, 768);
    const mdContent = `**🎨 Generated Image:** \`${cleanPrompt}\`\n\n![${cleanPrompt}](${imgUrl})`;
    const msgDiv = assistantBubble.closest('.message');
    const finalBubble = renderMessage('assistant', mdContent, Date.now(), false, {
      imageUrl: imgUrl,
      imagePrompt: cleanPrompt
    });
    msgDiv.replaceWith(finalBubble.closest('.message'));

    state.conversation.push({ role: 'assistant', content: mdContent, timestamp: Date.now() });
    saveCurrentChat();
  } catch (err) {
    assistantBubble.innerHTML = `<span style="color:var(--danger);">❌ ${escapeHtml(err.message)}</span>`;
  } finally {
    setTypingIndicator(false);
    scrollToBottom();
  }
}

// ==================== REAL LIVE WEB SEARCH (JINA + WIKIPEDIA) ====================
async function fetchLiveWebSearchContext(query) {
  const results = [];

  // 1. DuckDuckGo Live Scraper via Jina Reader (CORS-free)
  try {
    const ddgUrl = `https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(ddgUrl, { headers: { 'Accept': 'text/plain' } });
    if (resp.ok) {
      const text = await resp.text();
      if (text && text.length > 100) {
        results.push(`--- LIVE WEB SEARCH RESULTS FOR "${query}" ---\n${text.substring(0, 3500)}`);
      }
    }
  } catch (e) {}

  // 2. Wikipedia Instant Search Fallback
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
    const wResp = await fetch(wikiUrl);
    if (wResp.ok) {
      const wData = await wResp.json();
      const snippets = (wData?.query?.search || []).slice(0, 3).map(s =>
        `- ${s.title}: ${s.snippet.replace(/<[^>]+>/g, '')} (https://en.wikipedia.org/wiki/${encodeURIComponent(s.title)})`
      ).join('\n');
      if (snippets) results.push(`--- WIKIPEDIA RESULTS ---\n${snippets}`);
    }
  } catch (e) {}

  return results.join('\n\n');
}

// ==================== POLLINATIONS POST v2 + AUTO-FAILOVER ====================
async function callAiWithFailover(messages, model, onChunk) {
  // If Pollinations model selected, use POST JSON endpoint (prevents 404 URL length error!)
  if (model.startsWith('pollinations/')) {
    const subModel = model.replace('pollinations/', '') || 'openai';
    try {
      const response = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          model: subModel,
          seed: Math.floor(Math.random() * 100000)
        })
      });
      if (response.ok) {
        const text = await response.text();
        if (text && !text.includes('404 Not Found')) {
          onChunk(text);
          return text;
        }
      }
    } catch (e) {}
  }

  // Primary / Failover: Puter.js Cloud AI
  if (typeof puter !== 'undefined' && puter.ai?.chat) {
    const puterModel = model.startsWith('pollinations/') ? 'gpt-4o-mini' : model;
    try {
      let accumulated = '';
      const stream = await puter.ai.chat(messages, { model: puterModel, stream: true });
      for await (const part of stream) {
        if (state.stopFlag) break;
        if (part?.text) {
          accumulated += part.text;
          onChunk(accumulated);
        }
      }
      if (accumulated) return accumulated;
    } catch (err) {
      // Non-streaming fallback with gpt-4o-mini
      const fallbackResp = await puter.ai.chat(messages, { model: 'gpt-4o-mini' });
      const text = typeof fallbackResp === 'string' ? fallbackResp : (fallbackResp?.message?.content || String(fallbackResp));
      onChunk(text);
      return text;
    }
  }

  throw new Error('All AI endpoints are unreachable right now. Check your internet connection.');
}

// ==================== MAIN SEND MESSAGE ====================
async function sendMessage() {
  let text = DOM.userInput.value.trim();
  if ((!text && !state.attachedImageDataUrl) || state.busy) return;
  if (!state.activeChatId) createNewChat();

  // Check if user wants to generate an image
  if (/^(\/image|\/img|generate image:?|create image:?)\s+/i.test(text)) {
    const cleanPrompt = text.replace(/^(\/image|\/img|generate image:?|create image:?)\s+/i, '');
    DOM.userInput.value = '';
    await handleChatImageGeneration(cleanPrompt);
    return;
  }

  // Check if user uploaded a photo AND asked to edit/modify/convert it in chat!
  const isPhotoEditRequest = state.attachedImageDataUrl && /(edit|change|modify|convert|make|banao|bna|badal|add|remove|style|anime|cyberpunk|background|bg|filter|dress|glasses)/i.test(text);
  if (isPhotoEditRequest) {
    const imgData = state.attachedImageDataUrl;
    DOM.userInput.value = '';
    await handleGalleryPhotoAiEditInChat(imgData, text);
    return;
  }

  const useWeb = state.webSearchEnabled || text.startsWith('/web ');
  if (text.startsWith('/web ')) text = text.replace(/^\/web\s+/i, '').trim();

  const currentAttachment = state.attachedImageDataUrl;
  clearAttachment();

  const displayUserText = text || 'इस फोटो को ध्यान से देखकर इसके बारे में पूरी जानकारी दो।';
  state.conversation.push({ role: 'user', content: displayUserText, timestamp: Date.now() });
  renderMessage('user', displayUserText, Date.now(), true, { attachedImage: currentAttachment });

  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';

  const assistantBubble = renderMessage('assistant', '🐬 Thinking...', Date.now(), false);
  state.stopFlag = false;
  state.busy = true;
  updateSendButton(true);
  setTypingIndicator(true);
  scrollToBottom();

  try {
    let fullText = '';

    // Case 1: Image Attached for AI Vision Q&A
    if (currentAttachment && typeof puter !== 'undefined' && puter.ai?.chat) {
      assistantBubble.innerHTML = '👁️ Analyzing your photo with AI Vision...';
      const visionResp = await puter.ai.chat(displayUserText, currentAttachment, { model: 'gpt-4o-mini' });
      fullText = typeof visionResp === 'string' ? visionResp : (visionResp?.message?.content || String(visionResp));
    } else {
      // Case 2: Live Web Search Context Injection
      let messages = [{ role: 'system', content: state.systemPrompt }, ...state.conversation.slice(-10)];
      if (useWeb) {
        assistantBubble.innerHTML = '🌐 Searching live internet...';
        const webContext = await fetchLiveWebSearchContext(displayUserText);
        if (webContext) {
          messages.push({
            role: 'system',
            content: `Use the following real-time internet search results to answer the user's question accurately. Include clickable markdown links where relevant:\n\n${webContext}`
          });
        }
      }

      fullText = await callAiWithFailover(messages, state.currentModel, partial => {
        assistantBubble.innerHTML = marked.parse(partial || '');
        scrollToBottom();
      });
    }

    const msgDiv = assistantBubble.closest('.message');
    const finalBubble = renderMessage('assistant', fullText, Date.now(), false);
    msgDiv.replaceWith(finalBubble.closest('.message'));
    if (fullText) state.conversation.push({ role: 'assistant', content: fullText, timestamp: Date.now() });
  } catch (e) {
    assistantBubble.innerHTML = `<span style="color:var(--danger);">❌ Error: ${escapeHtml(e.message)}</span>`;
  } finally {
    state.busy = false;
    updateSendButton(false);
    setTypingIndicator(false);
    saveCurrentChat();
    renderSidebar();
    updateHeaderTitle();
    updateTokenCount();
    scrollToBottom();
  }
}

// ==================== STUDIO MODAL (GALLERY PHOTO AI EDIT & FILTERS) ====================
function initPlaceholderCanvas() {
  const ctx = DOM.editorCanvas.getContext('2d');
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, DOM.editorCanvas.width, DOM.editorCanvas.height);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📂 Upload Gallery Photo or ✨ Create with AI', DOM.editorCanvas.width / 2, DOM.editorCanvas.height / 2);
}

function openStudioModal(imageUrl = null, promptText = '') {
  DOM.studioModal.classList.add('open');
  if (promptText) DOM.studioPromptInput.value = promptText;
  if (imageUrl) loadStudioImageFromUrl(imageUrl, promptText);
}

function closeStudioModal() { DOM.studioModal.classList.remove('open'); }

async function loadStudioImageFromUrl(url, promptText = '') {
  setStudioLoading(true, 'Loading image into studio...');
  try {
    const img = await loadImageElement(url);
    state.editor.baseImage = img;
    state.editor.baseDataUrl = url.startsWith('data:') ? url : null;
    if (promptText) state.editor.currentPrompt = promptText;
    resetEditorAdjustments(false);
    renderEditorCanvas();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setStudioLoading(false);
  }
}

function resetEditorAdjustments(redraw = true) {
  state.editor.rotation = 0;
  state.editor.flipH = 1;
  state.editor.flipV = 1;
  state.editor.filters = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0 };
  state.editor.texts = [];
  ['Brightness','Contrast','Saturation'].forEach(k => document.getElementById('filter'+k).value = 100);
  ['Hue','Blur','Sepia'].forEach(k => document.getElementById('filter'+k).value = 0);
  if (redraw) renderEditorCanvas();
}

function renderEditorCanvas() {
  const img = state.editor.baseImage;
  if (!img) return;
  const canvas = DOM.editorCanvas;
  const ctx = canvas.getContext('2d');

  const isRotated90 = Math.abs(state.editor.rotation) % 180 === 90;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  canvas.width = isRotated90 ? h : w;
  canvas.height = isRotated90 ? w : h;

  const f = state.editor.filters;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) hue-rotate(${f.hue}deg) blur(${f.blur}px) sepia(${f.sepia}%)`;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((state.editor.rotation * Math.PI) / 180);
  ctx.scale(state.editor.flipH, state.editor.flipV);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  state.editor.texts.forEach(item => {
    ctx.save();
    const fontSize = Math.max(26, Math.round(canvas.width * 0.055));
    ctx.font = `800 ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = item.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = Math.max(4, Math.round(fontSize / 9));
    ctx.textAlign = 'center';
    ctx.strokeText(item.text, canvas.width / 2, item.y);
    ctx.fillText(item.text, canvas.width / 2, item.y);
    ctx.restore();
  });
}

function setStudioLoading(show, text = 'Working...') {
  DOM.studioLoading.style.display = show ? 'flex' : 'none';
  DOM.studioLoadingText.textContent = text;
}

async function runStudioAiRemix(customInstruction = null) {
  const instruction = customInstruction || DOM.studioPromptInput.value.trim();
  if (!instruction) {
    showToast('पहले प्रॉम्प्ट बॉक्स में लिखें कि फोटो में क्या बदलना है!', 'error');
    return;
  }

  setStudioLoading(true, '👁️ AI आपकी फोटो को देखकर आपके प्रॉम्प्ट के हिसाब से एडिट कर रहा है...');
  try {
    let finalPrompt = instruction;
    // If there is an image on canvas, use AI Vision to analyze it first!
    if (state.editor.baseImage) {
      const currentCanvasDataUrl = DOM.editorCanvas.toDataURL('image/jpeg', 0.85);
      finalPrompt = await buildVisionEditedPrompt(currentCanvasDataUrl, instruction);
    }
    DOM.studioLoadingText.textContent = '🎨 Rendering edited photo...';
    const [w, h] = DOM.studioRatioSelect.value.split('x').map(Number);
    const model = DOM.studioModelSelect.value;
    const newUrl = await generateImageWithFallback(finalPrompt, model, w, h);
    await loadStudioImageFromUrl(newUrl, finalPrompt);
    showToast('✨ Photo AI Edited!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setStudioLoading(false);
  }
}

function setupStudioEvents() {
  // Studio Tabs
  document.querySelectorAll('.studio-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.studio-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('headerStudioBtn').addEventListener('click', () => openStudioModal());
  document.getElementById('openStudioSidebarBtn').addEventListener('click', () => {
    if (window.innerWidth <= 768) closeSidebar();
    openStudioModal();
  });
  document.getElementById('closeStudioBtn').addEventListener('click', closeStudioModal);

  // Upload from Gallery into Studio
  document.getElementById('triggerUploadBtn').addEventListener('click', () => DOM.uploadImageInput.click());
  DOM.uploadImageInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        state.editor.baseImage = img;
        state.editor.baseDataUrl = ev.target.result;
        resetEditorAdjustments(false);
        renderEditorCanvas();
        showToast('Photo loaded! Now write prompt & click "🪄 AI Edit Current Photo"', 'success');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Create New Image
  document.getElementById('studioGenerateBtn').addEventListener('click', async () => {
    const promptText = DOM.studioPromptInput.value.trim();
    if (!promptText) return showToast('Enter a prompt first!', 'error');
    setStudioLoading(true, '✨ Generating new image...');
    try {
      const [w, h] = DOM.studioRatioSelect.value.split('x').map(Number);
      const url = await generateImageWithFallback(promptText, DOM.studioModelSelect.value, w, h);
      await loadStudioImageFromUrl(url, promptText);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setStudioLoading(false);
    }
  });

  // AI Edit Current Gallery Photo
  document.getElementById('studioAiRemixBtn').addEventListener('click', () => runStudioAiRemix());

  // 1-Click AI Style Presets
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      DOM.studioPromptInput.value = chip.dataset.style;
      runStudioAiRemix(chip.dataset.style);
    });
  });

  // Live Sliders
  const sliderMap = {
    filterBrightness: 'brightness', filterContrast: 'contrast', filterSaturation: 'saturation',
    filterHue: 'hue', filterBlur: 'blur', filterSepia: 'sepia'
  };
  Object.entries(sliderMap).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('input', e => {
      state.editor.filters[key] = parseFloat(e.target.value);
      renderEditorCanvas();
    });
  });

  document.getElementById('rotateImgBtn').addEventListener('click', () => { state.editor.rotation = (state.editor.rotation + 90) % 360; renderEditorCanvas(); });
  document.getElementById('flipHImgBtn').addEventListener('click', () => { state.editor.flipH *= -1; renderEditorCanvas(); });
  document.getElementById('flipVImgBtn').addEventListener('click', () => { state.editor.flipV *= -1; renderEditorCanvas(); });
  document.getElementById('resetFiltersBtn').addEventListener('click', () => resetEditorAdjustments(true));

  document.getElementById('addTextOverlayBtn').addEventListener('click', () => {
    const txtInput = document.getElementById('overlayTextInput');
    const colorInput = document.getElementById('overlayColorInput');
    const text = txtInput.value.trim();
    if (!text || !state.editor.baseImage) return showToast('Load a photo and enter text first!', 'error');
    const yPos = state.editor.texts.length === 0
      ? DOM.editorCanvas.height - Math.round(DOM.editorCanvas.height * 0.08)
      : Math.round(DOM.editorCanvas.height * 0.12) * (state.editor.texts.length + 1);
    state.editor.texts.push({ text, color: colorInput.value, y: yPos });
    txtInput.value = '';
    renderEditorCanvas();
  });

  document.getElementById('downloadStudioImgBtn').addEventListener('click', () => {
    if (!state.editor.baseImage) return showToast('No image to save!', 'error');
    const a = document.createElement('a');
    a.href = DOM.editorCanvas.toDataURL('image/png');
    a.download = `dolphin-photo-${Date.now()}.png`;
    a.click();
  });

  document.getElementById('sendToChatStudioBtn').addEventListener('click', () => {
    if (!state.editor.baseImage) return showToast('No image on canvas!', 'error');
    if (!state.activeChatId) createNewChat();
    const dataUrl = DOM.editorCanvas.toDataURL('image/png');
    const caption = DOM.studioPromptInput.value.trim() || 'Studio Edited Photo';
    const md = `**🖼️ Studio Photo:** \`${caption}\`\n\n![Edited](${dataUrl})`;
    renderMessage('assistant', md, Date.now(), true, { imageUrl: dataUrl, imagePrompt: caption });
    state.conversation.push({ role: 'assistant', content: md, timestamp: Date.now() });
    saveCurrentChat();
    closeStudioModal();
    scrollToBottom();
  });
}

// ==================== EXTRA SMART TOOLS (OCR, ENHANCE, URL READER, FILE UPLOAD) ====================
function setupExtraTools() {
  // Attach Photo from Gallery
  document.getElementById('attachImgBtn').addEventListener('click', () => DOM.chatImageUpload.click());
  document.getElementById('triggerVisionSidebarBtn').addEventListener('click', () => {
    if (window.innerWidth <= 768) closeSidebar();
    DOM.chatImageUpload.click();
  });

  DOM.chatImageUpload.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      state.attachedImageDataUrl = ev.target.result;
      DOM.attachedImgThumb.src = state.attachedImageDataUrl;
      DOM.attachmentBar.style.display = 'flex';
      DOM.userInput.placeholder = 'बताइये इस फोटो में क्या एडिट करना है या क्या पूछना है...';
      DOM.userInput.focus();
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('removeAttachmentBtn').addEventListener('click', clearAttachment);

  // 1-Click AI Edit Photo from Attachment Bar
  document.getElementById('aiEditAttachedBtn').addEventListener('click', async () => {
    if (!state.attachedImageDataUrl) return;
    const typed = DOM.userInput.value.trim();
    DOM.userInput.value = '';
    await handleGalleryPhotoAiEditInChat(state.attachedImageDataUrl, typed);
  });

  // OCR Text Extraction
  document.getElementById('extractOcrBtn').addEventListener('click', async () => {
    if (!state.attachedImageDataUrl) return;
    const imgData = state.attachedImageDataUrl;
    clearAttachment();
    if (!state.activeChatId) createNewChat();
    renderMessage('user', '🔍 Extract text (OCR) from this image', Date.now(), true, { attachedImage: imgData });
    const bubble = renderMessage('assistant', '🔍 Reading text from image...', Date.now(), false);
    try {
      const txt = await puter.ai.img2txt(imgData);
      const out = txt?.trim() ? `**🔍 Extracted Text:**\n\n\`\`\`text\n${txt.trim()}\n\`\`\`` : 'No text found in image.';
      bubble.innerHTML = marked.parse(out);
      state.conversation.push({ role: 'assistant', content: out, timestamp: Date.now() });
      saveCurrentChat();
    } catch (e) {
      bubble.innerHTML = '❌ OCR failed.';
    }
  });

  document.getElementById('editAttachedInStudioBtn').addEventListener('click', () => {
    if (!state.attachedImageDataUrl) return;
    const url = state.attachedImageDataUrl;
    clearAttachment();
    openStudioModal(url, '');
  });

  // Web Search Toggle
  DOM.webSearchToggleBtn.addEventListener('click', () => {
    state.webSearchEnabled = !state.webSearchEnabled;
    DOM.webSearchToggleBtn.classList.toggle('active-mode', state.webSearchEnabled);
    DOM.webModeBadge.style.display = state.webSearchEnabled ? 'inline-block' : 'none';
    showToast(state.webSearchEnabled ? '🌐 Live Web Search ON' : 'Web Search OFF', 'success');
  });

  // Quick Image Create Button
  document.getElementById('quickImgGenBtn').addEventListener('click', () => {
    const val = DOM.userInput.value.trim();
    if (val) {
      DOM.userInput.value = '';
      handleChatImageGeneration(val);
    } else if (state.attachedImageDataUrl) {
      handleGalleryPhotoAiEditInChat(state.attachedImageDataUrl, '');
    } else {
      const p = prompt('🎨 क्या इमेज बनानी है? (Prompt लिखें):', 'A futuristic Royal Enfield motorcycle on Himachal mountains at sunset, 8k');
      if (p) handleChatImageGeneration(p);
    }
  });

  // ✨ AI Prompt Enhancer
  document.getElementById('enhancePromptBtn').addEventListener('click', async () => {
    const raw = DOM.userInput.value.trim();
    if (!raw) return showToast('पहले बॉक्स में थोड़ा सा प्रॉम्प्ट लिखें!', 'error');
    DOM.userInput.value = '✨ Enhancing your prompt...';
    try {
      const resp = await puter.ai.chat(`Rewrite and enhance this user prompt to make it super detailed, clear, and effective. Output ONLY the improved prompt:\n"${raw}"`, { model: 'gpt-4o-mini' });
      DOM.userInput.value = (typeof resp === 'string' ? resp : resp?.message?.content || raw).trim();
      showToast('✨ Prompt Enhanced!', 'success');
    } catch (e) {
      DOM.userInput.value = raw;
    }
  });

  // 📄 Upload Code / Text File
  document.getElementById('attachDocBtn').addEventListener('click', () => DOM.chatDocUpload.click());
  DOM.chatDocUpload.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target.result.substring(0, 12000);
      DOM.userInput.value = `Here is the file "${file.name}":\n\`\`\`\n${content}\n\`\`\`\nAnalyze or improve this file:`;
      DOM.userInput.focus();
      showToast(`📄 ${file.name} loaded!`, 'success');
    };
    reader.readAsText(file);
  });

  // 🔗 Read Website URL
  document.getElementById('urlSummarySidebarBtn').addEventListener('click', async () => {
    if (window.innerWidth <= 768) closeSidebar();
    const url = prompt('🔗 Enter any Website URL to read & summarize:', 'https://news.ycombinator.com');
    if (!url) return;
    DOM.userInput.value = `/web Summarize and analyze the content of ${url}`;
    sendMessage();
  });

  // 💻 Code Sandbox
  const openSandbox = (code = '') => {
    if (code) DOM.sandboxCodeEditor.value = code;
    else if (!DOM.sandboxCodeEditor.value.trim()) {
      DOM.sandboxCodeEditor.value = `<!DOCTYPE html>\n<html>\n<body style="background:#0b0f19;color:#38bdf8;font-family:sans-serif;text-align:center;padding-top:20%;">\n  <h1>🐬 Dolphin Live Code Runner</h1>\n</body>\n</html>`;
    }
    DOM.sandboxModal.classList.add('open');
    DOM.sandboxFrame.srcdoc = DOM.sandboxCodeEditor.value;
  };
  document.getElementById('openSandboxSidebarBtn').addEventListener('click', () => {
    if (window.innerWidth <= 768) closeSidebar();
    openSandbox();
  });
  document.getElementById('closeSandboxBtn').addEventListener('click', () => DOM.sandboxModal.classList.remove('open'));
  document.getElementById('runSandboxBtn').addEventListener('click', () => {
    DOM.sandboxFrame.srcdoc = DOM.sandboxCodeEditor.value;
  });
  window.openDolphinSandbox = openSandbox;
}

function clearAttachment() {
  state.attachedImageDataUrl = null;
  DOM.chatImageUpload.value = '';
  DOM.attachmentBar.style.display = 'none';
  DOM.userInput.placeholder = 'Ask anything, or upload a photo 📎 and type how to edit it...';
}

// ==================== CHAT UI & MESSAGES ====================
function showEmptyState() {
  DOM.chatInner.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🐬</div>
      <h2>Dolphin AI Ultra</h2>
      <p>Upload Gallery Photo & Edit with Prompt · Live Web Search · Zero 404 Errors</p>

      <div class="hero-cards-grid">
        <div class="hero-card" data-action="vision">
          <span class="hero-card-icon">🪄</span>
          <h4>Edit Gallery Photo</h4>
          <span>गैलरी से अपनी फोटो अपलोड करें और प्रॉम्प्ट लिखकर AI से एडिट करवाएं।</span>
        </div>
        <div class="hero-card" data-action="studio">
          <span class="hero-card-icon">🎨</span>
          <h4>AI Photo Studio</h4>
          <span>1-Click Anime, Cyberpunk, Background Change और Live Filters.</span>
        </div>
        <div class="hero-card" data-prompt="/web Latest tech and cybersecurity news today">
          <span class="hero-card-icon">🌐</span>
          <h4>Live Web Search</h4>
          <span>रियल-टाइम इंटरनेट सर्च और लेटेस्ट जानकारी बिना किसी एरर के।</span>
        </div>
        <div class="hero-card" data-action="sandbox">
          <span class="hero-card-icon">💻</span>
          <h4>Live Code Runner</h4>
          <span>HTML/CSS/JS गेम्स और ऐप्स बनवाकर तुरंत ब्राउज़र में चलाएं।</span>
        </div>
      </div>

      <div class="quick-prompts">
        <span class="quick-prompt" data-prompt="/image cyberpunk samurai standing in neon rain, 8k">🎨 Create Cyberpunk Art</span>
        <span class="quick-prompt" data-prompt="Create a modern responsive Portfolio Website in single-file HTML/CSS/JS">⚡ Build Portfolio Site</span>
        <span class="quick-prompt" data-prompt="/web Top bug bounty programs and tips in 2026">🛡️ Bug Bounty Search</span>
      </div>
    </div>`;

  DOM.chatInner.querySelectorAll('.hero-card, .quick-prompt').forEach(el => {
    el.addEventListener('click', () => {
      const act = el.dataset.action;
      if (act === 'studio') return openStudioModal();
      if (act === 'vision') return DOM.chatImageUpload.click();
      if (act === 'sandbox') return window.openDolphinSandbox();
      if (el.dataset.prompt) {
        DOM.userInput.value = el.dataset.prompt;
        DOM.userInput.focus();
      }
    });
  });
  updateTokenCount();
}

function renderMessage(role, content, timestamp = null, animate = true, meta = null) {
  const empty = document.querySelector('.empty-state');
  if (empty) empty.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  if (role === 'user') {
    const thumbHtml = meta?.attachedImage ? `<img src="${meta.attachedImage}" style="max-height:160px;margin-bottom:8px;border-radius:8px;">` : '';
    msgDiv.innerHTML = `<div class="message-avatar">U</div><div class="message-content"><div class="message-bubble">${thumbHtml}${escapeHtml(content)}</div><div class="message-time">${timeStr}</div></div>`;
  } else {
    msgDiv.innerHTML = `<div class="message-avatar">🐬</div><div class="message-content"><div class="message-bubble">${marked.parse(content || '')}</div><div class="message-time">${timeStr}</div></div>`;
    const bubble = msgDiv.querySelector('.message-bubble');

    bubble.querySelectorAll('pre code').forEach(block => { try { hljs.highlightElement(block); } catch (e) {} });
    bubble.querySelectorAll('pre').forEach(pre => {
      const codeEl = pre.querySelector('code');
      const rawCode = codeEl ? codeEl.textContent : pre.textContent;
      const langClass = codeEl ? [...codeEl.classList].find(c => c.startsWith('language-')) : '';
      const lang = langClass ? langClass.replace('language-', '') : 'code';

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      const header = document.createElement('div');
      header.className = 'code-block-header';
      header.innerHTML = `<span>${escapeHtml(lang.toUpperCase())}</span><div class="code-header-btns"></div>`;

      const btnWrap = header.querySelector('.code-header-btns');
      if (['html', 'xml', 'javascript', 'js'].includes(lang.toLowerCase()) || rawCode.includes('<html')) {
        const runBtn = document.createElement('button');
        runBtn.className = 'code-action-btn run-btn';
        runBtn.innerHTML = '▶ Run Live';
        runBtn.addEventListener('click', () => window.openDolphinSandbox(rawCode));
        btnWrap.appendChild(runBtn);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'code-action-btn';
      copyBtn.innerHTML = '📋 Copy';
      copyBtn.addEventListener('click', () => navigator.clipboard.writeText(rawCode).then(() => showToast('Copied!', 'success')));
      btnWrap.appendChild(copyBtn);

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });

    const imgEl = bubble.querySelector('img');
    if (imgEl) {
      const imgUrl = meta?.imageUrl || imgEl.getAttribute('src');
      const imgPrompt = meta?.imagePrompt || imgEl.getAttribute('alt') || '';
      const cardActions = document.createElement('div');
      cardActions.className = 'chat-image-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'img-card-btn';
      editBtn.innerHTML = '🎛️ Open in Studio';
      editBtn.addEventListener('click', () => openStudioModal(imgUrl, imgPrompt));

      const remixBtn = document.createElement('button');
      remixBtn.className = 'img-card-btn';
      remixBtn.innerHTML = '🪄 Edit Again with Prompt';
      remixBtn.addEventListener('click', () => {
        const mod = prompt('🪄 इस फोटो में आगे क्या बदलाव करना है?', '');
        if (mod) handleGalleryPhotoAiEditInChat(imgUrl, mod);
      });

      const fullBtn = document.createElement('a');
      fullBtn.className = 'img-card-btn';
      fullBtn.href = imgUrl;
      fullBtn.target = '_blank';
      fullBtn.innerHTML = '🔗 Full Size';

      cardActions.append(editBtn, remixBtn, fullBtn);
      bubble.appendChild(cardActions);
    }

    const contentDiv = msgDiv.querySelector('.message-content');
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const speakBtn = document.createElement('button');
    speakBtn.className = 'action-btn';
    speakBtn.innerHTML = '🔊';
    speakBtn.addEventListener('click', () => speakText(content));

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(content); showToast('Copied!', 'success'); });

    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn';
    regenBtn.innerHTML = '🔄';
    regenBtn.addEventListener('click', regenerateResponse);

    actions.append(speakBtn, copyBtn, regenBtn);
    contentDiv.appendChild(actions);
  }

  DOM.chatInner.appendChild(msgDiv);
  return msgDiv.querySelector('.message-bubble');
}

// ==================== TTS, SETTINGS & HELPERS ====================
async function speakText(text) {
  if (state.isSpeaking) {
    if (state.speechSynth) state.speechSynth.cancel();
    if (window.currentPuterAudio) window.currentPuterAudio.pause();
    state.isSpeaking = false;
    return;
  }
  state.isSpeaking = true;
  const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`_~>\[\]\(\)]/g, ' ').trim().substring(0, 1200);
  if (state.usePuterTts && typeof puter !== 'undefined' && puter.ai?.txt2speech) {
    try {
      const audio = await puter.ai.txt2speech(clean);
      window.currentPuterAudio = audio;
      audio.onended = () => { state.isSpeaking = false; };
      await audio.play();
      return;
    } catch (e) {}
  }
  const u = new SpeechSynthesisUtterance(clean);
  u.onend = () => { state.isSpeaking = false; };
  state.speechSynth.speak(u);
}

function regenerateResponse() {
  if (state.conversation.length < 2 || state.busy) return;
  state.conversation.pop();
  const lastUser = state.conversation.pop();
  if (lastUser) {
    DOM.chatInner.lastElementChild?.remove();
    DOM.chatInner.lastElementChild?.remove();
    DOM.userInput.value = lastUser.content;
    sendMessage();
  }
}

function stopGeneration() { state.stopFlag = true; }
function updateSendButton(sending) {
  DOM.sendBtn.classList.toggle('stop-mode', sending);
  DOM.sendBtn.innerHTML = sending ? '⏹' : '↑';
}
function setTypingIndicator(show) { DOM.typingIndicator.style.display = show ? 'inline' : 'none'; }
function scrollToBottom() { DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight; }
function updateHeaderTitle() {
  DOM.headerTitle.textContent = (state.activeChatId && state.conversations[state.activeChatId])
    ? state.conversations[state.activeChatId].title : 'Dolphin AI';
}
function updateTokenCount() {
  let total = 0;
  state.conversation.forEach(m => total += Math.ceil((m.content || '').length / 4));
  DOM.tokenCount.textContent = total.toLocaleString();
}

function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('dolphin_theme', next);
  updateThemeUI();
}
function updateThemeUI() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  document.getElementById('themeIcon').textContent = theme === 'dark' ? '🌙' : '☀️';
  document.getElementById('themeText').textContent = theme === 'dark' ? 'Theme: Dark' : 'Theme: Light';
}

function buildEmojiGrid() {
  DOM.emojiGrid.innerHTML = EMOJIS.map(e => `<span class="emoji-item">${e}</span>`).join('');
  DOM.emojiGrid.addEventListener('click', e => {
    if (e.target.classList.contains('emoji-item')) {
      DOM.userInput.value += e.target.textContent;
      DOM.emojiPopover.classList.remove('open');
      DOM.userInput.focus();
    }
  });
}

function setupVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { DOM.micBtn.style.display = 'none'; return; }
  const rec = new SR();
  rec.lang = 'en-IN';
  let recording = false;
  rec.onstart = () => { recording = true; DOM.micBtn.classList.add('recording'); };
  rec.onend = () => { recording = false; DOM.micBtn.classList.remove('recording'); };
  rec.onresult = e => { DOM.userInput.value = e.results[0][0].transcript; };
  DOM.micBtn.addEventListener('click', () => recording ? rec.stop() : rec.start());
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function setupEventListeners() {
  DOM.userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 110) + 'px';
  });
  DOM.userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 768) {
      e.preventDefault();
      sendMessage();
    }
  });
  DOM.sendBtn.addEventListener('click', () => state.busy ? stopGeneration() : sendMessage());
  DOM.modelSelect.addEventListener('change', function() { state.currentModel = this.value; saveData(); });
  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('closeSidebarBtn').addEventListener('click', closeSidebar);
  DOM.sidebarOverlay.addEventListener('click', closeSidebar);
  document.getElementById('newChatBtn').addEventListener('click', createNewChat);
  document.getElementById('newChatSidebarBtn').addEventListener('click', createNewChat);
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
  document.getElementById('settingsBtn').addEventListener('click', () => DOM.settingsPanel.classList.toggle('open'));
  document.getElementById('applySettingsBtn').addEventListener('click', () => {
    state.systemPrompt = DOM.systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;
    state.usePuterTts = DOM.usePuterTtsCheck.checked;
    DOM.settingsPanel.classList.remove('open');
    saveData();
    showToast('Saved!', 'success');
  });
  document.getElementById('resetSettingsBtn').addEventListener('click', () => {
    state.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    DOM.systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
    saveData();
  });
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.conversation, null, 2)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat-${Date.now()}.json`;
    a.click();
  });
  document.getElementById('exportAllBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.conversations, null, 2)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${Date.now()}.json`;
    a.click();
  });
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (confirm('Clear all history?')) {
      state.conversations = {};
      state.activeChatId = null;
      state.conversation = [];
      saveData();
      renderSidebar();
      showEmptyState();
    }
  });
  DOM.emojiBtn.addEventListener('click', () => DOM.emojiPopover.classList.toggle('open'));
  setupVoiceInput();
}

document.addEventListener('DOMContentLoaded', init);
