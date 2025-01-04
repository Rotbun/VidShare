const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { CosmosClient } = require('@azure/cosmos');

const app = express();

// Middleware for handling CORS and JSON
app.use(cors());
app.use(express.json());

// Azure Cosmos DB client setup
const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT,
  key: process.env.COSMOS_DB_KEY,
});
const usersContainer = cosmosClient.database('VidShareDB').container('Users');

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Helper function to generate JWT
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Endpoint for user registration
app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).send('Missing required fields');
  }

  try {
    // Check if username already exists
    const { resources: existingUsers } = await usersContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.username = @username',
        parameters: [{ name: '@username', value: username }],
      })
      .fetchAll();

    if (existingUsers.length > 0) {
      return res.status(400).send('Username already exists');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save the new user
    const newUser = {
      id: require('uuid').v4(),
      username,
      password: hashedPassword,
      role, // 'creator' or 'consumer'
    };

    await usersContainer.items.create(newUser);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint for user login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Missing required fields');
  }

  try {
    // Fetch the user from the database
    const { resources: users } = await usersContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.username = @username',
        parameters: [{ name: '@username', value: username }],
      })
      .fetchAll();

    if (users.length === 0) {
      return res.status(401).send('Invalid credentials');
    }

    const user = users[0];

    // Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).send('Invalid credentials');
    }

    // Generate a JWT token
    const token = generateToken(user);

    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Middleware for protecting routes (optional for future development)
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).send('Access Denied');
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send('Invalid Token');
    }

    req.user = user;
    next();
  });
}

// Example protected route
app.get('/api/protected', authenticateToken, (req, res) => {
  res.status(200).json({ message: 'Access to protected route granted', user: req.user });
});

// Start the server
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Auth service running on port ${port}`);
});
