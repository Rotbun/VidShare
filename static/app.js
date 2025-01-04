const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');
const uuid = require('uuid');
const cors = require('cors');
const express = require('express');
const app = express();

// Middleware for handling CORS and parsing JSON
app.use(cors());
app.use(express.json());

// Azure Cosmos DB client setup
const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT,
  key: process.env.COSMOS_DB_KEY,
});
const database = cosmosClient.database('VidShareDB');
const videosContainer = database.container('Videos');
const usersContainer = database.container('Users');

// Azure Blob Storage client setup
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient('video-content');

// Endpoint to get the latest videos for the dashboard
app.get('/api/videos', async (req, res) => {
  try {
    const { resources: videos } = await videosContainer.items
      .query('SELECT TOP 10 * FROM c ORDER BY c.uploadDate DESC')
      .fetchAll();

    // Format the video list for the front-end
    const formattedVideos = videos.map(video => ({
      id: video.id,
      title: video.title,
      description: video.description,
      uploadDate: video.uploadDate,
      videoUrl: `${process.env.VIDEO_CDN_URL}/${video.videoBlobName}`,
      thumbnailUrl: `${process.env.VIDEO_CDN_URL}/${video.thumbnailBlobName}`,
    }));

    res.status(200).json(formattedVideos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to upload videos (for creators only)
app.post('/api/upload', async (req, res) => {
  const { creatorId, title, description, hashtags, videoBlobName, thumbnailBlobName } = req.body;

  if (!creatorId || !title || !description || !videoBlobName || !thumbnailBlobName) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const videoId = uuid.v4();
    const uploadDate = new Date().toISOString();
    
    // Insert video metadata into Cosmos DB
    const newVideo = {
      id: videoId,
      creatorId: creatorId,
      title: title,
      description: description,
      hashtags: hashtags,
      videoBlobName: videoBlobName,
      thumbnailBlobName: thumbnailBlobName,
      uploadDate: uploadDate,
    };

    await videosContainer.items.create(newVideo);

    res.status(201).json({ message: 'Video uploaded successfully', videoId });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to register creator users (this would be an admin-only task, typically)
app.post('/api/register-creator', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const creatorId = uuid.v4();

    // Insert creator user into Cosmos DB (could add password hashing here for security)
    const newCreator = {
      id: creatorId,
      username: username,
      password: password,
      role: 'creator', // Can be extended for different user roles
    };

    await usersContainer.items.create(newCreator);

    res.status(201).json({ message: 'Creator registered successfully', creatorId });
  } catch (error) {
    console.error('Error registering creator:', error);
    res.status(500).send('Internal Server Error');
  }
});

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok) {
      alert('Login successful');
      localStorage.setItem('token', data.token); // Store the JWT token
    } else {
      alert(`Login failed: ${data.message}`);
    }
  } catch (error) {
    console.error('Error during login:', error);
    alert('An error occurred. Please try again.');
  }
});

// Endpoint to retrieve comments for a video (optional, for future enhancement)
app.get('/api/comments/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const { resources: comments } = await commentsContainer.items
      .query('SELECT * FROM c WHERE c.videoId = @videoId', {
        parameters: [{ name: '@videoId', value: videoId }],
      })
      .fetchAll();

    res.status(200).json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to post comments (optional, for future enhancement)
app.post('/api/comments', async (req, res) => {
  const { videoId, userId, comment } = req.body;

  if (!videoId || !userId || !comment) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const commentId = uuid.v4();
    const newComment = {
      id: commentId,
      videoId: videoId,
      userId: userId,
      comment: comment,
      timestamp: new Date().toISOString(),
    };

    await commentsContainer.items.create(newComment);

    res.status(201).json({ message: 'Comment posted successfully' });
  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
