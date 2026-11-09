(() => {
"use strict";
const $ = id => document.getElementById(id);
const state = { chats: JSON.parse(localStorage.getItem("dolphin_chats") || "{}"), active: null, busy:false, theme:localStorage.getItem("dolphin_theme") || "dark" };
document.documentElement.dataset.theme = state.theme;

function toast(message,type="info"){
  const el=document.createElement("div"); el.className="toast "+type; el.textContent=message;
  $("toastContainer").appendChild(el); setTimeout(()=>el.remove(),3500);
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function persist(){localStorage.setItem("dolphin_chats",JSON.stringify(state.chats));}
function newChat(){
  const id="chat_"+Date.now(); state.chats[id]={id,title:"New Chat",messages:[]}; state.active=id;
  persist(); renderChat(); renderSidebar();
}
function renderSidebar(){
  const list=$("chatList"); list.innerHTML="";
  Object.values(state.chats).sort((a,b)=>b.id.localeCompare(a.id)).forEach(chat=>{
    const row=document.createElement("div"); row.className="chat-item"+(chat.id===state.active?" active":"");
    const title=document.createElement("span"); title.textContent=chat.title; title.style.flex="1"; title.style.overflow="hidden";
    const del=document.createElement("button"); del.className="delete-chat-btn"; del.textContent="×";
    row.append(title,del); row.onclick=()=>{state.active=chat.id;renderChat();renderSidebar();closeSidebar();};
    del.onclick=e=>{e.stopPropagation();delete state.chats[chat.id];if(state.active===chat.id)state.active=null;persist();renderSidebar();renderChat();};
    list.appendChild(row);
  });
}
function renderChat(){
  const inner=$("chatInner"); inner.innerHTML="";
  const chat=state.chats[state.active];
  $("headerTitle").textContent=chat?.title||"New Chat";
  if(!chat || !chat.messages.length){
    inner.innerHTML='<div class="empty-state"><div class="empty-icon">🐬</div><h2>Dolphin AI</h2><p>Chat assistant · Image editing tools</p></div>'; return;
  }
  chat.messages.forEach(m=>appendMessage(m.role,m.content,m.time,false));
  $("chatContainer").scrollTop=$("chatContainer").scrollHeight;
}
function appendMessage(role,content,time=Date.now(),save=true){
  const empty=document.querySelector(".empty-state"); if(empty)empty.remove();
  const msg=document.createElement("div"); msg.className="message "+role;
  const avatar=document.createElement("div"); avatar.className="message-avatar"; avatar.textContent=role==="user"?"U":"🐬";
  const wrap=document.createElement("div"); wrap.className="message-content";
  const bubble=document.createElement("div"); bubble.className="message-bubble";
  if(role==="assistant" && window.marked) bubble.innerHTML=marked.parse(content||"");
  else bubble.textContent=content;
  const timeEl=document.createElement("div"); timeEl.className="message-time"; timeEl.textContent=new Date(time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  wrap.append(bubble,timeEl);
  if(role==="assistant"){
    const actions=document.createElement("div");actions.className="message-actions";
    const copy=document.createElement("button");copy.className="action-btn";copy.textContent="📋 Copy";copy.onclick=()=>navigator.clipboard.writeText(content).then(()=>toast("Copied","success"));
    actions.appendChild(copy);wrap.appendChild(actions);
  }
  msg.append(avatar,wrap);$("chatInner").appendChild(msg);
  if(save && state.active){state.chats[state.active].messages.push({role,content,time});persist();}
  $("chatContainer").scrollTop=$("chatContainer").scrollHeight;
}
async function sendMessage(){
  const input=$("userInput"), text=input.value.trim(); if(!text||state.busy)return;
  if(!state.active)newChat();
  const chat=state.chats[state.active]; if(chat.title==="New Chat")chat.title=text.slice(0,38);
  input.value="";input.style.height="auto";appendMessage("user",text);
  state.busy=true;$("sendBtn").disabled=true;$("statusText").textContent="Thinking…";
  try{
    const messages=[{role:"system",content:$("systemPrompt").value},...chat.messages.map(m=>({role:m.role,content:m.content}))];
    const response=await puter.ai.chat(messages,{model:$("modelSelect").value});
    const answer=typeof response==="string"?response:(response?.message?.content||response?.text||JSON.stringify(response));
    appendMessage("assistant",answer);
  }catch(err){appendMessage("assistant","Request error: "+(err.message||String(err)));toast("Chat request failed","error");}
  finally{state.busy=false;$("sendBtn").disabled=false;$("statusText").textContent="Ready";renderSidebar();}
}
function openSidebar(){$("sidebar").classList.add("open");$("sidebarOverlay").classList.add("open");}
function closeSidebar(){$("sidebar").classList.remove("open");$("sidebarOverlay").classList.remove("open");}
$("sendBtn").onclick=sendMessage;
$("userInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}});
$("userInput").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";});
$("newChatBtn").onclick=newChat;$("menuBtn").onclick=openSidebar;$("sidebarClose").onclick=closeSidebar;$("sidebarOverlay").onclick=closeSidebar;
$("settingsBtn").onclick=()=>$("settingsPanel").classList.toggle("open");
$("closeSettings").onclick=()=>$("settingsPanel").classList.remove("open");
$("saveSettings").onclick=()=>{$("settingsPanel").classList.remove("open");toast("Settings saved","success");};
$("themeBtn").onclick=()=>{state.theme=state.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=state.theme;localStorage.setItem("dolphin_theme",state.theme);};
$("clearBtn").onclick=()=>{if(confirm("Delete all chat history?")){state.chats={};state.active=null;persist();renderSidebar();renderChat();}};
$("exportBtn").onclick=()=>{const c=state.chats[state.active];if(!c)return toast("No active chat","error");const blob=new Blob([c.messages.map(m=>m.role.toUpperCase()+": "+m.content).join("\n\n")],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="dolphin-chat.txt";a.click();URL.revokeObjectURL(a.href);};
document.addEventListener("click",e=>{const b=e.target.closest("[data-prompt]");if(b){$("userInput").value=b.dataset.prompt;$("userInput").focus();}});
renderSidebar();renderChat();

/* ---------------- AI HORDE IMAGE-TO-IMAGE EDITOR ---------------- */
const HORDE="https://aihorde.net/api/v2";
let sourceDataURL=null, activeJob=null;
function editorMarkup(){
 const modal=document.createElement("div");modal.className="ie-modal";modal.id="ieModal";
 modal.innerHTML=`<div class="ie-box">
  <div class="ie-head"><h3>🎨 AI Image Editor</h3><button class="ie-close" id="ieClose">✕</button></div>
  <label class="ie-upload">📸 Choose an image<input id="ieFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><div style="font-size:11px;color:var(--text2);margin-top:5px">JPG / PNG / WEBP · max 8 MB</div></label>
  <img id="iePreview" class="ie-preview" alt="Original preview">
  <label class="ie-label" for="iePrompt">What should the AI change?</label>
  <textarea id="iePrompt" class="ie-field" rows="3" placeholder="Example: Make the background a sunset beach, keep the person and pose similar."></textarea>
  <label class="ie-label" for="ieStrength">Edit strength: <span id="ieStrengthVal">0.40</span></label>
  <input id="ieStrength" type="range" min="0.15" max="0.85" step="0.05" value="0.40" style="width:100%">
  <div class="ie-note">Privacy: the selected image and prompt are sent to AI Horde and may be processed by volunteer GPU workers. Anonymous requests may be shared under AI Horde's service rules. Do not upload private or sensitive photos.</div>
  <div class="ie-progress"><div id="ieBar"></div></div><div class="ie-status" id="ieStatus">Choose an image to begin.</div>
  <button class="ie-generate" id="ieRun">✨ Generate edit</button>
  <div id="ieOutput" style="display:none"><div class="ie-results"><div><small>Original</small><img id="ieBefore"></div><div><small>Edited</small><img id="ieAfter"></div></div><a id="ieDownload" class="ie-download" download="dolphin-edited.webp">⬇ Download edited image</a></div>
 </div>`;
 document.body.appendChild(modal);
 $("imageEditorBtn").onclick=()=>modal.classList.add("open");
 $("ieClose").onclick=()=>modal.classList.remove("open");
 modal.addEventListener("click",e=>{if(e.target===modal)modal.classList.remove("open");});
 $("ieStrength").oninput=()=>$("ieStrengthVal").textContent=$("ieStrength").value;
 $("ieFile").onchange=loadImage;
 $("ieRun").onclick=runImageEdit;
}
function loadImage(e){
 const file=e.target.files[0];if(!file)return;
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)){toast("Choose JPG, PNG or WEBP","error");return;}
 if(file.size>8*1024*1024){toast("Image must be under 8 MB","error");return;}
 const reader=new FileReader();
 reader.onload=()=>resizeToWebP(reader.result).then(data=>{
   sourceDataURL=data;$("iePreview").src=data;$("iePreview").style.display="block";
   $("ieOutput").style.display="none";$("ieStatus").textContent="Image ready.";
 }).catch(()=>toast("Could not read image","error"));
 reader.readAsDataURL(file);
}
function resizeToWebP(dataURL){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{
   const scale=Math.min(1,1024/Math.max(img.width,img.height));
   const canvas=document.createElement("canvas");canvas.width=Math.max(64,Math.floor(img.width*scale/64)*64);canvas.height=Math.max(64,Math.floor(img.height*scale/64)*64);
   const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/webp",.88));
  };img.onerror=reject;img.src=dataURL;
 });
}
function setIEStatus(s,p){$("ieStatus").textContent=s;if(p!==undefined)$("ieBar").style.width=p+"%";}
async function runImageEdit(){
 if(!sourceDataURL)return toast("Upload an image first","error");
 const prompt=$("iePrompt").value.trim();if(!prompt)return toast("Enter an editing prompt","error");
 if(activeJob)return;
 const btn=$("ieRun");btn.disabled=true;btn.textContent="⏳ Processing…";
 try{
  setIEStatus("Submitting image to AI Horde…",4);
  const img=new Image();img.src=sourceDataURL;await img.decode();
  const w=Math.max(64,Math.floor(img.width/64)*64),h=Math.max(64,Math.floor(img.height/64)*64);
  const payload={
   prompt:prompt,
   params:{sampler_name:"k_euler",cfg_scale:7,steps:25,width:w,height:h,denoising_strength:Number($("ieStrength").value),n:1},
   source_image:sourceDataURL.split(",")[1],
   source_processing:"img2img",
   r2:true,
   shared:false,
   censor_nsfw:true
  };
  const res=await fetch(HORDE+"/generate/async",{method:"POST",headers:{"Content-Type":"application/json","apikey":"0000000000","Client-Agent":"DolphinAI:1.0:browser"},body:JSON.stringify(payload)});
  if(!res.ok)throw new Error("AI Horde rejected request ("+res.status+"): "+(await res.text()).slice(0,250));
  const data=await res.json();if(!data.id)throw new Error(data.message||"No job ID returned");
  activeJob=data.id;await waitForJob(data.id);
 }catch(err){setIEStatus("Error: "+err.message);toast("Image editing failed","error");}
 finally{activeJob=null;btn.disabled=false;btn.textContent="✨ Generate edit";}
}
async function waitForJob(id){
 for(let i=0;i<180;i++){
  await new Promise(r=>setTimeout(r,5000));
  const res=await fetch(HORDE+"/generate/check/"+encodeURIComponent(id),{headers:{"apikey":"0000000000"}});
  if(!res.ok)throw new Error("Status check failed ("+res.status+")");
  const s=await res.json();setIEStatus("Waiting for volunteer GPU workers… "+(s.waiting||0)+" queued",Math.min(90,5+i*.5));
  if(s.faulted)throw new Error("The worker reported a generation error.");
  if(s.done){await fetchResult(id);return;}
  if(s.is_possible===false)throw new Error("No compatible workers are currently available.");
 }
 throw new Error("Timed out. Try again later; the public queue can be busy.");
}
async function fetchResult(id){
 setIEStatus("Retrieving edited image…",95);
 const res=await fetch(HORDE+"/generate/status/"+encodeURIComponent(id),{headers:{"apikey":"0000000000"}});
 if(!res.ok)throw new Error("Could not retrieve result");
 const data=await res.json(),gen=data.generations?.[0];if(!gen?.img)throw new Error("No image returned");
 let url;
 if(gen.img.startsWith("http"))url=gen.img;
 else if(gen.img.startsWith("data:"))url=gen.img;
 else url="data:image/webp;base64,"+gen.img;
 const imageRes=await fetch(url);if(!imageRes.ok)throw new Error("Could not download result");
 const blob=await imageRes.blob(),objectURL=URL.createObjectURL(blob);
 $("ieBefore").src=sourceDataURL;$("ieAfter").src=objectURL;
 const a=$("ieDownload");a.href=objectURL;a.style.display="block";$("ieOutput").style.display="block";
 setIEStatus("✅ Editing complete!",100);toast("Edited image is ready","success");
}
editorMarkup();
})();
