(function(){
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    msg.textContent = 'Łączenie...';
    const fd = new FormData(form);
    const body = { username: fd.get('username'), password: fd.get('password') };
    try{
      const res = await fetch('/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error || 'Błąd logowania');
      localStorage.setItem('token', json.token);
      msg.textContent = 'Zalogowano';
      window.location.href = '/dashboard.html';
    }catch(err){
      msg.textContent = err.message;
    }
  });
})();