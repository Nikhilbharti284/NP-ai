if (typeof puter !== 'undefined') puter.quiet = true;

// ==================== STATE ====================
const state = {
  conversations: {},
  activeChatId: null,
  conversation: [],
  busy: false,
  mode: 'chat', 
  model: 'gpt-4o',
  pyodide: null,
  attachedImage: null,
  systemPrompt: 'You are AGI Ultra, an Artificial General Intelligence. You have deep reasoning, coding mastery, and problem-solving skills. Answer directly. Use markdown. Provide complete code when asked.',
  isListening: false
};

const $ = (id) => document.getElementById(id);

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', async () => {
  loadStorage();
  bindAll();
  setupMarked();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});

function bindAll() {
  // Sidebar & Modals
  $('openSidebar').onclick = () => { $('sidebar').classList.add('open'); $('overlay').classList.add('show'); };
  $('closeSidebar').onclick = closeSidebar;
  $('overlay').onclick = closeSidebar;
  
  $('openAppLauncher').onclick = () => { closeSidebar(); openModal('appLauncherModal'); };
  $('openDeviceTools').onclick = () => { closeSidebar(); openModal('deviceToolsModal'); };
  $('openImageGen').onclick = () => { closeSidebar(); setMode('image'); };
  $('openVideoGen').onclick = () => { closeSidebar(); setMode('video'); };
  $('openPython').onclick = () => { closeSidebar(); openModal('pythonModal'); };
  $('openSettings').onclick = () => { $('systemPrompt').value = state.systemPrompt; openModal('settingsModal'); };
  
  document.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => closeModal(btn.dataset.close));

  // Theme Toggle
  $('themeToggle').onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    $('themeToggle').innerHTML = next === 'light' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('agi_theme', next);
  };
  const savedTheme = localStorage.getItem('agi_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    $('themeToggle').innerHTML = savedTheme === 'light' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  }

  // Settings Save
  $('saveSettings').onclick = () => {
    state.systemPrompt = $('systemPrompt').value.trim() || state.systemPrompt;
    closeModal('settingsModal');
    toast('Settings saved!');
  };

  // Quick actions
  document.querySelectorAll('.quick-card').forEach(card => {
    card.onclick = () => {
      const a = card.dataset.action;
      if (a === 'image') setMode('image');
      else if (a === 'video') setMode('video');
      else if (a === 'apps') openModal('appLauncherModal');
      else if (a === 'python') openModal('pythonModal');
    };
  });

  // Model Selector
  $('modelSelect').onchange = (e) => {
    state.model = e.target.value;
    toast('Switched to ' + e.target.options[e.target.selectedIndex].text);
  };

  // Composer
  $('input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('sendBtn').onclick = send;
  $('modeImage').onclick = () => setMode(state.mode === 'image' ? 'chat' : 'image');
  $('modeVideo').onclick = () => setMode(state.mode === 'video' ? 'chat' : 'video');

  // Image Upload
  $('uploadBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.attachedImage = ev.target.result;
      $('attachImg').src = state.attachedImage;
      $('attachPreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
  };
  $('removeAttach').onclick = () => {
    state.attachedImage = null;
    $('attachPreview').style.display = 'none';
    $('fileInput').value = '';
  };

  // Voice Input
  $('micBtn').onclick = toggleVoiceInput;

  // New chat & Clear
  $('newChatTop').onclick = newChat;
  $('clearChats').onclick = () => {
    if (!confirm('Clear all chat history?')) return;
    state.conversations = {}; state.activeChatId = null; state.conversation = [];
    saveStorage(); renderHistory(); newChat(); toast('All chats cleared');
  };

  // Device Tools
  $('vibrateBtn').onclick = () => {
    if (navigator.vibrate) { navigator.vibrate([200, 100, 200]); showToolOutput('Device vibrated successfully'); } 
    else showToolOutput('Vibration not supported');
  };
  $('shareBtn').onclick = () => {
    if (navigator.share) navigator.share({ title: 'AGI Ultra Studio', url: window.location.href }).catch(()=>{});
    else showToolOutput('Share not supported');
  };
  $('batteryBtn').onclick = async () => {
    if (navigator.getBattery) { const b = await navigator.getBattery(); showToolOutput(`Battery: ${Math.round(b.level * 100)}% ${b.charging ? '(Charging)' : ''}`); } 
    else showToolOutput('Battery API not supported');
  };

  // Python
  $('pythonRunBtn').onclick = runPython;
  $('pythonInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runPython(); } });
}

// ==================== SPEECH (VOICE) API ====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'hi-IN';

  recognition.onstart = () => {
    state.isListening = true;
    $('micBtn').classList.add('recording');
    toast('Listening...');
  };
  recognition.onend = () => {
    state.isListening = false;
    $('micBtn').classList.remove('recording');
  };
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    $('input').value = text;
    $('input').style.height = 'auto';
  };
} else {
  $('micBtn').style.display = 'none';
}

function toggleVoiceInput() {
  if (!recognition) return toast('Voice not supported');
  if (state.isListening) recognition.stop();
  else recognition.start();
}

function speakText(text) {
  if (!window.speechSynthesis) return toast('TTS not supported');
  window.speechSynthesis.cancel();
  const clean = text.replace(/```[\s\S]*?```/g, 'Code block omitted').replace(/[#*`_~>\[\]\(\)]/g, ' ');
  const utt = new SpeechSynthesisUtterance(clean);
  utt.lang = /[\u0900-\u097F]/.test(clean) ? 'hi-IN' : 'en-US';
  window.speechSynthesis.speak(utt);
}

// ==================== MARKED.JS CUSTOM RENDERER ====================
function setupMarked() {
  if (typeof marked === 'undefined') return;
  const renderer = new marked.Renderer();
  renderer.code = function(code, lang) {
    const validLang = lang || 'code';
    return `
      <div class="code-block">
        <div class="code-header">
          <span>${validLang.toUpperCase()}</span>
          <button class="copy-btn" onclick="copyCode(this)">📋 Copy</button>
        </div>
        <pre><code class="language-${validLang}">${escapeHtml(code)}</code></pre>
      </div>`;
  };
  marked.setOptions({ renderer: renderer, breaks: true, gfm: true });
}

window.copyCode = function(btn) {
  const code = btn.closest('.code-block').querySelector('code').innerText;
  navigator.clipboard.writeText(code).then(() => {
    btn.innerText = '✅ Copied!'; setTimeout(() => btn.innerText = '📋 Copy', 2000);
  });
};

// ==================== MAIN SEND ====================
async function send() {
  const text = $('input').value.trim();
  const hasImage = !!state.attachedImage;
  if ((!text && !hasImage) || state.busy) return;

  if (!state.activeChatId) newChat();
  
  const userMsg = text || "Analyze this image";
  const imgToSend = state.attachedImage;
  
  // Clear UI
  $('input').value = ''; $('input').style.height = 'auto';
  state.attachedImage = null; $('attachPreview').style.display = 'none'; $('fileInput').value = '';

  state.busy = true; $('sendBtn').innerHTML = '<i class="fa-solid fa-stop"></i>'; $('sendBtn').style.background = 'var(--danger)';

  appendUser(userMsg, imgToSend);
  state.conversation.push({ role: 'user', content: userMsg });

  try {
    const detectImage = /(generate|create|draw|make).*(image|photo|picture)|image banao|photo banao|फोटो बनाओ|इमेज बनाओ/i.test(text);
    const detectVideo = /(generate|create|make).*(video|movie|reel)|video banao|movie banao|वीडियो बनाओ/i.test(text);

    if (imgToSend) {
      await chatReplyWithImage(text, imgToSend);
    } else if (state.mode === 'image' || detectImage) {
      await generateImage(text);
    } else if (state.mode === 'video' || detectVideo) {
      await generateVideo(text);
    } else {
      await chatReply(text);
    }
  } catch (e) {
    appendAI(`<span style="color:#ef4444">Error: ${escapeHtml(e.message)}</span>`);
  } finally {
    state.busy = false; $('sendBtn').innerHTML = '<i class="fa-solid fa-arrow-up"></i>'; $('sendBtn').style.background = '';
    saveStorage(); renderHistory();
  }
}

// ==================== AI ENGINES ====================
async function chatReply(userText) {
  const bubble = appendAI('<div class="loader"><span></span><span></span><span></span></div>');
  const messages = [{ role: 'system', content: state.systemPrompt }, ...state.conversation.slice(-6)];
  let full = '';

  try {
    if (typeof puter !== 'undefined' && puter.ai?.chat) {
      const stream = await puter.ai.chat(messages, { model: state.model, stream: true });
      for await (const part of stream) {
        const chunk = part?.text || part?.message?.content || (typeof part === 'string' ? part : '');
        if (chunk) { full += chunk; bubble.innerHTML = marked.parse(full); scrollBottom(); }
      }
      if (full) {
        bubble.innerHTML = marked.parse(full);
        if (window.hljs) bubble.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
        bubble.innerHTML += `<button class="speak-msg-btn" onclick="speakText(\`${escapeHtml(full).replace(/`/g, '\\`')}\`)"><i class="fa-solid fa-volume-high"></i> Listen</button>`;
        state.conversation.push({ role: 'assistant', content: full });
        return;
      }
    }
  } catch (e) {}

  // Fallback
  try {
    const res = await fetch('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai', messages }) });
    const data = await res.json(); full = data.choices[0].message.content;
    bubble.innerHTML = marked.parse(full);
    if (window.hljs) bubble.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    bubble.innerHTML += `<button class="speak-msg-btn" onclick="speakText(\`${escapeHtml(full).replace(/`/g, '\\`')}\`)"><i class="fa-solid fa-volume-high"></i> Listen</button>`;
    state.conversation.push({ role: 'assistant', content: full });
  } catch (e) {
    bubble.innerHTML = '<span style="color:#ef4444">Failed to get response.</span>';
  }
}

