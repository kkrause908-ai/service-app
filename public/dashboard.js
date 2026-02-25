// Updated dashboard script: cards, photos, history and signature capture
(function(){
  const token = localStorage.getItem('token');
  if(!token){ window.location.href = '/login.html'; return; }

  const headers = () => ({ 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' });
  const headersAuth = () => ({ 'Authorization': 'Bearer ' + token });

  const who = document.getElementById('who');
  const logoutBtn = document.getElementById('logout');
  const refresh = document.getElementById('refresh');
  const tasksList = document.getElementById('tasksList');
  const taskTitle = document.getElementById('taskTitle');
  const taskMeta = document.getElementById('taskMeta');
  const taskDesc = document.getElementById('taskDesc');
  const mapEl = document.getElementById('map');
  const openMapBtn = document.getElementById('openMap');
  const genPdfBtn = document.getElementById('genPdf');

  let map, marker;
  let currentTask = null;
  let currentUser = null;

  logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem('token'); window.location.href = '/login.html'; });
  refresh.addEventListener('click', loadTasks);

  async function loadMe(){
    try{
      const res = await fetch('/me', {headers: headers()});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Błąd');
      who.textContent = json.username + ' (' + json.role + ')';
      currentUser = json;
    }catch(e){ console.error(e); localStorage.removeItem('token'); window.location.href='/login.html'; }
  }

  async function loadTasks(){
    tasksList.innerHTML = '<li>Ładowanie...</li>';
    try{
      const res = await fetch('/tasks');
      const tasks = await res.json();
      tasksList.innerHTML = '';
      if(!Array.isArray(tasks) || tasks.length===0) { tasksList.innerHTML = '<li>Brak zadań</li>'; return; }

      const grid = document.createElement('div');
      grid.className = 'cardsGrid';
      tasks.forEach(t=>{
        const card = document.createElement('div');
        card.className = 'taskCard';
        card.innerHTML = `
          <div class="cardHeader">
            <strong>#${t.id} ${t.title||''}</strong>
            <span class="badge ${t.priority}">${t.priority||''}</span>
          </div>
          <div class="cardBody">
            <div class="cardAddress">${t.address||''}</div>
            <div class="cardMeta">Status: <em>${t.status||''}</em></div>
          </div>
          <div class="cardActions">
            <button class="btn small openTask" data-id="${t.id}">Otwórz</button>
            <button class="btn small pdfTask" data-id="${t.id}">PDF</button>
          </div>
        `;
        grid.appendChild(card);
      });
      tasksList.appendChild(grid);

      // delegate clicks
      tasksList.querySelectorAll('.openTask').forEach(b=> b.addEventListener('click', e=> showTaskById(e.target.dataset.id)));
      tasksList.querySelectorAll('.pdfTask').forEach(b=> b.addEventListener('click', e=> window.open(`/tasks/${e.target.dataset.id}/pdf`, '_blank')));
    }catch(e){ tasksList.innerHTML = '<li>Błąd: '+e.message+'</li>'; }
  }

  async function loadUsers(){
    try{
      const res = await fetch('/users', { headers: headersAuth() });
      if(!res.ok) return;
      const users = await res.json();
      const datalist = document.getElementById('usersList');
      if(!datalist) return;
      datalist.innerHTML = '';
      users.forEach(u=>{ const opt = document.createElement('option'); opt.value = u.username; datalist.appendChild(opt); });
    }catch(e){ console.warn('Could not load users', e); }
  }

  async function showTaskById(id){
    try{
      const res = await fetch('/tasks/'+id, { headers: headersAuth() });
      const t = await res.json();
      if(!res.ok) throw new Error(t.error||'Błąd');
      showTask(t);
    }catch(e){ alert('Błąd: '+e.message); }
  }

  function showTask(t){
    taskTitle.textContent = t.title || 'Bez tytułu';
    taskMeta.textContent = 'ID: ' + t.id + ' • Status: ' + (t.status||'') + ' • Priority: ' + (t.priority||'');
    taskDesc.textContent = t.description || '';
    currentTask = t;
    document.getElementById('taskStart').textContent = t.start_time || '-';
    document.getElementById('taskEnd').textContent = t.end_time || '-';
    document.getElementById('repairShort').value = t.repair_short || '';

    // ensure map
    if(t.lat && t.lng){
      if(!map){ map = L.map(mapEl).setView([t.lat, t.lng], 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(map); marker = L.marker([t.lat, t.lng]).addTo(map); }
      else { map.setView([t.lat, t.lng], 13); marker.setLatLng([t.lat, t.lng]); }
    } else { if(map){ map.remove(); map = null; marker = null; } mapEl.innerHTML = '<p>Brak współrzędnych dla tego zadania.</p>'; }

    // load photos and history
    loadPhotos(t.id);
    loadHistory(t.id);

    // add signature buttons if not present
    const taskActions = document.getElementById('taskActions');
    if(taskActions && !document.getElementById('executorSignBtn')){
      const execBtn = document.createElement('button'); execBtn.id = 'executorSignBtn'; execBtn.setAttribute('data-sign-executor',''); execBtn.textContent = 'Podpis wykonawcy';
      const recBtn = document.createElement('button'); recBtn.id = 'receiverSignBtn'; recBtn.setAttribute('data-sign-receiver',''); recBtn.textContent = 'Podpis odbiorcy';
      taskActions.appendChild(execBtn); taskActions.appendChild(recBtn);
    }
  }

  openMapBtn && openMapBtn.addEventListener('click', ()=>{ if(!currentTask || !currentTask.lat || !currentTask.lng) return alert('Brak współrzędnych'); const url = `https://www.openstreetmap.org/?mlat=${currentTask.lat}&mlon=${currentTask.lng}#map=18/${currentTask.lat}/${currentTask.lng}`; window.open(url, '_blank'); });

  genPdfBtn && genPdfBtn.addEventListener('click', async ()=>{
    if(!currentTask) return alert('Wybierz zadanie');
    try{
      const res = await fetch(`/tasks/${currentTask.id}/pdf`, { headers: headersAuth() });
      if(!res.ok){ const json = await res.json(); throw new Error(json.error||'Błąd generowania PDF'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `task-${currentTask.id}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }catch(e){ alert('Błąd: '+e.message); }
  });

  // Start / Finish / Save short repair handlers (reuse existing buttons)
  const startBtn = document.getElementById('startBtn');
  const finishBtn = document.getElementById('finishBtn');
  const saveShort = document.getElementById('saveShort');

  startBtn && startBtn.addEventListener('click', async ()=>{
    if(!currentTask) return alert('Wybierz zadanie');
    if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
    try{ const res = await fetch('/tasks/'+currentTask.id, { method:'PUT', headers: headers(), body: JSON.stringify({ status:'w trakcie' }) }); if(!res.ok) throw new Error((await res.json()).error||''); alert('Zlecenie rozpoczęte'); loadTasks(); }catch(e){ alert('Błąd: '+e.message); }
  });

  finishBtn && finishBtn.addEventListener('click', async ()=>{
    if(!currentTask) return alert('Wybierz zadanie');
    if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
    try{ const res = await fetch('/tasks/'+currentTask.id, { method:'PUT', headers: headers(), body: JSON.stringify({ status:'zakończony' }) }); if(!res.ok) throw new Error((await res.json()).error||''); alert('Zlecenie zakończone'); loadTasks(); }catch(e){ alert('Błąd: '+e.message); }
  });

  saveShort && saveShort.addEventListener('click', async ()=>{
    if(!currentTask) return alert('Wybierz zadanie');
    if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
    const text = document.getElementById('repairShort').value || '';
    try{ const res = await fetch('/tasks/'+currentTask.id, { method:'PUT', headers: headers(), body: JSON.stringify({ repair_short: text }) }); if(!res.ok) throw new Error((await res.json()).error||''); alert('Zapisano'); loadTasks(); }catch(e){ alert('Błąd: '+e.message); }
  });

  // Photos
  async function loadPhotos(taskId){
    try{
      const res = await fetch(`/tasks/${taskId}/photos`, { headers: headersAuth() });
      if(!res.ok) return;
      const photos = await res.json();
      const container = document.getElementById('photosList');
      container.innerHTML = '';
      photos.forEach(p=>{ const img = document.createElement('img'); img.src = `/uploads/${p.filename}`; img.className = 'thumb'; container.appendChild(img); });
    }catch(e){ console.warn('photos', e); }
  }

  document.getElementById('uploadPhoto')?.addEventListener('click', async ()=>{
    if(!currentTask) return alert('Wybierz zlecenie');
    const input = document.getElementById('photoInput'); if(!input.files.length) return alert('Wybierz plik');
    const fd = new FormData(); fd.append('photo', input.files[0]);
    try{
      const res = await fetch(`/tasks/${currentTask.id}/photos`, { method:'POST', body: fd, headers: headersAuth() });
      if(!res.ok) throw new Error('Upload error');
      input.value=''; loadPhotos(currentTask.id);
    }catch(e){ alert('Błąd wysyłania zdjęcia'); }
  });

  // History
  async function loadHistory(taskId){
    try{
      const res = await fetch(`/tasks/${taskId}/history`, { headers: headersAuth() });
      if(!res.ok) return;
      const items = await res.json();
      const list = document.getElementById('history'); list.innerHTML = '';
      items.forEach(i=>{ const li = document.createElement('li'); li.textContent = `${new Date(i.created_at).toLocaleString()} — ${i.username}: ${i.action}${i.details?(' - '+i.details):''}`; list.appendChild(li); });
    }catch(e){ console.warn('history', e); }
  }

  // Signature modal
  let signMode = null;
  const modal = document.getElementById('signatureModal');
  const canvas = document.getElementById('signCanvas');
  const ctx = canvas?.getContext('2d');
  let drawing = false;
  if(canvas){
    canvas.addEventListener('pointerdown', e=>{ drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
    canvas.addEventListener('pointermove', e=>{ if(!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); });
    canvas.addEventListener('pointerup', ()=> drawing=false);
  }

  document.getElementById('clearSign')?.addEventListener('click', ()=> ctx && ctx.clearRect(0,0,canvas.width,canvas.height));
  document.getElementById('cancelSign')?.addEventListener('click', ()=>{ if(modal) modal.style.display='none'; ctx && ctx.clearRect(0,0,canvas.width,canvas.height); });
  document.getElementById('saveSign')?.addEventListener('click', async ()=>{
    if(!currentTask || !signMode) return;
    const data = canvas.toDataURL('image/png'); const payload = {}; payload[signMode] = data;
    try{
      const res = await fetch(`/tasks/${currentTask.id}`, { method:'PUT', headers: headers(), body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('save sign failed');
      modal.style.display='none'; ctx && ctx.clearRect(0,0,canvas.width,canvas.height); showTask(currentTask);
    }catch(e){ alert('Błąd zapisu podpisu'); }
  });

  document.addEventListener('click', (e)=>{
    if(e.target && e.target.matches && e.target.matches('[data-sign-executor]')){ signMode = 'executor_signature'; modal.style.display='block'; }
    if(e.target && e.target.matches && e.target.matches('[data-sign-receiver]')){ signMode = 'receiver_signature'; modal.style.display='block'; }
  });

  // init
  loadMe(); loadUsers(); loadTasks();
})();