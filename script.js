if (typeof puter !== 'undefined') puter.quiet = true;

// ==================== STATE ====================
const state = {
  conversations: {},
  activeChatId: null,
  conversation: [],
  busy: false,
  mode: 'chat', // 'chat', 'image', 'video'
  pyodide: null
};

const $ = (id) => document.getElementById(id);

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', async () => {
  loadStorage();
  bindAll();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

// ==================== BINDINGS ====================
function bindAll() {
  // Sidebar
  $('openSidebar').onclick = () => { $('sidebar').classList.add('open'); $('overlay').classList.add('show'); };
  $('closeSidebar').onclick = closeSidebar;
  $('overlay').onclick = closeSidebar;

  // Modal shortcuts
  $('openAppLauncher').onclick = () => { closeSidebar(); openModal('appLauncherModal'); };
  $('openDeviceTools').onclick = () => { closeSidebar(); openModal('deviceToolsModal'); };
  $('openImageGen').onclick = () => { closeSidebar(); setMode('image'); };
  $('openVideoGen').onclick = () => { closeSidebar(); setMode('video'); };
  $('openPython').onclick = () => { closeSidebar(); openModal('pythonModal'); };

  // Close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.close);
  });

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

  // Composer
  $('input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  $('sendBtn').onclick = send;
  $('modeImage').onclick = () => setMode(state.mode === 'image' ? 'chat' : 'image');
  $('modeVideo').onclick = () => setMode(state.mode === 'video' ? 'chat' : 'video');

  // New chat
  $('newChatTop').onclick = newChat;

  // Clear chats
  $('clearChats').onclick = () => {
    if (!confirm('Clear all chat history?')) return;
    state.conversations = {};
    state.activeChatId = null;
    state.conversation = [];
    saveStorage();
    renderHistory();
    newChat();
    toast('All chats cleared');
  };

  // Device Tools
  $('vibrateBtn').onclick = () => {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
      showToolOutput('Device vibrated successfully');
    } else {
      showToolOutput('Vibration not supported on this device');
    }
  };
  $('shareBtn').onclick = () => {
    if (navigator.share) {
      navigator.share({ title: 'Ultra AI Studio', url: window.location.href })
        .then(() => showToolOutput('Shared successfully'))
        .catch(() => showToolOutput('Share cancelled'));
    } else {
      showToolOutput('Share not supported');
    }
  };
  $('batteryBtn').onclick = async () => {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      showToolOutput(`Battery: ${Math.round(b.level * 100)}% ${b.charging ? '(Charging)' : ''}`);
    } else {
      showToolOutput('Battery API not supported');
    }
  };
  $('clipboardBtn').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      showToolOutput(`Clipboard: ${text || '(empty)'}`);
    } catch (e) {
      showToolOutput('Clipboard access denied');
    }
  };

  // Python
  $('pythonRunBtn').onclick = runPython;
  $('pythonInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runPython(); }
  });
}

// ==================== MODE ====================
function setMode(mode) {
  state.mode = mode;
  $('modeImage').classList.toggle('active', mode === 'image');
  $('modeVideo').classList.toggle('active', mode === 'video');
  const placeholders = {
    chat: 'Ask anything...',
    image: 'Describe the image you want to create...',
    video: 'Describe the story or scene for the video...'
  };
  $('input').placeholder = placeholders[mode];
  $('input').focus();
}

// ==================== MODALS ====================
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('overlay').classList.remove('show');
}
function showToolOutput(msg) {
  const el = $('toolOutput');
  el.style.display = 'block';
  el.textContent = msg;
}

// ==================== SEND MESSAGE ====================
async function send() {
  const text = $('input').value.trim();
  if (!text || state.busy) return;

  if (!state.activeChatId) newChat();
  $('input').value = '';
  $('input').style.height = 'auto';

  state.busy = true;
  $('sendBtn').innerHTML = '<i class="fa-solid fa-stop"></i>';
  $('sendBtn').style.background = 'var(--danger)';

  appendUser(text);
  state.conversation.push({ role: 'user', content: text });

  try {
    const detectImage = /(generate|create|draw|make).*(image|photo|picture)|image banao|photo banao|फोटो बनाओ|इमेज बनाओ/i.test(text);
    const detectVideo = /(generate|create|make).*(video|movie|reel)|video banao|movie banao|वीडियो बनाओ/i.test(text);

    if (state.mode === 'image' || detectImage) {
      await generateImage(text);
    } else if (state.mode === 'video' || detectVideo) {
      await generateVideo(text);
    } else {
      await chatReply(text);
    }
  } catch (e) {
    appendAI(`<span style="color:#ef4444">Error: ${escapeHtml(e.message)}</span>`);
  } finally {
    state.busy = false;
    $('sendBtn').innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    $('sendBtn').style.background = '';
    saveStorage();
    renderHistory();
  }
}

