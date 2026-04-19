// content.js — text copy + screenshot + PDF clipboard capture
(function () {
  if (window.__webClipperRegistered) return;
  window.__webClipperRegistered = true;

  // ─── Detect context ──────────────────────────────────────────────────────
  const isPdfPage = (
    /\.pdf(\?.*)?$/i.test(location.href) ||
    /\.pdf(\?.*)?$/i.test(location.pathname) ||
    document.contentType === "application/pdf" ||
    !!document.querySelector('embed[type="application/pdf"], object[type="application/pdf"]')
  );

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
                    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function getPageTitle() {
    const og = document.querySelector('meta[property="og:title"]');
    return (og && og.content) ? og.content.trim() : (document.title||"").trim();
  }
  function getSelectedText() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0 || sel.isCollapsed) return "";
    try {
      const div = document.createElement("div");
      div.appendChild(sel.getRangeAt(0).cloneContents());
      div.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,br,tr")
         .forEach(el => el.insertAdjacentText("afterend","\n"));
      return (div.innerText||div.textContent||"").replace(/\n{3,}/g,"\n\n").trim();
    } catch(e) { return window.getSelection().toString().trim(); }
  }

  // ─── Regular copy handler (non-PDF pages) ───────────────────────────────
  if (!isPdfPage) {
    document.addEventListener("copy", function() {
      const text = getSelectedText();
      if (!text) return;
      const clipping = {
        id: Date.now(), type: "text",
        text, url: location.href,
        title: getPageTitle(),
        capturedAt: new Date().toISOString(),
        category: null
      };
      try {
        chrome.runtime.sendMessage({ type: "GET_CATEGORIES" }, function(res) {
          showPicker(clipping, (res&&res.categories)?res.categories:[]);
        });
      } catch(e) { showPicker(clipping, []); }
    }, true);
  }

  // ─── PDF mode: floating capture bar ─────────────────────────────────────
  if (isPdfPage) {
    // Wait a moment for the PDF to render before showing the bar
    setTimeout(buildPdfBar, 800);
  }

  function buildPdfBar() {
    if (document.getElementById("__wc_pdfbar__")) return;

    const bar = document.createElement("div");
    bar.id = "__wc_pdfbar__";
    bar.setAttribute("style", [
      "position:fixed","top:0","left:0","right:0","z-index:2147483647",
      "background:linear-gradient(135deg,#1a56db,#2563eb)",
      "color:#fff","padding:8px 16px",
      "display:flex","align-items:center","gap:10px",
      "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "font-size:13px","box-shadow:0 2px 12px rgba(0,0,0,0.25)"
    ].join(";"));

    bar.innerHTML = [
      '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" style="flex-shrink:0">',
        '<path fill="rgba(255,255,255,0.9)" d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/>',
        '<path stroke="rgba(26,86,219,0.7)" stroke-width="1.5" stroke-linecap="round" d="M9 8h6M9 11h6M9 14h4"/>',
      '</svg>',
      '<span style="flex:1;font-size:12px">',
        '<strong>Web Clipper</strong> — PDF detected.',
        ' Select text in the PDF, press <kbd style="background:rgba(255,255,255,0.2);padding:1px 5px;border-radius:3px">Ctrl+C</kbd>,',
        ' then click <strong>Capture</strong>',
      '</span>',
      '<button id="__wc_capturebtn__" style="',
        'padding:6px 14px;background:#fff;color:#1a56db;border:none;border-radius:7px;',
        'font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;',
        'display:inline-flex;align-items:center;gap:5px',
      '">',
        '<svg width="12" height="12" fill="none" viewBox="0 0 24 24">',
          '<path stroke="currentColor" stroke-width="2" stroke-linecap="round" ',
          'd="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>',
        '</svg>',
        'Capture Clipboard',
      '</button>',
      '<button id="__wc_closebar__" style="',
        'background:none;border:none;color:rgba(255,255,255,0.7);font-size:18px;',
        'cursor:pointer;padding:0 4px;line-height:1;font-family:inherit',
      '">×</button>'
    ].join("");

    document.body.appendChild(bar);

    document.getElementById("__wc_capturebtn__").addEventListener("click", captureClipboard);
    document.getElementById("__wc_closebar__").addEventListener("click", function() { bar.remove(); });

    // Also intercept Ctrl+C in PDF pages via keydown (fires before clipboard write)
    document.addEventListener("keydown", function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        // Small delay to let clipboard be written first
        setTimeout(captureClipboard, 120);
      }
    }, true);
  }

  // ─── Capture from system clipboard ──────────────────────────────────────
  function captureClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      // Fallback: ask background to trigger popup capture
      showToast("⚠ Click the extension icon → Capture Clipboard");
      return;
    }
    navigator.clipboard.readText().then(function(text) {
      text = (text || "").trim();
      if (!text) {
        showToast("Clipboard is empty — select text in PDF then Ctrl+C first");
        return;
      }
      const clipping = {
        id: Date.now(), type: "text",
        text: text,
        url: location.href,
        title: getPageTitle() || "PDF Document",
        capturedAt: new Date().toISOString(),
        category: null,
        source: "pdf"
      };
      try {
        chrome.runtime.sendMessage({ type:"GET_CATEGORIES" }, function(res) {
          showPicker(clipping, (res&&res.categories)?res.categories:[]);
        });
      } catch(e) { showPicker(clipping, []); }
    }).catch(function(err) {
      // Permission denied — show instructions
      showToast("⚠ Clipboard access denied. Try: click the address bar first, then retry.");
    });
  }

  // Expose for background to trigger via scripting.executeScript
  window.__wcCaptureClipboard = captureClipboard;

  // ─── Screenshot mode ─────────────────────────────────────────────────────
  window.__wcStartScreenshot = function() {
    if (document.getElementById("__wc_overlay__")) return;
    buildOverlay();
  };

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "__wc_overlay__";
    overlay.setAttribute("style",[
      "position:fixed","inset:0","z-index:2147483640",
      "cursor:crosshair","background:rgba(0,0,0,0.35)",
      "user-select:none","-webkit-user-select:none"
    ].join(";"));

    const tip = document.createElement("div");
    tip.setAttribute("style",[
      "position:absolute","top:16px","left:50%","transform:translateX(-50%)",
      "background:rgba(0,0,0,0.75)","color:#fff","padding:8px 18px",
      "border-radius:20px","font-size:13px",
      "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "pointer-events:none","white-space:nowrap"
    ].join(";"));
    tip.textContent = "Drag to select area  •  Esc to cancel";
    overlay.appendChild(tip);

    const sel = document.createElement("div");
    sel.setAttribute("style",[
      "position:absolute","border:2px solid #1a56db",
      "background:rgba(26,86,219,0.12)","display:none","pointer-events:none"
    ].join(";"));
    overlay.appendChild(sel);
    document.body.appendChild(overlay);

    let startX=0, startY=0, dragging=false;

    overlay.addEventListener("mousedown", function(e) {
      e.preventDefault();
      dragging=true; startX=e.clientX; startY=e.clientY;
      sel.style.cssText += ";left:"+startX+"px;top:"+startY+"px;width:0;height:0;display:block";
    });
    overlay.addEventListener("mousemove", function(e) {
      if (!dragging) return;
      const x=Math.min(e.clientX,startX), y=Math.min(e.clientY,startY);
      const w=Math.abs(e.clientX-startX), h=Math.abs(e.clientY-startY);
      sel.style.left=x+"px"; sel.style.top=y+"px";
      sel.style.width=w+"px"; sel.style.height=h+"px";
    });
    overlay.addEventListener("mouseup", function(e) {
      if (!dragging) return;
      dragging=false;
      const x=Math.min(e.clientX,startX), y=Math.min(e.clientY,startY);
      const w=Math.abs(e.clientX-startX), h=Math.abs(e.clientY-startY);
      if (w<10||h<10) { removeOverlay(); return; }
      overlay.style.display="none";
      setTimeout(function() {
        chrome.runtime.sendMessage({type:"CAPTURE_AREA"}, function(res) {
          removeOverlay();
          if (!res||res.error||!res.dataUrl) { showToast("⚠ Screenshot failed"); return; }
          cropAndSave(res.dataUrl, x, y, w, h);
        });
      }, 80);
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key==="Escape") { removeOverlay(); document.removeEventListener("keydown",onKey); }
    });
  }

  function removeOverlay() {
    const ov=document.getElementById("__wc_overlay__");
    if (ov) ov.remove();
  }

  function cropAndSave(fullDataUrl, x, y, w, h) {
    const dpr=window.devicePixelRatio||1;
    const img=new Image();
    img.onload=function() {
      const canvas=document.createElement("canvas");
      canvas.width=w*dpr; canvas.height=h*dpr;
      canvas.getContext("2d").drawImage(img, x*dpr,y*dpr,w*dpr,h*dpr, 0,0,w*dpr,h*dpr);
      const clipping={
        id:Date.now(), type:"screenshot",
        imageData:canvas.toDataURL("image/png"),
        text:"[Screenshot]",
        url:location.href,
        title:getPageTitle(),
        capturedAt:new Date().toISOString(),
        category:null
      };
      try {
        chrome.runtime.sendMessage({type:"GET_CATEGORIES"}, function(res) {
          showPicker(clipping, (res&&res.categories)?res.categories:[]);
        });
      } catch(e) { showPicker(clipping,[]); }
    };
    img.src=fullDataUrl;
  }

  // ─── Category picker (shared) ────────────────────────────────────────────
  var dismissTimer=null;

  function showPicker(clipping, cats) {
    removePicker();
    const isShot = clipping.type==="screenshot";
    const isPdf  = clipping.source==="pdf";

    const previewHTML = isShot
      ? '<img src="'+clipping.imageData+'" style="max-width:100%;max-height:80px;border-radius:4px;display:block;margin-bottom:4px"/>'
      : '<div style="font-size:11px;color:#64748b;max-height:34px;overflow:hidden;margin-bottom:6px">'
          + (isPdf ? '📄 PDF: ' : '') + esc(clipping.text.slice(0,80))
          + (clipping.text.length>80?"…":"") + '</div>';

    const panel=document.createElement("div");
    panel.id="__wc_picker__";
    panel.setAttribute("style",[
      "position:fixed","bottom:24px","right:24px","z-index:2147483647",
      "background:#fff","border:1px solid #e2e8f0","border-radius:12px",
      "padding:14px 16px","width:320px",
      "box-shadow:0 8px 30px rgba(0,0,0,0.18)",
      "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "font-size:13px","color:#1e293b","line-height:1.4"
    ].join(";"));

    panel.innerHTML = [
      '<div style="font-weight:700;margin-bottom:7px">',
        isShot ? "📷 Save screenshot to section:"
               : isPdf ? "📄 Save PDF text to section:"
               : "📋 Save clipping to section:",
      '</div>',
      previewHTML,
      '<div id="__wc_catbtns__" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px"></div>',
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">',
        '<input id="__wc_inp__" type="text" placeholder="New section name…"',
          ' style="flex:1;padding:5px 9px;border:1px solid #cbd5e1;border-radius:6px;',
                  'font-size:12px;font-family:inherit;outline:none;color:#1e293b"/>',
        '<button id="__wc_addbtn__"',
          ' style="padding:5px 11px;background:#1a56db;color:#fff;border:none;',
                  'border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit">Save</button>',
      '</div>',
      '<div style="text-align:right">',
        '<button id="__wc_skipbtn__"',
          ' style="padding:4px 10px;background:#f1f5f9;color:#64748b;border:none;',
                  'border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit">',
          'Skip (save uncategorized)',
        '</button>',
      '</div>'
    ].join("");

    document.body.appendChild(panel);

    // Category buttons
    const ctns=panel.querySelector("#__wc_catbtns__");
    if (!cats.length) {
      ctns.innerHTML='<span style="font-size:11px;color:#94a3b8">No sections yet — type one below</span>';
    } else {
      cats.forEach(function(cat) {
        const b=document.createElement("button");
        b.textContent=cat;
        b.setAttribute("style","padding:5px 12px;background:#eff6ff;color:#1a56db;"
          +"border:1px solid #bfdbfe;border-radius:20px;font-size:12px;cursor:pointer;font-family:inherit");
        b.addEventListener("mouseenter",function(){b.style.background="#dbeafe";});
        b.addEventListener("mouseleave",function(){b.style.background="#eff6ff";});
        b.addEventListener("click",function(){doSave(cat);});
        ctns.appendChild(b);
      });
    }

    const inp=panel.querySelector("#__wc_inp__");
    panel.querySelector("#__wc_addbtn__").addEventListener("click",function(){
      const n=inp.value.trim(); if(!n){inp.focus();return;} doSave(n);
    });
    inp.addEventListener("keydown",function(e){if(e.key==="Enter"){const n=inp.value.trim();if(n)doSave(n);}});
    panel.querySelector("#__wc_skipbtn__").addEventListener("click",function(){doSave("Uncategorized");});
    setTimeout(function(){if(inp)inp.focus();},80);

    dismissTimer=setTimeout(function(){doSave("Uncategorized");},20000);

    function doSave(category) {
      clearTimeout(dismissTimer);
      clipping.category=category;
      try {
        chrome.runtime.sendMessage({type:"SAVE_CLIPPING",clipping:clipping},function(res){
          removePicker();
          showToast('✓ Saved to "'+category+'" ('+(res&&res.total||"?")+' clips)');
        });
      } catch(e){ removePicker(); showToast("⚠ Could not save — reload the page"); }
    }
  }

  function removePicker() {
    clearTimeout(dismissTimer);
    const p=document.getElementById("__wc_picker__");
    if(p) p.remove();
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const old=document.getElementById("__wc_toast__");
    if(old) old.remove();
    const t=document.createElement("div");
    t.id="__wc_toast__";
    t.textContent=msg;
    t.setAttribute("style","position:fixed;bottom:24px;right:24px;z-index:2147483647;"
      +"background:#1a56db;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;"
      +"font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;"
      +"box-shadow:0 4px 14px rgba(0,0,0,0.25);opacity:1;transition:opacity 0.4s;pointer-events:none");
    document.body.appendChild(t);
    setTimeout(function(){t.style.opacity="0";setTimeout(function(){if(t.parentNode)t.remove();},450);},2800);
  }

})();
