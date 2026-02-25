(function(){
  const form = document.getElementById('registerForm');
  const msg = document.getElementById('msg');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    msg.textContent = 'Wysyłanie...';
    const fd = new FormData(form);
    const body = { username: fd.get('username'), password: fd.get('password'), role: fd.get('role') };
    try{
      const res = await fetch('/register', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      const json = await res.json();
      if(!res.ok) throw new Error(json.error || 'Błąd rejestracji');
      msg.textContent = 'Zarejestrowano. Przekierowanie do logowania...';
      setTimeout(()=>window.location.href='/login.html', 1200);
    }catch(err){
      msg.textContent = err.message;
    }
  });
})();