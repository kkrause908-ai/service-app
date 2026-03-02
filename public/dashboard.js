// Dashboard - Calendar + Task List + Detail View + Edit/Delete
(function(){
  const token = localStorage.getItem('token');
  if(!token){ window.location.href = '/login.html'; return; }

  const headersAuth = () => ({
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  });

  const who = document.getElementById('who');
  const logoutBtn = document.getElementById('logout');
  
  let currentMonth = new Date();
  let currentTask = null;
  let currentUser = null;
  let map = null, marker = null;
  let allTasks = [];
  let currentPage = 1;
  let currentFilters = { status: '', priority: '' };

  if(logoutBtn){
    logoutBtn.addEventListener('click', ()=>{ 
      localStorage.removeItem('token'); 
      Toast.info('Wylogowywanie...');
      setTimeout(() => window.location.href = '/login.html', 500);
    });
  }

  // Dark mode toggle
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    const savedMode = localStorage.getItem('darkMode') === 'true';
    if (savedMode) {
      document.documentElement.style.colorScheme = 'dark';
      darkModeToggle.textContent = '☀️';
    }
    
    darkModeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.style.colorScheme === 'dark';
      document.documentElement.style.colorScheme = isDark ? 'light' : 'dark';
      localStorage.setItem('darkMode', !isDark);
      darkModeToggle.textContent = isDark ? '🌙' : '☀️';
      Toast.info(isDark ? 'Tryb jasny' : 'Tryb ciemny');
    });
  }

  // Initialize
  async function init(){
    await loadMe();
    renderCalendar();
    await loadTasks();
    await loadStats();
    setupFilterListeners();
    attachAllEventListeners();
    attachDelegatedListeners();
  }

  async function loadMe(){
    try{
      const res = await fetch('/me', {headers: headersAuth()});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Error');
      who.textContent = json.username + ' (' + json.role + ')';
      currentUser = json;
    }catch(e){ 
      console.error(e); 
      localStorage.removeItem('token'); 
      window.location.href='/login.html'; 
    }
  }

  // Statistics
  async function loadStats(){
    try{
      const res = await fetch('/stats', {headers: headersAuth()});
      if(res.ok){
        const stats = await res.json();
        const completed = stats.completed || 0;
        const inProgress = stats.in_progress || 0;
        const total = stats.total_tasks || 0;
        const statsEl = document.getElementById('quickStats');
        if(statsEl){
          statsEl.textContent = `${completed}/${total} - ${inProgress} w trakcie`;
        }
      }
    }catch(e){ console.warn('Stats fetch failed', e); }
  }

  function setupFilterListeners(){
    const statusFilter = document.getElementById('statusFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const searchInput = document.getElementById('taskSearch');
    
    if(statusFilter){
      statusFilter.addEventListener('change', ()=>{
        currentFilters.status = statusFilter.value;
        currentPage = 1;
        loadTasks();
      });
    }
    
    if(priorityFilter){
      priorityFilter.addEventListener('change', ()=>{
        currentFilters.priority = priorityFilter.value;
        currentPage = 1;
        loadTasks();
      });
    }
    
    if(searchInput){
      searchInput.addEventListener('input', debounce(()=>{
        currentPage = 1;
        loadTasks();
      }, 500));
    }
    
    const exportBtn = document.getElementById('exportBtn');
    if(exportBtn){
      exportBtn.addEventListener('click', ()=>{
        if(allTasks.length === 0){
          Toast.warning('Brak zleceń do eksportu');
          return;
        }
        const exportData = allTasks.map(t=>({
          'ID': t.id,
          'Tytuł': t.title,
          'Status': t.status,
          'Priorytet': t.priority,
          'Adres': t.address || '-',
          'Przypisano do': t.assigned_to || '-',
          'Data utworzenia': formatDate(t.created_at, true),
          'Opis': t.description || ''
        }));
        exportToCSV(exportData, `zlecenia-${new Date().toISOString().split('T')[0]}.csv`);
      });
    }
    
    // Month navigation
    document.getElementById('prevMonth')?.addEventListener('click', ()=>{
      currentMonth.setMonth(currentMonth.getMonth() - 1);
      renderCalendar();
      loadTasks();
    });
    document.getElementById('nextMonth')?.addEventListener('click', ()=>{
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      renderCalendar();
      loadTasks();
    });
    
    // Refresh button
    document.getElementById('refreshTasks')?.addEventListener('click', () => {
      currentPage = 1;
      loadTasks();
    });
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

  // Tasks with pagination
  async function loadTasks(){
    try{
      let url = '/tasks?page=' + currentPage + '&limit=20';
      const q = document.getElementById('taskSearch')?.value.trim();
      if(q) {
        url += '&q=' + encodeURIComponent(q);
      }
      if(currentFilters.status){
        url += '&status=' + encodeURIComponent(currentFilters.status);
      }
      if(currentFilters.priority){
        url += '&priority=' + encodeURIComponent(currentFilters.priority);
      }
      
      const res = await fetch(url);
      const response = await res.json();
      
      // Handle pagination response
      if(response.pagination){
        allTasks = response.data || [];
      } else {
        allTasks = response.data || response || [];
      }
      
      updateCalendarEvents(allTasks);
      renderTasksList(allTasks);
    }catch(e){ 
      console.error('Load tasks failed', e); 
      Toast.error('Nie udało się załadować zleceń');
    }
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
    }catch(e){ Toast.error('Błąd: '+e.message); }
  }

  function showTaskDetail(t){
    currentTask = t;
    const sidebar = document.getElementById('detailSidebar');
    sidebar.style.display = 'block';
    
    document.getElementById('taskTitle').textContent = t.title || 'Bez tytułu';
    document.getElementById('taskMeta').textContent = `ID: ${t.id} • Status: ${t.status} • Priorytet: ${t.priority}`;
    document.getElementById('taskDesc').textContent = t.description || '';
    
    const duration = t.duration_seconds ? formatDuration(t.duration_seconds) : '-';
    document.getElementById('taskStart').textContent = formatDate(t.start_time, true) || '-';
    document.getElementById('taskEnd').textContent = formatDate(t.end_time, true) || '-';
    if(t.duration_seconds){
      document.getElementById('taskEnd').textContent += ` (${duration} pracy)`;
    }
    
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

  // Attach all event listeners inside function (called after init)
  function attachAllEventListeners(){
    // Close detail panel
    document.getElementById('closeDetail')?.addEventListener('click', ()=>{
      document.getElementById('detailSidebar').style.display = 'none';
      currentTask = null;
    });

    // Start button
    document.getElementById('startBtn')?.addEventListener('click', async ()=>{
      if(!currentTask) return;
      if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) {
        Toast.error('Brak uprawnień');
        return;
      }
      try{
        const res = await fetch('/tasks/'+currentTask.id, {
          method:'PUT',
          headers: headersAuth(),
          body: JSON.stringify({status:'w trakcie'})
        });
        if(!res.ok) throw new Error('Error');
        Toast.success('Zlecenie rozpoczęte');
        await loadTasks();
        await loadStats();
        await openTaskDetail(currentTask.id);
      }catch(e){ Toast.error('Błąd: '+e.message); }
    });

    // Finish button
    document.getElementById('finishBtn')?.addEventListener('click', async ()=>{
      if(!currentTask) return;
      if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) {
        Toast.error('Brak uprawnień');
        return;
      }
      try{
        const res = await fetch('/tasks/'+currentTask.id, {
          method:'PUT',
          headers: headersAuth(),
          body: JSON.stringify({status:'zakończony'})
        });
        if(!res.ok) throw new Error('Error');
        Toast.success('Zlecenie zakończone');
        await loadTasks();
        await loadStats();
        await openTaskDetail(currentTask.id);
      }catch(e){ Toast.error('Błąd: '+e.message); }
    });

    // Save short repair description
    document.getElementById('saveShort')?.addEventListener('click', async ()=>{
      if(!currentTask) return;
      const text = document.getElementById('repairShort').value;
      try{
        const res = await fetch('/tasks/'+currentTask.id, {
          method:'PUT',
          headers: headersAuth(),
          body: JSON.stringify({repair_short: text})
        });
        if(!res.ok) throw new Error('Error');
        Toast.success('Zapisano opis naprawy');
      }catch(e){ Toast.error('Błąd: '+e.message); }
    });

    // Edit button
    document.getElementById('editBtn')?.addEventListener('click', ()=>{
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

    // Edit form submit
    document.getElementById('editForm')?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if(!currentTask) return;
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd);
      try{
        const res = await fetch('/tasks/'+currentTask.id, {
          method:'PUT',
          headers: headersAuth(),
          body: JSON.stringify(data)
        });
        if(!res.ok) throw new Error('Error');
        Toast.success('Zlecenie zaktualizowane');
        document.getElementById('editModal').style.display = 'none';
        await loadTasks();
        await loadStats();
        await openTaskDetail(currentTask.id);
      }catch(e){ Toast.error('Błąd: '+e.message); }
    });

    // Close edit modal
    document.getElementById('closeEdit')?.addEventListener('click', ()=>{
      document.getElementById('editModal').style.display = 'none';
    });

    // Delete button
    document.getElementById('deleteBtn')?.addEventListener('click', async ()=>{
      if(!currentTask) return;
      if(!confirm('Czy napewno chcesz usunąć to zlecenie?')) return;
      try{
        const res = await fetch('/tasks/'+currentTask.id, {
          method:'DELETE',
          headers: headersAuth()
        });
        if(!res.ok) throw new Error('Error');
        Toast.success('Zlecenie usunięte');
        document.getElementById('detailSidebar').style.display = 'none';
        currentTask = null;
        await loadTasks();
        await loadStats();
      }catch(e){ Toast.error('Błąd: '+e.message); }
    });

    // New task button
    document.getElementById('newTaskBtn')?.addEventListener('click', ()=>{
      document.getElementById('createModal').style.display = 'flex';
      loadUsersForEdit();
    });

    // Close create modal
    document.getElementById('closeCreate')?.addEventListener('click', ()=>{
      document.getElementById('createModal').style.display = 'none';
    });

    // Create form submit
    document.getElementById('createModalForm')?.addEventListener('submit', async e=>{
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try{
        const res = await fetch('/tasks', {method:'POST', headers: headersAuth(), body: JSON.stringify(data)});
        if(!res.ok){ const j=await res.json(); throw new Error(j.error||''); }
        Toast.success('Zlecenie utworzone');
        document.getElementById('createModal').style.display = 'none';
        e.target.reset();
        await loadTasks();
        await loadStats();
      }catch(err){ Toast.error('Błąd tworzenia: '+err.message); }
    });

    // Open map button
    document.getElementById('openMap')?.addEventListener('click', ()=>{
      if(!currentTask || !currentTask.lat || !currentTask.lng) {
        Toast.warning('Brak współrzędnych dla tego zlecenia');
        return;
      }
      const url = `https://www.openstreetmap.org/?mlat=${currentTask.lat}&mlon=${currentTask.lng}#map=18/${currentTask.lat}/${currentTask.lng}`;
      window.open(url, '_blank');
    });

    // Generate PDF button
    document.getElementById('genPdf')?.addEventListener('click', async ()=>{
      if(!currentTask) return;
      try{
        Toast.info('Generowanie PDF...');
        const res = await fetch(`/tasks/${currentTask.id}/pdf`, {headers: headersAuth()});
        if(!res.ok) throw new Error('Error');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `task-${currentTask.id}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        Toast.success('PDF pobrany');
      }catch(e){ Toast.error('Błąd: '+e.message); }
    });

    // Upload photo button
    document.getElementById('uploadPhoto')?.addEventListener('click', async ()=>{
      if(!currentTask) return;
      const input = document.getElementById('photoInput');
      if(!input.files.length) {
        Toast.warning('Wybierz plik');
        return;
      }
      
      try{
        const btn = document.getElementById('uploadPhoto');
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Wysyłanie...';
        
        // Compress image before upload
        const compressedFile = await compressImage(input.files[0], 1200, 1200, 0.85);
        const fd = new FormData();
        fd.append('photo', compressedFile);
        
        const res = await fetch(`/tasks/${currentTask.id}/photos`, {
          method:'POST',
          body: fd,
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });
        
        if(!res.ok) throw new Error('Error uploading');
        
        input.value = '';
        Toast.success('Zdjęcie przesłane');
        await loadPhotos(currentTask.id);
        btn.disabled = false;
        btn.textContent = originalText;
      }catch(e){ 
        Toast.error('Błąd wysyłania: '+e.message);
        const btn = document.getElementById('uploadPhoto');
        btn.disabled = false;
      }
    });
  }

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
        headers: headersAuth(),
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error('Error');
      Toast.success('Podpis zapisany');
      modal.style.display='none';
      ctx && ctx.clearRect(0,0,canvas.width,canvas.height);
      await openTaskDetail(currentTask.id);
    }catch(e){ Toast.error('Błąd zapisu: '+e.message); }
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
  
  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered for offline support'))
      .catch(err => console.log('SW registration failed:', err));
  }
})();
