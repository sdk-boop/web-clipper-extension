// popup.js

const listContainer   = document.getElementById("list-container");
const btnExport       = document.getElementById("btn-export");
const btnExportAll    = document.getElementById("btn-export-all");
const btnClearSection = document.getElementById("btn-clear-section");
const tabBar          = document.getElementById("tab-bar");
const btnAddSection   = document.getElementById("btn-add-section");
const totalBadge      = document.getElementById("total-badge");
const btnScreenshot   = document.getElementById("btn-screenshot");
const statusBar       = document.getElementById("status");

const pdfBar          = document.getElementById("pdf-bar");
const btnPdfCapture   = document.getElementById("btn-pdf-capture");
const fileWarn        = document.getElementById("file-warn");
const pdfPicker       = document.getElementById("pdf-picker");
const pdfPreview      = document.getElementById("pdf-preview");
const pdfCatBtns      = document.getElementById("pdf-cat-btns");
const pdfNewInp       = document.getElementById("pdf-new-inp");
const pdfSaveBtn      = document.getElementById("pdf-save-btn");

let clippings  = [];
let categories = [];
let activeTab  = "All";
let pendingPdfClipping = null; // holds clipboard text waiting for category

// ── Boot ──────────────────────────────────────────────────────────────────────
loadAll();
detectPdfTab();

btnExport.addEventListener("click", () => exportSection(activeTab));
btnExportAll.addEventListener("click", exportAllSections);
btnClearSection.addEventListener("click", clearCurrentSection);
btnAddSection.addEventListener("click", promptNewSection);
btnScreenshot.addEventListener("click", startScreenshot);

// ── PDF tab detection ─────────────────────────────────────────────────────────
function detectPdfTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || !tabs[0]) return;
    const url = tabs[0].url || "";
    const isFile   = url.startsWith("file://");
    const isPdf    = /\.pdf(\?.*)?$/i.test(url) || isFile;

    if (!isPdf) return;

    pdfBar.classList.add("visible");

    // Update bar message for local files
    if (isFile) {
      document.getElementById("pdf-bar-msg").innerHTML =
        "<strong>Local PDF detected.</strong> Select text → press <strong>Ctrl+C</strong> → click the button below.";
      // Show file-access warning if needed
      chrome.extension.isAllowedFileSchemeAccess(function(allowed) {
        if (!allowed) fileWarn.classList.add("visible");
      });
    }
  });
}

// ── PDF Capture: reads clipboard directly in the popup ────────────────────────
btnPdfCapture.addEventListener("click", function() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    showStatus("⚠ Clipboard API not available in this browser.", true);
    return;
  }
  navigator.clipboard.readText().then(function(text) {
    text = (text || "").trim();
    if (!text) {
      showStatus("Clipboard is empty — select text in the PDF, press Ctrl+C, then try again.", true);
      return;
    }
    // Get current tab info for URL + title
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const tab = tabs && tabs[0];
      const url   = tab ? tab.url   : location.href;
      const title = tab ? tab.title : "PDF Document";

      pendingPdfClipping = {
        id: Date.now(),
        type: "text",
        source: "pdf",
        text: text,
        url: url,
        title: title,
        capturedAt: new Date().toISOString(),
        category: null
      };
      showPdfPicker(text);
    });
  }).catch(function(err) {
    showStatus("⚠ Could not read clipboard: " + err.message
      + ". Make sure the PDF page is focused before opening the popup.", true);
  });
});

function showPdfPicker(text) {
  // Show preview
  pdfPreview.textContent = text.slice(0, 120) + (text.length > 120 ? "…" : "");
  pdfPicker.classList.add("visible");

  // Render category buttons
  pdfCatBtns.innerHTML = "";
  if (categories.length === 0) {
    pdfCatBtns.innerHTML = '<span style="font-size:11px;color:#94a3b8">No sections yet — type one below</span>';
  } else {
    categories.forEach(function(cat) {
      const b = document.createElement("button");
      b.className = "pdf-cat-btn";
      b.textContent = cat;
      b.addEventListener("click", function() { savePdfClipping(cat); });
      pdfCatBtns.appendChild(b);
    });
  }

  pdfSaveBtn.onclick = function() {
    const n = pdfNewInp.value.trim();
    if (!n) { pdfNewInp.focus(); return; }
    savePdfClipping(n);
  };
  pdfNewInp.onkeydown = function(e) {
    if (e.key === "Enter") { const n = pdfNewInp.value.trim(); if (n) savePdfClipping(n); }
  };

  setTimeout(function() { pdfNewInp.focus(); }, 80);
}

