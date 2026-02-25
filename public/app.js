document.getElementById('checkHealth').addEventListener('click', async ()=>{
  const out = document.getElementById('healthResult');
  out.textContent = 'Ładowanie...';
  try{
    const res = await fetch('/health');
    const json = await res.json();
    out.textContent = JSON.stringify(json, null, 2);
  }catch(e){
    out.textContent = 'Błąd: ' + e.message;
  }
});

document.getElementById('loadTasks').addEventListener('click', async ()=>{
  const list = document.getElementById('tasks');
  list.innerHTML = 'Ładowanie...';
  try{
    const res = await fetch('/tasks');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const tasks = await res.json();
    if(!Array.isArray(tasks) || tasks.length===0){
      list.innerHTML = '<li>Brak zadań</li>';
      return;
    }
    list.innerHTML = '';
    tasks.forEach(t=>{
      const li = document.createElement('li');
      li.textContent = (t.id ? ('#'+t.id+' ') : '') + (t.title || 'Bez tytułu') + ' — ' + (t.status||'');
      list.appendChild(li);
    });
  }catch(e){
    list.innerHTML = '<li>Błąd: '+e.message+'</li>';
  }
});
