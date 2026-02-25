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
  const createBox = document.getElementById('createBox');
  const createForm = document.getElementById('createForm');

  const openMapBtn = document.getElementById('openMap');
  const genPdfBtn = document.getElementById('genPdf');
  const findAddrBtn = document.getElementById('findAddr');
  const createMapEl = document.getElementById('createMap');

  let map, marker;
  let currentTask = null;
  let createMap, createMarker;

  logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem('token'); window.location.href = '/login.html'; });
  refresh.addEventListener('click', loadTasks);

  async function loadMe(){
    try{
      const res = await fetch('/me', {headers});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Błąd');
      who.textContent = json.username + ' (' + json.role + ')';
      if(json.role === 'admin') createBox.style.display = 'block';
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

  // geocode address (Nominatim) for create form
  // initialize mini create map when createBox is shown
  function ensureCreateMap(){
    if(createMap) return;
    try{
      createMap = L.map(createMapEl).setView([50.061, 19.937], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(createMap);
      createMap.on('click', (e)=>{
        const {lat,lng} = e.latlng;
        if(!createMarker) createMarker = L.marker([lat,lng]).addTo(createMap);
        else createMarker.setLatLng([lat,lng]);
        createForm.querySelector('input[name="lat"]').value = lat.toFixed(6);
        createForm.querySelector('input[name="lng"]').value = lng.toFixed(6);
      });
    }catch(e){ console.warn('Leaflet init failed', e); }
  }

  findAddrBtn && findAddrBtn.addEventListener('click', async ()=>{
    const addr = (createForm.querySelector('input[name="address"]').value || '').trim();
    if(!addr) return showFieldError('address','Podaj adres');
    try{
      findAddrBtn.disabled = true;
      findAddrBtn.textContent = 'Szukam...';
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(addr));
      const data = await res.json();
      if(!Array.isArray(data) || data.length===0) return showFieldError('address','Nie znaleziono adresu');
      const first = data[0];
      const lat = parseFloat(first.lat), lon = parseFloat(first.lon);
      createForm.querySelector('input[name="lat"]').value = lat.toFixed(6);
      createForm.querySelector('input[name="lng"]').value = lon.toFixed(6);
      ensureCreateMap();
      createMap.setView([lat,lon],15);
      if(!createMarker) createMarker = L.marker([lat,lon]).addTo(createMap);
      else createMarker.setLatLng([lat,lon]);
      clearFieldError('address');
    }catch(e){ showFieldError('address','Błąd geokodowania'); }
    finally{ findAddrBtn.disabled = false; findAddrBtn.textContent = 'Znajdź'; }
  });

  createForm && createForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    clearAllFieldErrors();
    ensureCreateMap();
    const fd = new FormData(createForm);
    const body = {
      title: fd.get('title'),
      description: fd.get('description'),
      assigned_to: fd.get('assigned_to'),
      address: fd.get('address') || null,
      lat: fd.get('lat') ? Number(fd.get('lat')) : null,
      lng: fd.get('lng') ? Number(fd.get('lng')) : null
    };
    // client-side validation
    let valid = true;
    if(!body.title || body.title.trim().length < 3){ showFieldError('title','Tytuł jest wymagany (min 3 znaki)'); valid=false; }
    const latVal = createForm.querySelector('input[name="lat"]').value.trim();
    const lngVal = createForm.querySelector('input[name="lng"]').value.trim();
    if((latVal && !lngVal) || (!latVal && lngVal)){ showFieldError('lat','Wprowadź obie współrzędne lub zostaw puste'); showFieldError('lng','Wprowadź obie współrzędne lub zostaw puste'); valid=false; }
    if(!valid) return;
    body.status = fd.get('status');
    body.priority = fd.get('priority');
    try{
      const res = await fetch('/tasks', {method:'POST', headers, body:JSON.stringify(body)});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Błąd tworzenia');
      loadTasks();
      createForm.reset();
      if(createMarker){ createMap.removeLayer(createMarker); createMarker = null; }
    }catch(err){
      alert('Błąd: '+err.message);
    }
  });

  function showFieldError(name,msg){
    const el = createForm.querySelector(`[data-for=\"${name}\"]`);
    if(el) el.textContent = msg;
  }
  function clearFieldError(name){
    const el = createForm.querySelector(`[data-for=\"${name}\"]`);
    if(el) el.textContent = '';
  }
  function clearAllFieldErrors(){
    createForm.querySelectorAll('.error').forEach(s=>s.textContent='');
  }

  // init
  loadMe();
  loadUsers();
  loadTasks();
})();