function savePdfClipping(category) {
  if (!pendingPdfClipping) return;
  pendingPdfClipping.category = category;

  chrome.runtime.sendMessage({ type: "SAVE_CLIPPING", clipping: pendingPdfClipping }, function(res) {
    pendingPdfClipping = null;
    pdfPicker.classList.remove("visible");
    pdfNewInp.value = "";
    showStatus('✓ PDF text saved to "' + category + '" (' + (res && res.total || "?") + ' clips total)');
    loadAll();
  });
}

// ── Screenshot ────────────────────────────────────────────────────────────────
function startScreenshot() {
  chrome.runtime.sendMessage({ type: "START_SCREENSHOT" }, function() { window.close(); });
}

// ── Load data ─────────────────────────────────────────────────────────────────
function loadAll() {
  chrome.runtime.sendMessage({ type: "GET_CATEGORIES" }, function(res1) {
    categories = (res1 && res1.categories) ? res1.categories : [];
    chrome.runtime.sendMessage({ type: "GET_CLIPPINGS" }, function(res2) {
      clippings = (res2 && res2.clippings) ? res2.clippings : [];
      renderTabs();
      renderList();
    });
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function renderTabs() {
  tabBar.querySelectorAll(".tab").forEach(t => t.remove());
  const usedCats = [...new Set(clippings.map(c => c.category || "Uncategorized"))];
  const allCats  = [...new Set([...categories, ...usedCats])].filter(Boolean);
  ["All", ...allCats].forEach(function(name) {
    const count = name === "All" ? clippings.length
      : clippings.filter(c => (c.category||"Uncategorized") === name).length;
    const btn = document.createElement("button");
    btn.className = "tab" + (name === activeTab ? " active" : "");
    btn.innerHTML = esc(name) + ' <span class="tab-count">'+count+'</span>';
    btn.addEventListener("click", function() { activeTab = name; renderTabs(); renderList(); });
    tabBar.insertBefore(btn, btnAddSection);
  });
  totalBadge.textContent = clippings.length + " clip" + (clippings.length !== 1 ? "s" : "");
}

// ── List ──────────────────────────────────────────────────────────────────────
function renderList() {
  const filtered = activeTab === "All"
    ? [...clippings].reverse()
    : clippings.filter(c => (c.category||"Uncategorized") === activeTab).reverse();

  btnExport.disabled       = filtered.length === 0 || activeTab === "All";
  btnExportAll.disabled    = clippings.length === 0;
  btnClearSection.disabled = filtered.length === 0;

  btnExport.innerHTML = (activeTab !== "All")
    ? '<svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12M8 12l4 4 4-4"/></svg> Export "'+esc(activeTab)+'"'
    : '<svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12M8 12l4 4 4-4"/></svg> Export Section';

  if (!filtered.length) {
    const hint = activeTab === "All"
      ? 'Copy text on any page (Ctrl+C) or use PDF capture / Screenshot.'
      : 'No clippings in <strong>'+esc(activeTab)+'</strong> yet.';
    listContainer.innerHTML = '<div class="empty-state"><svg width="44" height="44" fill="none" viewBox="0 0 24 24">'
      +'<rect x="3" y="3" width="18" height="18" rx="3" stroke="#9ca3af" stroke-width="1.5"/>'
      +'<path stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" d="M7 8h10M7 12h10M7 16h6"/></svg>'
      +'<p>'+hint+'</p></div>';
    return;
  }

  const moveCats = [...new Set([...categories, ...clippings.map(c => c.category||"Uncategorized")])].filter(Boolean);

  listContainer.innerHTML = filtered.map(function(c) {
    const date   = new Date(c.capturedAt).toLocaleString(undefined, {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
    const title  = esc(c.title || tryHostname(c.url));
    const cat    = c.category || "Uncategorized";
    const isShot = c.type === "screenshot";
    const isPdf  = c.source === "pdf";
    const typeBadge = isShot
      ? '<span class="type-badge">📷</span>'
      : isPdf
        ? '<span class="type-badge pdf">📄 PDF</span>'
        : '<span class="type-badge text">📋</span>';

    const preview = isShot
      ? (c.imageData ? '<img class="clip-img" src="'+c.imageData+'" alt="screenshot"/>' : '')
      : '<div class="clip-text">'+esc(c.text.slice(0,260))+'</div>';

    return '<div class="clip-card" data-id="'+c.id+'">'
      + preview
      + '<div class="clip-meta">'
        +'<span class="clip-title" title="'+title+'">'+typeBadge+title+'</span>'
        +'<span class="clip-date">'+date+'</span>'
      +'</div>'
      +'<div class="clip-url" data-url="'+esc(c.url)+'">'+esc(c.url.length>65?c.url.slice(0,62)+"…":c.url)+'</div>'
      +'<div class="card-foot">'
        +'<span class="cat-badge">'+esc(cat)+'</span>'
        +'<span class="spacer"></span>'
        +'<button class="btn-move" data-id="'+c.id+'">Move to ▾</button>'
        +'<button class="btn-del-clip" data-id="'+c.id+'"><svg width="12" height="12" fill="none" viewBox="0 0 24 24">'
          +'<path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M18 6 6 18M6 6l12 12"/></svg></button>'
      +'</div>'
    +'</div>';
  }).join("");

  listContainer.querySelectorAll(".btn-del-clip").forEach(function(btn) {
    btn.addEventListener("click", function() {
      chrome.runtime.sendMessage({type:"DELETE_CLIPPING",id:Number(btn.dataset.id)}, loadAll);
    });
  });
  listContainer.querySelectorAll(".btn-move").forEach(function(btn) {
    btn.addEventListener("click", function(e) { e.stopPropagation(); showMoveMenu(btn, Number(btn.dataset.id), moveCats); });
  });
  listContainer.querySelectorAll(".clip-url").forEach(function(el) {
    el.addEventListener("click", function() { chrome.tabs.create({url:el.dataset.url}); });
  });
}

// ── Move menu ─────────────────────────────────────────────────────────────────
function showMoveMenu(btn, clipId, cats) {
  document.querySelectorAll(".move-menu").forEach(m => m.remove());
  const menu = document.createElement("div");
  menu.className = "move-menu";
  menu.innerHTML = cats.map(cat => '<div class="move-item" data-cat="'+esc(cat)+'">'+esc(cat)+'</div>').join("")
    + '<div class="move-item" style="color:#1a56db;border-top:1px solid #f1f5f9;margin-top:3px" data-cat="__new__">＋ New section…</div>';
  btn.closest(".clip-card").appendChild(menu);
  menu.querySelectorAll(".move-item").forEach(function(item) {
    item.addEventListener("click", function() {
      let cat = item.dataset.cat;
      if (cat === "__new__") { cat = prompt("New section name:"); if (!cat||!cat.trim()) return; cat=cat.trim(); }
      menu.remove();
      chrome.runtime.sendMessage({type:"MOVE_CLIPPING",id:clipId,category:cat}, loadAll);
    });
  });
  setTimeout(function() { document.addEventListener("click", function h(){menu.remove();document.removeEventListener("click",h);}); }, 0);
}

// ── Sections ──────────────────────────────────────────────────────────────────
function promptNewSection() {
  const name = prompt("Section name (e.g. Introduction, Methods, Discussion):");
  if (name && name.trim()) chrome.runtime.sendMessage({type:"ADD_CATEGORY",name:name.trim()}, loadAll);
}
function clearCurrentSection() {
  const label = activeTab === "All" ? "all clippings" : 'all clippings in "'+activeTab+'"';
  if (!confirm("Delete "+label+"? This cannot be undone.")) return;
  chrome.runtime.sendMessage({ type: activeTab==="All" ? "CLEAR_ALL" : "CLEAR_CATEGORY", category:activeTab }, loadAll);
}

// ── HTML Export ───────────────────────────────────────────────────────────────
function buildHTML(clips, sectionName) {
  const date = new Date().toLocaleString();
  const rows = clips.map(function(c, i) {
    const isShot = c.type==="screenshot";
    const imgHtml = (isShot && c.imageData) ? '<img src="'+c.imageData+'" style="max-width:100%;border:1px solid #e2e8f0;border-radius:4px;margin:8px 0;display:block"/>' : '';
    const textHtml = (!isShot && c.text) ? c.text.split(/\n+/).filter(l=>l.trim()).map(l=>'<p style="margin:4px 0;color:#374151">'+escHtml(l)+'</p>').join("") : '';
    return '<div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e5e7eb">'
      +'<h2 style="font-size:16px;color:#1a56db;margin:0 0 6px">'+(i+1)+'. '+escHtml(c.title||tryHostname(c.url))+'</h2>'
      +'<p style="font-size:11px;color:#64748b;margin:0 0 4px"><strong>Date:</strong> '+escHtml(new Date(c.capturedAt).toLocaleString())
        +'&nbsp;&nbsp;<strong>Source:</strong> <a href="'+escHtml(c.url)+'" style="color:#1a56db">'+escHtml(c.url.length>80?c.url.slice(0,77)+"…":c.url)+'</a></p>'
      + imgHtml + textHtml + '</div>';
  }).join("");
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<style>body{font-family:Calibri,Arial,sans-serif;font-size:13px;margin:40px;color:#1e293b;max-width:860px}'
    +'h1{font-size:26px;color:#1a56db;margin-bottom:4px}p.sub{color:#94a3b8;font-size:12px;margin-bottom:28px}</style></head><body>'
    +'<h1>'+escHtml(sectionName)+'</h1>'
    +'<p class="sub">Exported: '+escHtml(date)+'&nbsp;&nbsp;·&nbsp;&nbsp;'+clips.length+' clipping(s)</p>'
    +'<hr style="border:none;border-top:2px solid #e5e7eb;margin-bottom:24px"/>'+rows+'</body></html>';
}
function downloadHTML(content, filename) {
  const blob=new Blob([content],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function exportSection(section) {
  const clips = section==="All" ? clippings : clippings.filter(c=>(c.category||"Uncategorized")===section);
  if (!clips.length) { showStatus("No clippings to export.", true); return; }
  const safe=section.replace(/[^a-z0-9\u4e00-\u9fff]+/gi,"-");
  downloadHTML(buildHTML(clips,section), safe+"-"+new Date().toISOString().slice(0,10)+".html");
  showStatus('✓ "'+section+'" exported ('+clips.length+' clips) — open with Word!');
}
function exportAllSections() {
  const cats=[...new Set(clippings.map(c=>c.category||"Uncategorized"))];
  if (!cats.length) { showStatus("Nothing to export.",true); return; }
  const d=new Date().toISOString().slice(0,10);
  cats.forEach(function(cat,idx){
    const clips=clippings.filter(c=>(c.category||"Uncategorized")===cat);
    setTimeout(function(){downloadHTML(buildHTML(clips,cat),cat.replace(/[^a-z0-9\u4e00-\u9fff]+/gi,"-")+"-"+d+".html");},idx*250);
  });
  showStatus("✓ Exported "+cats.length+" section file(s)!");
}

// ── Sync backup / restore ─────────────────────────────────────────────────────
document.getElementById("btn-backup").addEventListener("click", exportBackup);
document.getElementById("btn-restore").addEventListener("click", function(){ document.getElementById("restore-file").click(); });
document.getElementById("restore-file").addEventListener("change", function(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(ev){ try{ importBackup(JSON.parse(ev.target.result)); }catch(err){ showStatus("⚠ Invalid backup file: "+err.message,true); } };
  reader.readAsText(file); e.target.value="";
});
function exportBackup() {
  chrome.runtime.sendMessage({type:"GET_CLIPPINGS"},function(res1){
    chrome.runtime.sendMessage({type:"GET_CATEGORIES"},function(res2){
      const backup={version:1,exportedAt:new Date().toISOString(),
        categories:(res2&&res2.categories)?res2.categories:[],
        clippings:(res1&&res1.clippings)?res1.clippings:[]};
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url; a.download="webclipper-backup-"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      showStatus("✓ Backup exported ("+backup.clippings.length+" clips)");
    });
  });
}
function importBackup(data) {
  if (!data||data.version!==1||!Array.isArray(data.clippings)){showStatus("⚠ Unrecognized backup format.",true);return;}
  chrome.runtime.sendMessage({type:"GET_CLIPPINGS"},function(res1){
    chrome.runtime.sendMessage({type:"GET_CATEGORIES"},function(res2){
      const existing=(res1&&res1.clippings)?res1.clippings:[];
      const existingCats=(res2&&res2.categories)?res2.categories:[];
      const existingIds=new Set(existing.map(c=>c.id));
      const newClips=data.clippings.filter(c=>!existingIds.has(c.id));
      const mergedCats=[...new Set([...existingCats,...(data.categories||[])])];
      const mergedClips=[...existing,...newClips].slice(-500);
      chrome.storage.local.set({webClipperClippings:mergedClips,webClipperCategories:mergedCats},function(){
        loadAll();
        showStatus("✓ Imported "+newClips.length+" new clip(s), "+(data.clippings.length-newClips.length)+" duplicate(s) skipped.");
      });
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryHostname(url){try{return new URL(url).hostname;}catch(e){return url;}}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function escHtml(s){return esc(s);}
function showStatus(msg,isError){
  statusBar.textContent=msg;
  statusBar.className="visible"+(isError?" error":"");
  if(!isError) setTimeout(function(){statusBar.className="";},4500);
}
