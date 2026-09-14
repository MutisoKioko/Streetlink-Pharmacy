// register-business.js — public page, no auth required, so this does NOT
// use authFetch from api.js (that helper assumes a token already exists).

document.getElementById('registerBusinessForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const errorBox = document.getElementById('errorBox');
  const successBox = document.getElementById('successBox');
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  const password = document.getElementById('admin-password').value;
  const confirmPassword = document.getElementById('admin-confirm-password').value;

  if (password !== confirmPassword) {
    errorBox.textContent = 'Passwords do not match';
    errorBox.style.display = 'block';
    return;
  }

  const body = {
    business_name: document.getElementById('business-name').value,
    admin_name: document.getElementById('admin-name').value,
    admin_email: document.getElementById('admin-email').value,
    admin_phone: document.getElementById('admin-phone').value,
    admin_password: password
  };

  const submitButton = e.target.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const res = await fetch('/register-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      errorBox.textContent = data.error;
      errorBox.style.display = 'block';
      submitButton.disabled = false;
      return;
    }

    successBox.textContent = `${data.business_name} created. Redirecting you to log in...`;
    successBox.style.display = 'block';
    document.getElementById('registerBusinessForm').reset();

    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1800);
  } catch (err) {
    errorBox.textContent = 'Something went wrong — check your connection and try again.';
    errorBox.style.display = 'block';
    submitButton.disabled = false;
  }
});