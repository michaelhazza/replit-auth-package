# Super Simple Copy & Paste Setup for Replit

## For Non-Technical Users - 2 Minutes Setup

This is the absolute simplest way to add authentication to your Replit project. Just copy and paste!

### Step 1: Copy the Auth System (30 seconds)

1. In your Replit project, create a new file called `auth.js`
2. Copy and paste this entire code block:

```javascript
// Complete Authentication System - Just copy & paste this entire file
const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');

// Simple user storage (works immediately, no database needed)
const users = new Map();
let nextUserId = 1;

// Setup function - call this in your main server file
function setupAuth(app) {
  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }));

  // Auth middleware
  app.use((req, res, next) => {
    req.user = req.session && req.session.user ? req.session.user : null;
    next();
  });

  // Register endpoint
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Check if user exists
      for (const [id, user] of users) {
        if (user.email === email) {
          return res.status(400).json({ error: 'User already exists' });
        }
      }

      // Create user
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = {
        id: nextUserId++,
        email,
        password: hashedPassword,
        firstName: firstName || '',
        lastName: lastName || '',
        createdAt: new Date()
      };

      users.set(user.id, user);

      // Create session
      req.session.userId = user.id;
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      };

      res.json({ user: req.session.user });
    } catch (error) {
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Login endpoint
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Find user
      let foundUser = null;
      for (const [id, user] of users) {
        if (user.email === email) {
          foundUser = user;
          break;
        }
      }

      if (!foundUser) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, foundUser.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Create session
      req.session.userId = foundUser.id;
      req.session.user = {
        id: foundUser.id,
        email: foundUser.email,
        firstName: foundUser.firstName,
        lastName: foundUser.lastName
      };

      res.json({ user: req.session.user });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Get current user
  app.get('/api/auth/user', (req, res) => {
    if (req.session && req.session.user) {
      res.json({ user: req.session.user });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ message: 'Logged out successfully' });
    });
  });

  // Middleware to protect routes
  app.requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  };

  console.log('✅ Authentication system ready!');
}

module.exports = { setupAuth };
```

### Step 2: Install Dependencies (30 seconds)

In your Replit shell, run this command:

```bash
npm install bcrypt express-session
```

### Step 3: Add to Your Main Server (30 seconds)

In your main server file (usually `index.js` or `server.js`), add these lines:

```javascript
const express = require('express');
const { setupAuth } = require('./auth'); // Add this line

const app = express();

// Your existing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add authentication (add this line)
setupAuth(app);

// Your existing routes...

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Step 4: Create Login Form (30 seconds)

Create a new file called `login.html` and copy this:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Login</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .message { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .error { background: #f8d7da; color: #721c24; }
        .success { background: #d4edda; color: #155724; }
    </style>
</head>
<body>
    <h2>Login</h2>
    <div id="message"></div>
    
    <form id="loginForm">
        <div class="form-group">
            <label>Email:</label>
            <input type="email" id="email" required>
        </div>
        <div class="form-group">
            <label>Password:</label>
            <input type="password" id="password" required>
        </div>
        <button type="submit">Login</button>
    </form>

    <p><a href="register.html">Don't have an account? Sign up</a></p>

    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    document.getElementById('message').innerHTML = '<div class="success">Login successful!</div>';
                    setTimeout(() => window.location.href = '/dashboard.html', 1000);
                } else {
                    document.getElementById('message').innerHTML = '<div class="error">' + data.error + '</div>';
                }
            } catch (error) {
                document.getElementById('message').innerHTML = '<div class="error">Network error</div>';
            }
        });
    </script>
</body>
</html>
```

### Step 5: Create Registration Form (30 seconds)

Create a new file called `register.html` and copy this:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Register</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #218838; }
        .message { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .error { background: #f8d7da; color: #721c24; }
        .success { background: #d4edda; color: #155724; }
    </style>
</head>
<body>
    <h2>Create Account</h2>
    <div id="message"></div>
    
    <form id="registerForm">
        <div class="form-group">
            <label>First Name:</label>
            <input type="text" id="firstName">
        </div>
        <div class="form-group">
            <label>Last Name:</label>
            <input type="text" id="lastName">
        </div>
        <div class="form-group">
            <label>Email:</label>
            <input type="email" id="email" required>
        </div>
        <div class="form-group">
            <label>Password:</label>
            <input type="password" id="password" required minlength="6">
        </div>
        <button type="submit">Create Account</button>
    </form>

    <p><a href="login.html">Already have an account? Login</a></p>

    <script>
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ firstName, lastName, email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    document.getElementById('message').innerHTML = '<div class="success">Account created successfully!</div>';
                    setTimeout(() => window.location.href = '/dashboard.html', 1000);
                } else {
                    document.getElementById('message').innerHTML = '<div class="error">' + data.error + '</div>';
                }
            } catch (error) {
                document.getElementById('message').innerHTML = '<div class="error">Network error</div>';
            }
        });
    </script>
</body>
</html>
```

### That's It! 

Your authentication system is now ready. Here's what you can do:

**Test it:**
1. Go to `/register.html` in your browser
2. Create an account
3. Login at `/login.html`

**Protect routes in your app:**
```javascript
// Example: Protect a route
app.get('/admin', app.requireAuth, (req, res) => {
  res.send(`Hello ${req.user.firstName}! This is a protected page.`);
});
```

**Check if user is logged in:**
```javascript
app.get('/profile', (req, res) => {
  if (req.user) {
    res.json({ message: 'You are logged in!', user: req.user });
  } else {
    res.json({ message: 'You are not logged in' });
  }
});
```

### What You Get

- User registration and login
- Secure password storage
- Session management
- Ready-to-use login forms
- Protection for any route
- Works immediately in Replit

### Need Help?

- Make sure you ran `npm install bcrypt express-session`
- Check that you added `setupAuth(app)` to your main server file
- Visit `/register.html` in your browser to test

That's it! Your Replit project now has a complete authentication system in under 2 minutes.