document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorBox = document.getElementById('errorBox');
  errorBox.style.display = 'none';

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error || 'Login failed';
      errorBox.style.display = 'block';
      return;
    }

    saveSession(data);
    window.location.href = data.role === 'admin' ? '/admin.html' : '/dashboard.html';

  } catch (err) {
    errorBox.textContent = 'Could not reach server';
    errorBox.style.display = 'block';
  }
});