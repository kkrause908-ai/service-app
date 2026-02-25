(function(){
  const token = localStorage.getItem('token');
  if(!token){ window.location.href = '/login.html'; return; }

  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
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
      const res = await fetch('/me', {headers});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Błąd');
       who.textContent = json.username + ' (' + json.role + ')';
       currentUser = json;
    }catch(e){
      console.error(e); localStorage.removeItem('token'); window.location.href='/login.html';
    }
  }

  async function loadTasks(){
    tasksList.innerHTML = '<li>Ładowanie...</li>';
    try{
      const res = await fetch('/tasks');
      const tasks = await res.json();
      tasksList.innerHTML = '';
      if(!Array.isArray(tasks) || tasks.length===0) tasksList.innerHTML = '<li>Brak zadań</li>';
      tasks.forEach(t=>{
        const li = document.createElement('li');
        li.textContent = (t.id?('#'+t.id+' '):'') + (t.title||'Bez tytułu') + ' — ' + (t.status||'');
        li.style.cursor='pointer';
        li.addEventListener('click', ()=>showTask(t));
        tasksList.appendChild(li);
      });
    }catch(e){
      tasksList.innerHTML = '<li>Błąd: '+e.message+'</li>';
    }
  }

  async function loadUsers(){
    try{
      const res = await fetch('/users', { headers });
      if(!res.ok) return;
      const users = await res.json();
      const datalist = document.getElementById('usersList');
      if(!datalist) return;
      datalist.innerHTML = '';
      users.forEach(u=>{
        const opt = document.createElement('option');
        opt.value = u.username;
        datalist.appendChild(opt);
      });
    }catch(e){ console.warn('Could not load users', e); }
  }

  function showTask(t){
    taskTitle.textContent = t.title || 'Bez tytułu';
    taskMeta.textContent = 'ID: ' + t.id + ' • Status: ' + (t.status||'') + ' • Priority: ' + (t.priority||'');
    taskDesc.textContent = t.description || '';
    currentTask = t;
     document.getElementById('taskStart').textContent = t.start_time || '-';
     document.getElementById('taskEnd').textContent = t.end_time || '-';
     document.getElementById('repairShort').value = t.repair_short || '';
    if(t.lat && t.lng){
      if(!map){
        map = L.map(mapEl).setView([t.lat, t.lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(map);
        marker = L.marker([t.lat, t.lng]).addTo(map);
      } else {
        map.setView([t.lat, t.lng], 13);
        marker.setLatLng([t.lat, t.lng]);
      }
    } else {
      if(map){ map.remove(); map = null; marker = null; }
      mapEl.innerHTML = '<p>Brak współrzędnych dla tego zadania.</p>';
    }
  }

  openMapBtn && openMapBtn.addEventListener('click', ()=>{
    if(!currentTask || !currentTask.lat || !currentTask.lng) return alert('Brak współrzędnych');
    const url = `https://www.openstreetmap.org/?mlat=${currentTask.lat}&mlon=${currentTask.lng}#map=18/${currentTask.lat}/${currentTask.lng}`;
    window.open(url, '_blank');
  });

  genPdfBtn && genPdfBtn.addEventListener('click', async ()=>{
    if(!currentTask) return alert('Wybierz zadanie');
    try{
      const res = await fetch(`/tasks/${currentTask.id}/pdf`, { headers: { 'Authorization': 'Bearer ' + token } });
      if(!res.ok){ const json = await res.json(); throw new Error(json.error||'Błąd generowania PDF'); }
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

   // Start / Finish / Save short repair handlers
   const startBtn = document.getElementById('startBtn');
   const finishBtn = document.getElementById('finishBtn');
   const saveShort = document.getElementById('saveShort');

   startBtn && startBtn.addEventListener('click', async ()=>{
     if(!currentTask) return alert('Wybierz zadanie');
     if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
     try{
       const res = await fetch('/tasks/'+currentTask.id, { method:'PUT', headers, body: JSON.stringify({ status:'w trakcie' }) });
       if(!res.ok) throw new Error((await res.json()).error||'');
       alert('Zlecenie rozpoczęte');
       loadTasks();
     }catch(e){ alert('Błąd: '+e.message); }
   });

   finishBtn && finishBtn.addEventListener('click', async ()=>{
     if(!currentTask) return alert('Wybierz zadanie');
     if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
     try{
       const res = await fetch('/tasks/'+currentTask.id, { method:'PUT', headers, body: JSON.stringify({ status:'zakończony' }) });
       if(!res.ok) throw new Error((await res.json()).error||'');
       alert('Zlecenie zakończone');
       loadTasks();
     }catch(e){ alert('Błąd: '+e.message); }
   });

   saveShort && saveShort.addEventListener('click', async ()=>{
     if(!currentTask) return alert('Wybierz zadanie');
     if(currentUser.role !== 'admin' && currentUser.username !== currentTask.assigned_to) return alert('Brak uprawnień');
     const text = document.getElementById('repairShort').value || '';
     try{
       const res = await fetch('/tasks/'+currentTask.id, { method:'PUT', headers, body: JSON.stringify({ repair_short: text }) });
       if(!res.ok) throw new Error((await res.json()).error||'');
       alert('Zapisano');
       loadTasks();
     }catch(e){ alert('Błąd: '+e.message); }
   });

  // creation UI moved to separate page

  // init
  loadMe();
  loadUsers();
  loadTasks();
})();