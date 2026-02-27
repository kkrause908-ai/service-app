// Dashboard - Calendar + Task List + Detail View + Edit/Delete
(function(){
  const token = localStorage.getItem('token');
  if(!token){ window.location.href = '/login.html'; return; }

  const headers = () => ({ 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' });
  const headersAuth = () => ({ 'Authorization': 'Bearer ' + token });

  const who = document.getElementById('who');
  const logoutBtn = document.getElementById('logout');
  
  let currentMonth = new Date();
  let currentTask = null;
  let currentUser = null;
  let map = null, marker = null;

  logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem('token'); window.location.href = '/login.html'; });

  // Initialize
  async function init(){
    await loadMe();
    renderCalendar();
    await loadTasks();
    attachDelegatedListeners();
  }

  async function loadMe(){
    try{
      const res = await fetch('/me', {headers: headers()});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Error');
      who.textContent = json.username + ' (' + json.role + ')';
      currentUser = json;
    }catch(e){ console.error(e); localStorage.removeItem('token'); window.location.href='/login.html'; }
  }

  // Calendar
  function renderCalendar(){
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    document.getElementById('monthYear').textContent = currentMonth.toLocaleDateString('pl-PL', {month:'long',year:'numeric'});
    
    const firstDay = new Date(year, month, 1).getDay();
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1; // Adjust for Monday=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = document.getElementById('calendarDays');
    days.innerHTML = '';
    
    // Labels (Pn, Wt, Ś, Cz, Pt, So, N)
    const labels = ['Pn', 'Wt', 'Ś', 'Cz', 'Pt', 'So', 'N'];
    labels.forEach(label => {
      const labelEl = document.createElement('div');
      labelEl.className = 'dayLabel';
      labelEl.textContent = label;
      days.appendChild(labelEl);
    });
    
    // Previous month days
    for(let i = adjustedFirstDay - 1; i >= 0; i--){
      const day = daysInPrevMonth - i;
      const cell = createDayCell(day, true);
      days.appendChild(cell);
    }
    
    // Current month days
    for(let i = 1; i <= daysInMonth; i++){
      const cell = createDayCell(i, false, year, month);
      days.appendChild(cell);
    }
    
    // Next month days
    const totalCells = 7 + adjustedFirstDay + daysInMonth;
    const remainingCells = Math.ceil(totalCells / 7) * 7 - totalCells;
    for(let i = 1; i <= remainingCells; i++){
      const cell = createDayCell(i, true);
      days.appendChild(cell);
    }
  }

  function createDayCell(day, other, year, month){
    const cell = document.createElement('div');
    cell.className = 'calendarDay';
    if(other) cell.classList.add('other-month');
    
    const today = new Date();
    if(!other && day === today.getDate() && year === today.getFullYear() && month === today.getMonth()){
      cell.classList.add('today');
    }
    
    const titleEl = document.createElement('div');
    titleEl.className = 'calendarEventTitle';
    titleEl.setAttribute('data-day', day);
    
    cell.innerHTML = `<div class="calendarDayNum">${day}</div>`;
    cell.appendChild(titleEl);
    return cell;
  }

  function updateCalendarEvents(tasks){
    // Clear all event titles
    document.querySelectorAll('.calendarEventTitle').forEach(el => el.textContent = '');
    document.querySelectorAll('.calendarDay.hasEvents').forEach(el => el.classList.remove('hasEvents'));
    
    // Add events to calendar
    tasks.forEach(t => {
      if(!t.created_at) return;
      const d = new Date(t.created_at);
      const day = d.getDate();
      const el = document.querySelector(`.calendarEventTitle[data-day="${day}"]`);
      if(el){
        const cell = el.parentElement;
        cell.classList.add('hasEvents');
        if(!el.textContent) el.textContent = t.title || 'Zlecenie';
      }
    });
  }

  // Tasks
  async function loadTasks(){
    try{
      let url = '/tasks';
      const q = document.getElementById('taskSearch')?.value.trim();
      if(q) {
        url += '?q=' + encodeURIComponent(q);
      }
      const res = await fetch(url);
      const tasks = await res.json();
      updateCalendarEvents(tasks);
      renderTasksList(tasks);
      
      // attach buttons (rebind each time)
      document.getElementById('refreshTasks').addEventListener('click', loadTasks);
      document.getElementById('taskSearch')?.addEventListener('input', loadTasks);
      document.getElementById('prevMonth').addEventListener('click', ()=>{
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderCalendar();
        loadTasks();
      });
      document.getElementById('nextMonth').addEventListener('click', ()=>{
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
        loadTasks();
      });
    }catch(e){ console.error('Load tasks failed', e); }
  }

  function renderTasksList(tasks){
    const container = document.getElementById('tasksList');
    container.innerHTML = '';
    
    if(!tasks.length){
      container.innerHTML = '<div class="muted">Brak zleceń</div>';
      return;
    }
    
    tasks.forEach(t => {
      const row = document.createElement('div');
      row.className = 'taskRow';
      row.setAttribute('data-task-id', t.id);
      
      const status_col = {
        'utworzony': '🆕',
        'w trakcie': '⏳',
        'zakończony': '✓',
        'feedback': '⚠️'
      }[t.status] || '';
      
      row.innerHTML = `
        <div class="taskRowInfo">
          <h4>${status_col} #${t.id} — ${t.title || ''}</h4>
          <p class="taskRowMeta">${t.address || 'Bez adresu'} • <strong>${t.status}</strong> • ${t.assigned_to || '?'}</p>
        </div>
        <div class="taskRowBadges">
          <span class="badge ${t.priority}">${t.priority}</span>
        </div>
      `;
      
      row.addEventListener('click', ()=> openTaskDetail(t.id));
      container.appendChild(row);
    });
  }

  // Detail panel
  async function openTaskDetail(id){
    try{
      const res = await fetch('/tasks/'+id, {headers: headersAuth()});
      const t = await res.json();
      if(!res.ok) throw new Error(t.error||'Error');
      showTaskDetail(t);
    }catch(e){ alert('Błąd: '+e.message); }
  }

  function showTaskDetail(t){
    currentTask = t;
    const sidebar = document.getElementById('detailSidebar');
    sidebar.style.display = 'block';
    
    document.getElementById('taskTitle').textContent = t.title || 'Bez tytułu';
    document.getElementById('taskMeta').textContent = `ID: ${t.id} • Status: ${t.status} • Priorytet: ${t.priority}`;
    document.getElementById('taskDesc').textContent = t.description || '';
    document.getElementById('taskStart').textContent = t.start_time ? new Date(t.start_time).toLocaleString('pl-PL') : '-';
    document.getElementById('taskEnd').textContent = t.end_time ? new Date(t.end_time).toLocaleString('pl-PL') : '-';
    document.getElementById('repairShort').value = t.repair_short || '';
    
    // Admin buttons
    const editBtn = document.getElementById('editBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    if(currentUser.role === 'admin'){
      editBtn.style.display = 'inline-block';
      deleteBtn.style.display = 'inline-block';
    } else {
      editBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
    }
    
    // Map
    if(t.lat && t.lng){
      try{
        if(!map){
          const mapEl = document.getElementById('map');
          map = L.map(mapEl).setView([t.lat, t.lng], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(map);
        }
        if(marker) map.removeLayer(marker);
        marker = L.marker([t.lat, t.lng]).addTo(map);
        map.setView([t.lat, t.lng], 13);
      }catch(e){ console.warn('Map error', e); }
    }
    
    loadPhotos(t.id);
    loadHistory(t.id);
  }

  // Actions
  document.getElementById('closeDetail').addEventListener('click', ()=>{
    document.getElementById('detailSidebar').style.display = 'none';
    currentTask = null;
  });

  document.getElementById('startBtn').addEventListener('click', async ()=>{
    if(!currentTask) return;
    if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
    try{
      const res = await fetch('/tasks/'+currentTask.id, {
        method:'PUT',
        headers: headers(),
        body: JSON.stringify({status:'w trakcie'})
      });
      if(!res.ok) throw new Error('Error');
      alert('Zlecenie rozpoczęte');
      await loadTasks();
      await openTaskDetail(currentTask.id);
    }catch(e){ alert('Błąd: '+e.message); }
  });

  document.getElementById('finishBtn').addEventListener('click', async ()=>{
    if(!currentTask) return;
    if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
    try{
      const res = await fetch('/tasks/'+currentTask.id, {
        method:'PUT',
        headers: headers(),
        body: JSON.stringify({status:'zakończony'})
      });
      if(!res.ok) throw new Error('Error');
      alert('Zlecenie zakończone');
      await loadTasks();
      await openTaskDetail(currentTask.id);
    }catch(e){ alert('Błąd: '+e.message); }
  });

  document.getElementById('saveShort').addEventListener('click', async ()=>{
    if(!currentTask) return;
    const text = document.getElementById('repairShort').value;
    try{
      const res = await fetch('/tasks/'+currentTask.id, {
        method:'PUT',
        headers: headers(),
        body: JSON.stringify({repair_short: text})
      });
      if(!res.ok) throw new Error('Error');
      alert('Zapisano');
    }catch(e){ alert('Błąd: '+e.message); }
  });

  // Edit button
  document.getElementById('editBtn').addEventListener('click', ()=>{
    if(!currentTask) return;
    const form = document.getElementById('editForm');
    form.title.value = currentTask.title || '';
    form.description.value = currentTask.description || '';
    form.assigned_to.value = currentTask.assigned_to || '';
    form.status.value = currentTask.status || 'utworzony';
    form.priority.value = currentTask.priority || 'med';
    form.address.value = currentTask.address || '';
    form.lat.value = currentTask.lat || '';
    form.lng.value = currentTask.lng || '';
    document.getElementById('editModal').style.display = 'flex';
    loadUsersForEdit();
  });

  async function loadUsersForEdit(){
    try{
      const res = await fetch('/users', {headers: headersAuth()});
      if(!res.ok) return;
      const users = await res.json();
      const list = document.getElementById('usersEditList');
      list.innerHTML = '';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.username;
        list.appendChild(opt);
      });
    }catch(e){ console.warn('Load users failed'); }
  }

  document.getElementById('editForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!currentTask) return;
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    try{
      const res = await fetch('/tasks/'+currentTask.id, {
        method:'PUT',
        headers: headers(),
        body: JSON.stringify(data)
      });
      if(!res.ok) throw new Error('Error');
      alert('Zlecenie zaktualizowane');
      document.getElementById('editModal').style.display = 'none';
      await loadTasks();
      await openTaskDetail(currentTask.id);
    }catch(e){ alert('Błąd: '+e.message); }
  });

  document.getElementById('closeEdit').addEventListener('click', ()=>{
    document.getElementById('editModal').style.display = 'none';
  });

  // Delete button
  document.getElementById('deleteBtn').addEventListener('click', async ()=>{
    if(!currentTask) return;
    if(!confirm('Czy napewno chcesz usunąć to zlecenie?')) return;
    try{
      const res = await fetch('/tasks/'+currentTask.id, {
        method:'DELETE',
        headers: headersAuth()
      });
      if(!res.ok) throw new Error('Error');
      alert('Zlecenie usunięte');
      document.getElementById('detailSidebar').style.display = 'none';
      currentTask = null;
      await loadTasks();
    }catch(e){ alert('Błąd: '+e.message); }
  });

  // create task modal handlers
  document.getElementById('newTaskBtn')?.addEventListener('click', ()=>{
    document.getElementById('createModal').style.display = 'flex';
    loadUsersForEdit();
  });
  document.getElementById('closeCreate')?.addEventListener('click', ()=>{
    document.getElementById('createModal').style.display = 'none';
  });
  document.getElementById('createModalForm')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try{
      const res = await fetch('/tasks', {method:'POST', headers: headers(), body: JSON.stringify(data)});
      if(!res.ok){ const j=await res.json(); throw new Error(j.error||''); }
      alert('Zlecenie utworzone');
      document.getElementById('createModal').style.display = 'none';
      await loadTasks();
    }catch(err){ alert('Błąd tworzenia: '+err.message); }
  });

  // Open map
  document.getElementById('openMap').addEventListener('click', ()=>{
    if(!currentTask || !currentTask.lat || !currentTask.lng) return alert('Brak współrzędnych');
    const url = `https://www.openstreetmap.org/?mlat=${currentTask.lat}&mlon=${currentTask.lng}#map=18/${currentTask.lat}/${currentTask.lng}`;
    window.open(url, '_blank');
  });

  // PDF
  document.getElementById('genPdf').addEventListener('click', async ()=>{
    if(!currentTask) return;
    try{
      const res = await fetch(`/tasks/${currentTask.id}/pdf`, {headers: headersAuth()});
      if(!res.ok) throw new Error('Error');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task-${currentTask.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }catch(e){ alert('Błąd: '+e.message); }
  });

  // Photos
  async function loadPhotos(taskId){
    try{
      const res = await fetch(`/tasks/${taskId}/photos`, {headers: headersAuth()});
      if(!res.ok) return;
      const photos = await res.json();
      const container = document.getElementById('photosList');
      container.innerHTML = '';
      photos.forEach(p => {
        const img = document.createElement('img');
        img.src = `/uploads/${p.filename}`;
        img.className = 'thumb';
        container.appendChild(img);
      });
    }catch(e){ console.warn('Load photos failed'); }
  }

  document.getElementById('uploadPhoto').addEventListener('click', async ()=>{
    if(!currentTask) return;
    const input = document.getElementById('photoInput');
    if(!input.files.length) return alert('Wybierz plik');
    const fd = new FormData();
    fd.append('photo', input.files[0]);
    try{
      const res = await fetch(`/tasks/${currentTask.id}/photos`, {
        method:'POST',
        body: fd,
        headers: headersAuth()
      });
      if(!res.ok) throw new Error('Error');
      input.value = '';
      loadPhotos(currentTask.id);
    }catch(e){ alert('Błąd wysyłania: '+e.message); }
  });

  // History
  async function loadHistory(taskId){
    try{
      const res = await fetch(`/tasks/${taskId}/history`, {headers: headersAuth()});
      if(!res.ok) return;
      const items = await res.json();
      const list = document.getElementById('history');
      list.innerHTML = '';
      items.forEach(i => {
        const li = document.createElement('li');
        li.textContent = `${new Date(i.created_at).toLocaleString('pl-PL')} — ${i.username}: ${i.action}${i.details?(' '+i.details):''}`;
        list.appendChild(li);
      });
    }catch(e){ console.warn('Load history failed'); }
  }

  // Signatures
  let signMode = null;
  const modal = document.getElementById('signatureModal');
  const canvas = document.getElementById('signCanvas');
  const ctx = canvas?.getContext('2d');
  let drawing = false;
  
  if(canvas){
    canvas.addEventListener('pointerdown', e=>{ drawing=true; ctx.beginPath(); ctx.moveTo(e.offsetX,e.offsetY); });
    canvas.addEventListener('pointermove', e=>{ if(!drawing) return; ctx.lineTo(e.offsetX,e.offsetY); ctx.stroke(); });
    canvas.addEventListener('pointerup', ()=>drawing=false);
  }

  document.getElementById('clearSign')?.addEventListener('click', ()=> ctx && ctx.clearRect(0,0,canvas.width,canvas.height));
  document.getElementById('cancelSign')?.addEventListener('click', ()=>{ modal.style.display='none'; ctx && ctx.clearRect(0,0,canvas.width,canvas.height); });
  document.getElementById('saveSign')?.addEventListener('click', async ()=>{
    if(!currentTask || !signMode) return;
    const data = canvas.toDataURL('image/png');
    const payload = {};
    payload[signMode] = data;
    try{
      const res = await fetch(`/tasks/${currentTask.id}`, {
        method:'PUT',
        headers: headers(),
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error('Error');
      modal.style.display='none';
      ctx && ctx.clearRect(0,0,canvas.width,canvas.height);
      await openTaskDetail(currentTask.id);
    }catch(e){ alert('Błąd zapisu: '+e.message); }
  });

  function attachDelegatedListeners(){
    document.addEventListener('click', (e)=>{
      if(e.target.matches('[data-sign-executor]')){
        signMode = 'executor_signature';
        modal.style.display = 'flex';
      }
      if(e.target.matches('[data-sign-receiver]')){
        signMode = 'receiver_signature';
        modal.style.display = 'flex';
      }
    });
  }

  // Start
  init();
})();