// ==================== AI CHAT ====================
async function chatReply(userText) {
  const bubble = appendAI('<div class="loader"><span></span><span></span><span></span></div>');

  const messages = [
    { role: 'system', content: 'You are a helpful AI assistant. Answer directly and provide complete code when asked. Use markdown formatting.' },
    ...state.conversation.slice(-6),
  ];

  let full = '';

  try {
    if (typeof puter !== 'undefined' && puter.ai?.chat) {
      const stream = await puter.ai.chat(messages, { model: 'gpt-4o', stream: true });
      for await (const part of stream) {
        const chunk = part?.text || part?.message?.content || (typeof part === 'string' ? part : '');
        if (chunk) {
          full += chunk;
          bubble.innerHTML = marked.parse(full);
          scrollBottom();
        }
      }
      if (full) {
        bubble.innerHTML = marked.parse(full);
        if (window.hljs) bubble.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
        state.conversation.push({ role: 'assistant', content: full });
        return;
      }
    }
  } catch (e) {}

  // Fallback
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai', messages })
    });
    const data = await res.json();
    full = data.choices[0].message.content;
    bubble.innerHTML = marked.parse(full);
    if (window.hljs) bubble.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
    state.conversation.push({ role: 'assistant', content: full });
  } catch (e) {
    bubble.innerHTML = '<span style="color:#ef4444">Failed to get response. Try again.</span>';
  }
}