async function chatReplyWithImage(text, base64) {
  const bubble = appendAI('<div class="loader"><span></span><span></span><span></span></div>');
  try {
    // Try Puter Vision (GPT-4o)
    if (typeof puter !== 'undefined' && puter.ai?.chat) {
      const resp = await puter.ai.chat(text, base64, { model: 'gpt-4o-mini' });
      const pText = typeof resp === 'string' ? resp : (resp?.message?.content || '');
      if (pText) {
        bubble.innerHTML = marked.parse(pText);
        bubble.innerHTML += `<button class="speak-msg-btn" onclick="speakText(\`${escapeHtml(pText).replace(/`/g, '\\`')}\`)"><i class="fa-solid fa-volume-high"></i> Listen</button>`;
        state.conversation.push({ role: 'assistant', content: pText });
        return;
      }
    }
  } catch(e) {}
  bubble.innerHTML = '<span style="color:#ef4444">Vision API failed. Try again.</span>';
}

async function generateImage(prompt) {
  const bubble = appendAI(`<div class="loader"><span></span><span></span><span></span></div><div style="font-size:12px;color:var(--text-dim);margin-top:8px;">🎨 Generating image...</div>`);
  let url = '';
  
  try {
    if (typeof puter !== 'undefined' && puter.ai?.txt2img) {
      const img = await puter.ai.txt2img(prompt);
      if (img?.src) url = img.src;
    }
  } catch (e) {}

  if (!url) url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${Date.now()}`;
  const dataUrl = await preloadImage(url);
  
  if (!dataUrl) { bubble.innerHTML = '<span style="color:#ef4444">Image gen failed. Server busy.</span>'; return; }
  
  bubble.innerHTML = `<img src="${dataUrl}" alt="Generated"><a href="${dataUrl}" download="agi-${Date.now()}.jpg" class="download-btn"><i class="fa-solid fa-download"></i> Download</a>`;
  state.conversation.push({ role: 'assistant', content: `[Generated image: ${prompt}]` });
}

async function generateVideo(prompt) {
  // Video logic (same as previous working version)
  const bubble = appendAI(`<div class="video-card"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;"><strong>🎬 Creating movie...</strong><span id="vpct">5%</span></div><div class="video-progress"><div class="video-progress-fill" id="vfill" style="width:5%"></div></div><div class="video-log" id="vlog">Writing script...</div><div id="vstage" style="display:none;margin-top:10px;"><canvas id="vcanvas" width="854" height="480" style="width:100%;border-radius:12px;"></canvas></div></div>`);
  const update = (pct, msg) => { const f = bubble.querySelector('#vfill'); const p = bubble.querySelector('#vpct'); const l = bubble.querySelector('#vlog'); if (f) f.style.width = pct + '%'; if (p) p.textContent = pct + '%'; if (l) l.textContent = msg; scrollBottom(); };
  
  update(10, 'Writing 3-scene script...');
  let scenes = [];
  try {
    const res = await fetch('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: `Create 3 cinematic scenes for: "${prompt}". Return ONLY JSON array of 3 objects with "visual" and "subtitle".` }] }) });
    const data = await res.json(); const match = data.choices[0].message.content.match(/\[[\s\S]*\]/); if (match) scenes = JSON.parse(match[0]);
  } catch (e) {}
  if (!scenes.length) scenes = [{ visual: `Cinematic shot of ${prompt}, 4k`, subtitle: prompt }, { visual: `Action shot of ${prompt}`, subtitle: 'A twist appears...' }, { visual: `Finale of ${prompt}`, subtitle: 'The end.' }];

  update(25, 'Loading scene frames...');
  const loadedImgs = [];
  for (let i = 0; i < scenes.length; i++) {
    update(25 + Math.round(((i + 1) / scenes.length) * 45), `Rendering scene ${i + 1}/${scenes.length}...`);
    let img = null;
    try { if (typeof puter !== 'undefined' && puter.ai?.txt2img) { const pImg = await puter.ai.txt2img(scenes[i].visual); if (pImg?.src) img = await loadImageElement(pImg.src); } } catch (e) {}
    if (!img) { const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(scenes[i].visual)}?width=854&height=480&nologo=true&seed=${Math.random()}`; img = await loadImageElement(imgUrl); }
    if (!img) { const c = document.createElement('canvas'); c.width=854; c.height=480; const cx = c.getContext('2d'); cx.fillStyle='#111827'; cx.fillRect(0,0,854,480); img = c; }
    loadedImgs.push({ img, sub: scenes[i].subtitle });
  }

  update(75, 'Encoding video with effects...');
  const stage = bubble.querySelector('#vstage'); stage.style.display = 'block';
  const canvas = bubble.querySelector('#vcanvas'); const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30); const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data); rec.start();
  const fps = 30; const framesPer = Math.round(fps * 3); const total = loadedImgs.length * framesPer;

  for (let f = 0; f < total; f++) {
    const idx = Math.min(loadedImgs.length - 1, Math.floor(f / framesPer)); const prog = (f % framesPer) / framesPer;
    const zoom = 1 + prog * 0.12; const panX = (idx % 2 === 0 ? -1 : 1) * prog * 20;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 854, 480);
    ctx.save(); ctx.translate(427 + panX, 240); ctx.scale(zoom, zoom); ctx.drawImage(loadedImgs[idx].img, -427, -240, 854, 480); ctx.restore();
    if (loadedImgs[idx].sub) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(50, 400, 754, 50); ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(loadedImgs[idx].sub, 427, 432); }
    await new Promise(r => setTimeout(r, 1000 / fps));
  }

  rec.stop(); await new Promise(r => { rec.onstop = r; });
  const blob = new Blob(chunks, { type: 'video/webm' }); const videoUrl = URL.createObjectURL(blob);
  stage.innerHTML = `<video src="${videoUrl}" controls autoplay loop style="width:100%;border-radius:12px;"></video>`;
  update(100, '✅ Video ready!');
  bubble.innerHTML += `<a href="${videoUrl}" download="agi-video-${Date.now()}.webm" class="download-btn"><i class="fa-solid fa-download"></i> Download Video</a>`;
  state.conversation.push({ role: 'assistant', content: `[Generated video: ${prompt}]` });
}

// ==================== HELPERS & UI ====================
function setMode(mode) {
  state.mode = mode;
  $('modeImage').classList.toggle('active', mode === 'image');
  $('modeVideo').classList.toggle('active', mode === 'video');
  $('input').placeholder = mode === 'image' ? 'Describe the image...' : (mode === 'video' ? 'Describe the video...' : 'Ask AGI anything...');
  $('input').focus();
}

function loadImageElement(url) { return new Promise((resolve) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => resolve(null); setTimeout(() => resolve(null), 15000); img.src = url; }); }
function preloadImage(url) { return new Promise((resolve) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { try { const canvas = document.createElement('canvas'); const maxDim = 800; let w = img.naturalWidth, h = img.naturalHeight; if (w > maxDim || h > maxDim) { if (w > h) { h = (h * maxDim) / w; w = maxDim; } else { w = (w * maxDim) / h; h = maxDim; } } canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h); resolve(canvas.toDataURL('image/jpeg', 0.9)); } catch (e) { resolve(url); } }; img.onerror = () => resolve(null); setTimeout(() => resolve(null), 20000); img.src = url; }); }

function appendUser(text, img = null) { showMessages(); const row = document.createElement('div'); row.className = 'msg user'; row.innerHTML = `<div class="bubble">${img ? `<img src="${img}">` : ''}${escapeHtml(text)}</div>`; $('messages').appendChild(row); scrollBottom(); }
function appendAI(html) { showMessages(); const row = document.createElement('div'); row.className = 'msg ai'; row.innerHTML = `<div class="avatar"><i class="fa-solid fa-brain"></i></div><div class="bubble">${html}</div>`; $('messages').appendChild(row); scrollBottom(); return row.querySelector('.bubble'); }
function showMessages() { $('welcome').style.display = 'none'; $('messages').classList.add('active'); }
function scrollBottom() { $('chatArea').scrollTop = $('chatArea').scrollHeight; }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function openModal(id) { $(id).classList.add('open'); } function closeModal(id) { $(id).classList.remove('open'); } function closeSidebar() { $('sidebar').classList.remove('open'); $('overlay').classList.remove('show'); } function showToolOutput(msg) { const el = $('toolOutput'); el.style.display = 'block'; el.textContent = msg; }

// ==================== STORAGE & HISTORY ====================
function newChat() { state.activeChatId = 'chat_' + Date.now(); state.conversations[state.activeChatId] = { id: state.activeChatId, title: 'New Chat', messages: [], time: Date.now() }; state.conversation = []; $('messages').innerHTML = ''; $('messages').classList.remove('active'); $('welcome').style.display = 'block'; setMode('chat'); saveStorage(); renderHistory(); }
function saveStorage() { try { if (!state.activeChatId) return; state.conversations[state.activeChatId].messages = [...state.conversation]; state.conversations[state.activeChatId].time = Date.now(); if (state.conversation[0]) state.conversations[state.activeChatId].title = state.conversation[0].content.substring(0, 35); localStorage.setItem('agi_chats', JSON.stringify({ active: state.activeChatId, chats: state.conversations })); } catch (e) {} }
function loadStorage() { try { const raw = localStorage.getItem('agi_chats'); if (raw) { const data = JSON.parse(raw); state.conversations = data.chats || {}; state.activeChatId = data.active || null; } } catch (e) {} renderHistory(); }
function renderHistory() { const list = Object.values(state.conversations).sort((a, b) => b.time - a.time); const el = $('chatHistory'); if (!list.length) { el.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text-dim);">No chats yet</div>'; return; } el.innerHTML = list.map(c => `<button class="menu-item" data-id="${c.id}"><div class="menu-icon icon-gray" style="width:32px;height:32px;min-width:32px;font-size:13px;"><i class="fa-regular fa-message"></i></div><div class="menu-text"><strong style="font-size:12px;">${escapeHtml(c.title || 'Chat')}</strong></div></button>`).join(''); el.querySelectorAll('[data-id]').forEach(btn => { btn.onclick = () => loadChat(btn.dataset.id); }); }
function loadChat(id) { const chat = state.conversations[id]; if (!chat) return; state.activeChatId = id; state.conversation = [...chat.messages]; $('messages').innerHTML = ''; if (!chat.messages.length) { $('messages').classList.remove('active'); $('welcome').style.display = 'block'; } else { showMessages(); chat.messages.forEach(m => { const row = document.createElement('div'); row.className = `msg ${m.role === 'user' ? 'user' : 'ai'}`; if (m.role === 'user') row.innerHTML = `<div class="bubble">${escapeHtml(m.content)}</div>`; else row.innerHTML = `<div class="avatar"><i class="fa-solid fa-brain"></i></div><div class="bubble">${marked.parse(m.content || '')}</div>`; $('messages').appendChild(row); }); } closeSidebar(); scrollBottom(); }

// ==================== PYTHON & TOAST ====================
async function runPython() { const code = $('pythonInput').value.trim(); if (!code) return; $('pythonInput').value = ''; const out = $('pythonOutput'); out.textContent += `\n>>> ${code}\n`; try { if (typeof loadPyodide === 'undefined') { out.textContent += 'Python loading...\n'; return; } if (!state.pyodide) { out.textContent += 'Loading Python (first time)...\n'; state.pyodide = await loadPyodide(); } let stdout = []; state.pyodide.setStdout({ batched: (msg) => stdout.push(msg) }); const result = await state.pyodide.runPythonAsync(code); let output = stdout.join('\n'); if (result !== undefined && String(result) !== 'None') output += (output ? '\n' : '') + String(result); out.textContent += (output || '✓ Executed successfully') + '\n'; } catch (e) { out.textContent += `❌ ${e.message}\n`; } out.scrollTop = out.scrollHeight; }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('toasts').appendChild(t); setTimeout(() => t.remove(), 2500); }
