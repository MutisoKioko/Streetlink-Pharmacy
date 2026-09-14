const registerForm = document.getElementById('registerForm');
const errorBox = document.getElementById('error-box');
const successBox = document.getElementById('success-box');

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous messages
    errorBox.style.display = 'none';
    successBox.style.display = 'none';
    errorBox.textContent = '';
    successBox.textContent = '';

    // Get form values
    const businessName = document.getElementById('business-name').value.trim();
    const adminName = document.getElementById('admin-name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Validate passwords match
    if (password !== confirmPassword) {
        errorBox.textContent = 'Passwords do not match';
        errorBox.style.display = 'block';
        return;
    }

    // Validate password length
    if (password.length < 8) {
        errorBox.textContent = 'Password must be at least 8 characters';
        errorBox.style.display = 'block';
        return;
    }

    // Validate required fields
    if (!businessName || !adminName || !email || !phone) {
        errorBox.textContent = 'All fields are required';
        errorBox.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/auth/register-business', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                businessName,
                adminName,
                email,
                phone,
                password,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            errorBox.textContent = data.message || 'Registration failed. Please try again.';
            errorBox.style.display = 'block';
            return;
        }

        // Success
        successBox.textContent = 'Account created successfully! Redirecting to login...';
        successBox.style.display = 'block';

        // Clear form
        registerForm.reset();

        // Redirect to login after 1.8 seconds
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1800);

    } catch (error) {
        console.error('Registration error:', error);
        errorBox.textContent = 'An error occurred. Please try again.';
        errorBox.style.display = 'block';
    }
});