// ==================== IMAGE GENERATOR ====================
async function generateImage(prompt) {
  const bubble = appendAI(`
    <div class="loader"><span></span><span></span><span></span></div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:8px;">🎨 Generating image...</div>
  `);

  let url = '';
  try {
    if (typeof puter !== 'undefined' && puter.ai?.txt2img) {
      const img = await puter.ai.txt2img(prompt);
      if (img?.src) url = img.src;
    }
  } catch (e) {}

  if (!url) {
    url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&seed=${Date.now()}`;
  }

  const dataUrl = await preloadImage(url);
  if (!dataUrl) {
    bubble.innerHTML = '<span style="color:#ef4444">Image generation failed. Try again.</span>';
    return;
  }

  bubble.innerHTML = `
    <img src="${dataUrl}" alt="${escapeHtml(prompt)}">
    <a href="${dataUrl}" download="ultra-ai-${Date.now()}.jpg" class="download-btn">
      <i class="fa-solid fa-download"></i> Download
    </a>
  `;
  state.conversation.push({ role: 'assistant', content: `[Generated image: ${prompt}]` });
}

// ==================== VIDEO GENERATOR ====================
async function generateVideo(prompt) {
  const bubble = appendAI(`
    <div class="video-card">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
        <strong>🎬 Creating movie...</strong>
        <span id="vpct">5%</span>
      </div>
      <div class="video-progress"><div class="video-progress-fill" id="vfill" style="width:5%"></div></div>
      <div class="video-log" id="vlog">Writing script...</div>
      <div id="vstage" style="display:none;margin-top:10px;">
        <canvas id="vcanvas" width="854" height="480" style="width:100%;border-radius:12px;"></canvas>
      </div>
    </div>
  `);

  const update = (pct, msg) => {
    const f = bubble.querySelector('#vfill');
    const p = bubble.querySelector('#vpct');
    const l = bubble.querySelector('#vlog');
    if (f) f.style.width = pct + '%';
    if (p) p.textContent = pct + '%';
    if (l) l.textContent = msg;
    scrollBottom();
  };

  // Step 1: Generate script
  update(10, 'Writing 3-scene script...');
  let scenes = [];
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [{ role: 'user', content: `Create 3 cinematic scenes for a short video about: "${prompt}". Return ONLY a JSON array of 3 objects, each with "visual" (English image prompt, max 20 words) and "subtitle" (short narration text, max 10 words).` }]
      })
    });
    const data = await res.json();
    const raw = data.choices[0].message.content;
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) scenes = JSON.parse(match[0]);
  } catch (e) {}

  if (!scenes.length) {
    scenes = [
      { visual: `Cinematic wide shot of ${prompt}, dramatic lighting, 4k`, subtitle: prompt },
      { visual: `Dynamic action shot of ${prompt}, cinematic`, subtitle: 'A new twist appears...' },
      { visual: `Epic finale of ${prompt}, sunset`, subtitle: 'And the story ends.' }
    ];
  }

  // Step 2: Load images
  update(25, 'Loading scene frames...');
  const loadedImgs = [];
  for (let i = 0; i < scenes.length; i++) {
    update(25 + Math.round(((i + 1) / scenes.length) * 45), `Rendering scene ${i + 1}/${scenes.length}...`);
    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(scenes[i].visual + ', cinematic 35mm film, photorealistic')}?width=854&height=480&nologo=true&seed=${Math.random()}`;
    const img = await loadImageElement(imgUrl);
    if (img) loadedImgs.push({ img, sub: scenes[i].subtitle });
  }

  if (!loadedImgs.length) {
    bubble.innerHTML = '<span style="color:#ef4444">Video generation failed.</span>';
    return;
  }

  // Step 3: Render video
  update(75, 'Encoding video with effects...');
  const stage = bubble.querySelector('#vstage');
  stage.style.display = 'block';
  const canvas = bubble.querySelector('#vcanvas');
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = e => chunks.push(e.data);
  rec.start();

  const fps = 30;
  const framesPer = Math.round(fps * 3);
  const total = loadedImgs.length * framesPer;

  for (let f = 0; f < total; f++) {
    const idx = Math.min(loadedImgs.length - 1, Math.floor(f / framesPer));
    const prog = (f % framesPer) / framesPer;
    const zoom = 1 + prog * 0.12;
    const panX = (idx % 2 === 0 ? -1 : 1) * prog * 20;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 854, 480);
    ctx.save();
    ctx.translate(427 + panX, 240);
    ctx.scale(zoom, zoom);
    ctx.drawImage(loadedImgs[idx].img, -427, -240, 854, 480);
    ctx.restore();

    // Subtitle
    if (loadedImgs[idx].sub) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(50, 400, 754, 50);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(loadedImgs[idx].sub, 427, 432);
    }

    await new Promise(r => setTimeout(r, 1000 / fps));
  }

  rec.stop();
  await new Promise(r => { rec.onstop = r; });

  const blob = new Blob(chunks, { type: 'video/webm' });
  const videoUrl = URL.createObjectURL(blob);

  stage.innerHTML = `<video src="${videoUrl}" controls autoplay loop style="width:100%;border-radius:12px;"></video>`;
  update(100, '✅ Video ready!');

  bubble.innerHTML += `
    <a href="${videoUrl}" download="ultra-video-${Date.now()}.webm" class="download-btn">
      <i class="fa-solid fa-download"></i> Download Video
    </a>
  `;

  state.conversation.push({ role: 'assistant', content: `[Generated video: ${prompt}]` });
}

// ==================== HELPERS ====================
function loadImageElement(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 15000);
    img.src = url;
  });
}

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h * maxDim) / w; w = maxDim; }
          else { w = (w * maxDim) / h; h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (e) {
        resolve(url);
      }
    };
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 20000);
    img.src = url;
  });
}

// ==================== CHAT UI ====================
function appendUser(text) {
  showMessages();
  const row = document.createElement('div');
  row.className = 'msg user';
  row.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  $('messages').appendChild(row);
  scrollBottom();
}

function appendAI(html) {
  showMessages();
  const row = document.createElement('div');
  row.className = 'msg ai';
  row.innerHTML = `
    <div class="avatar"><i class="fa-solid fa-bolt"></i></div>
    <div class="bubble">${html}</div>
  `;
  $('messages').appendChild(row);
  scrollBottom();
  return row.querySelector('.bubble');
}

