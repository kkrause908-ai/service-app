/**
 * create.js - handles create task page, map interaction and geocoding
 */
(function(){
  const token = localStorage.getItem('token');
  if(!token){ window.location.href = '/login.html'; return; }
  const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  const who = document.getElementById('who');
  const logoutBtn = document.getElementById('logout');
  const createForm = document.getElementById('createForm');
  const findAddrBtn = document.getElementById('findAddr');
  const createMapEl = document.getElementById('createMap');

  logoutBtn && logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem('token'); window.location.href = '/login.html'; });

  (async function loadMe(){
    try{
      const res = await fetch('/me', { headers });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'');
      who.textContent = json.username + ' (' + json.role + ')';
    }catch(e){ localStorage.removeItem('token'); window.location.href = '/login.html'; }
  })();

  async function loadUsers(){
    try{
      const res = await fetch('/users', { headers });
      if(!res.ok) return;
      const users = await res.json();
      const datalist = document.getElementById('usersList');
      datalist.innerHTML = '';
      users.forEach(u=>{ const opt = document.createElement('option'); opt.value = u.username; datalist.appendChild(opt); });
    }catch(e){ console.warn(e); }
  }

  let map, marker;
  function ensureMap(){
    if(map) return;
    try{
      map = L.map(createMapEl).setView([50.061,19.937],13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
      map.on('click', e=>{
        const {lat,lng} = e.latlng;
        if(!marker) marker = L.marker([lat,lng]).addTo(map);
        else marker.setLatLng([lat,lng]);
        createForm.querySelector('input[name="lat"]').value = lat.toFixed(6);
        createForm.querySelector('input[name="lng"]').value = lng.toFixed(6);
      });
    }catch(e){ console.warn('map init failed', e); }
  }

  findAddrBtn && findAddrBtn.addEventListener('click', async ()=>{
    const addr = (createForm.querySelector('input[name="address"]').value || '').trim();
    if(!addr) return showFieldError('address','Podaj adres');
    try{
      findAddrBtn.disabled = true; findAddrBtn.textContent = 'Szukam...';
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(addr);
      const res = await fetch(url, {headers:{'Accept-Language':'pl'}});
      if(!res.ok) throw new Error('Błąd serwera geokodowania');
      const data = await res.json();
      if(!Array.isArray(data) || data.length===0) return showFieldError('address','Nie znaleziono adresu');
      const first = data[0];
      const lat = parseFloat(first.lat), lon = parseFloat(first.lon);
      createForm.querySelector('input[name="lat"]').value = lat.toFixed(6);
      createForm.querySelector('input[name="lng"]').value = lon.toFixed(6);
      ensureMap();
      map.setView([lat,lon],15);
      if(!marker) marker = L.marker([lat,lon]).addTo(map); else marker.setLatLng([lat,lon]);
      clearFieldError('address');
    }catch(e){ console.warn(e); showFieldError('address','Błąd geokodowania — spróbuj ponownie'); }
    finally{ findAddrBtn.disabled=false; findAddrBtn.textContent='Znajdź'; }
  });

  createForm && createForm.addEventListener('submit', async e=>{
    e.preventDefault(); clearAllFieldErrors(); ensureMap();
    const fd = new FormData(createForm);
    const body = {
      title: fd.get('title'),
      description: fd.get('description'),
      assigned_to: fd.get('assigned_to'),
      status: fd.get('status'),
      priority: fd.get('priority'),
      address: fd.get('address') || null,
      lat: fd.get('lat') ? Number(fd.get('lat')) : null,
      lng: fd.get('lng') ? Number(fd.get('lng')) : null
    };
    let valid=true;
    if(!body.title || body.title.trim().length<3){ showFieldError('title','Tytuł jest wymagany (min 3 znaki)'); valid=false; }
    const latv = createForm.querySelector('input[name="lat"]').value.trim();
    const lngv = createForm.querySelector('input[name="lng"]').value.trim();
    if((latv && !lngv) || (!latv && lngv)){ showFieldError('lat','Podaj obie współrzędne lub obie puste'); showFieldError('lng','Podaj obie współrzędne lub obie puste'); valid=false; }
    if(!valid) return;
    try{
      const res = await fetch('/tasks', { method:'POST', headers, body: JSON.stringify(body) });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Błąd');
      alert('Zlecenie utworzone'); createForm.reset(); if(marker){ marker.remove(); marker=null; }
    }catch(e){ alert('Błąd: '+(e.message||e)); }
  });

  function showFieldError(name,msg){ const el = createForm.querySelector(`[data-for="${name}"]`); if(el) el.textContent=msg; }
  function clearFieldError(name){ const el = createForm.querySelector(`[data-for="${name}"]`); if(el) el.textContent=''; }
  function clearAllFieldErrors(){ createForm.querySelectorAll('.error').forEach(s=>s.textContent=''); }

  loadUsers();
})();
