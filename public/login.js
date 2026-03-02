(function(){
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    Toast.info('Łączenie...');
    const fd = new FormData(form);
    const body = { username: fd.get('username'), password: fd.get('password') };
    try{
      const res = await fetch('/login', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error || 'Błąd logowania');
      localStorage.setItem('token', json.token);
      Toast.success('Zalogowano — przekierowanie...');
      setTimeout(()=> window.location.href = '/dashboard.html', 500);
    }catch(err){
      Toast.error(err.message || 'Błąd logowania');
    }
  });
})();