function showMessages() {
  $('welcome').style.display = 'none';
  $('messages').classList.add('active');
}

function scrollBottom() {
  $('chatArea').scrollTop = $('chatArea').scrollHeight;
}

function newChat() {
  state.activeChatId = 'chat_' + Date.now();
  state.conversations[state.activeChatId] = { id: state.activeChatId, title: 'New Chat', messages: [], time: Date.now() };
  state.conversation = [];
  $('messages').innerHTML = '';
  $('messages').classList.remove('active');
  $('welcome').style.display = 'block';
  setMode('chat');
  saveStorage();
  renderHistory();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ==================== STORAGE ====================
function saveStorage() {
  try {
    if (!state.activeChatId) return;
    state.conversations[state.activeChatId].messages = [...state.conversation];
    state.conversations[state.activeChatId].time = Date.now();
    if (state.conversation[0]) {
      state.conversations[state.activeChatId].title = state.conversation[0].content.substring(0, 35);
    }
    localStorage.setItem('ultra_ai_chats', JSON.stringify({
      active: state.activeChatId,
      chats: state.conversations
    }));
  } catch (e) {}
}

function loadStorage() {
  try {
    const raw = localStorage.getItem('ultra_ai_chats');
    if (raw) {
      const data = JSON.parse(raw);
      state.conversations = data.chats || {};
      state.activeChatId = data.active || null;
    }
  } catch (e) {}
  renderHistory();
}

function renderHistory() {
  const list = Object.values(state.conversations).sort((a, b) => b.time - a.time);
  const el = $('chatHistory');
  if (!list.length) {
    el.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--text-dim);">No chats yet</div>';
    return;
  }
  el.innerHTML = list.map(c => `
    <button class="menu-item" data-id="${c.id}">
      <div class="menu-icon icon-gray" style="width:32px;height:32px;min-width:32px;font-size:13px;">
        <i class="fa-regular fa-message"></i>
      </div>
      <div class="menu-text">
        <strong style="font-size:12px;">${escapeHtml(c.title || 'Chat')}</strong>
      </div>
    </button>
  `).join('');
  el.querySelectorAll('[data-id]').forEach(btn => {
    btn.onclick = () => loadChat(btn.dataset.id);
  });
}

function loadChat(id) {
  const chat = state.conversations[id];
  if (!chat) return;
  state.activeChatId = id;
  state.conversation = [...chat.messages];
  $('messages').innerHTML = '';
  if (!chat.messages.length) {
    $('messages').classList.remove('active');
    $('welcome').style.display = 'block';
  } else {
    showMessages();
    chat.messages.forEach(m => {
      const row = document.createElement('div');
      row.className = `msg ${m.role === 'user' ? 'user' : 'ai'}`;
      if (m.role === 'user') {
        row.innerHTML = `<div class="bubble">${escapeHtml(m.content)}</div>`;
      } else {
        row.innerHTML = `<div class="avatar"><i class="fa-solid fa-bolt"></i></div><div class="bubble">${marked.parse(m.content || '')}</div>`;
      }
      $('messages').appendChild(row);
    });
  }
  closeSidebar();
  scrollBottom();
}

// ==================== PYTHON ====================
async function runPython() {
  const code = $('pythonInput').value.trim();
  if (!code) return;
  $('pythonInput').value = '';
  const out = $('pythonOutput');
  out.textContent += `\n>>> ${code}\n`;

  try {
    if (typeof loadPyodide === 'undefined') {
      out.textContent += 'Python is still loading, please wait...\n';
      return;
    }
    if (!state.pyodide) {
      out.textContent += 'Loading Python engine (first time)...\n';
      state.pyodide = await loadPyodide();
    }
    let stdout = [];
    state.pyodide.setStdout({ batched: (msg) => stdout.push(msg) });
    const result = await state.pyodide.runPythonAsync(code);
    let output = stdout.join('\n');
    if (result !== undefined && String(result) !== 'None') {
      output += (output ? '\n' : '') + String(result);
    }
    out.textContent += (output || '✓ Executed successfully') + '\n';
  } catch (e) {
    out.textContent += `❌ ${e.message}\n`;
  }
  out.scrollTop = out.scrollHeight;
}

// ==================== TOAST ====================
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
