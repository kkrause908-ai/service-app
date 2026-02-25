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

  let map, marker;

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

  function showTask(t){
    taskTitle.textContent = t.title || 'Bez tytułu';
    taskMeta.textContent = 'ID: ' + t.id + ' • Status: ' + (t.status||'');
    taskDesc.textContent = t.description || '';
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

  createForm && createForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(createForm);
    const body = {
      title: fd.get('title'),
      description: fd.get('description'),
      assigned_to: fd.get('assigned_to'),
      address: fd.get('address') || null,
      lat: fd.get('lat') ? Number(fd.get('lat')) : null,
      lng: fd.get('lng') ? Number(fd.get('lng')) : null
    };
    try{
      const res = await fetch('/tasks', {method:'POST', headers, body:JSON.stringify(body)});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||'Błąd tworzenia');
      loadTasks();
      createForm.reset();
    }catch(err){
      alert('Błąd: '+err.message);
    }
  });

  // init
  loadMe();
  loadTasks();
})();