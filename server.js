const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 5, // limit each IP to 5 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.'
// });

// Middleware
app.use(cors());
app.use(express.json());
// app.use('/api/contact');

// Contact Message Schema
const contactMessageSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 2000
  },
  isAnonymous: {
    type: Boolean,
    default: true
  },
  name: {
    type: String,
    default: 'Anonymous',
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 100,
    validate: {
      validator: function(v) {
        return !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  ip: String,
  status: {
    type: String,
    enum: ['new', 'read', 'replied'],
    default: 'new'
  }
});

const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const { message, isAnonymous, name, email } = req.body;

    if (!message || message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters long'
      });
    }

    // Validate name and email if not anonymous
    if (!isAnonymous) {
      if (!name || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Name must be at least 2 characters long'
        });
      }
      if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid email address'
        });
      }
    }

    const contactMessage = new ContactMessage({
      message: message.trim(),
      isAnonymous: isAnonymous || false,
      name: isAnonymous ? 'Anonymous' : name.trim(),
      email: isAnonymous ? null : email?.trim(),
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date()
    });

    await contactMessage.save();

    console.log('New message received:', {
      id: contactMessage._id,
      isAnonymous: contactMessage.isAnonymous,
      name: contactMessage.name,
      email: contactMessage.email || 'N/A',
      message: contactMessage.message.substring(0, 50) + '...',
      timestamp: contactMessage.timestamp
    });

    res.json({
      success: true,
      message: 'Message sent successfully',
      id: contactMessage._id
    });

  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all messages (for admin)
app.get('/api/contact', async (req, res) => {
  try {
    const messages = await ContactMessage.find()
      .sort({ timestamp: -1 })
      .select('-ip');

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update message status
app.patch('/api/contact/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    const message = await ContactMessage.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// API Pinging functionality
const pingExternalAPI = () => {
  const options = {
    hostname: 'backend-api-4kof.onrender.com',
    port: 443,
    path: '/api/health',
    method: 'GET',
    timeout: 10000
  };

  const req = https.request(options, (res) => {
    console.log(`External API ping successful: ${res.statusCode}`);
  });

  req.on('error', (error) => {
    console.warn('External API ping failed:', error.message);
  });

  req.on('timeout', () => {
    console.warn('External API ping timeout');
    req.destroy();
  });

  req.end();
};

const pingSelf = () => {
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/health',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    console.log(`Self-ping successful: ${res.statusCode}`);
  });

  req.on('error', (error) => {
    console.warn('Self-ping failed:', error.message);
  });

  req.on('timeout', () => {
    console.warn('Self-ping timeout');
    req.destroy();
  });

  req.end();
};

// Start pinging intervals
const startPinging = () => {
  // Ping external API every 30 seconds
  setInterval(pingExternalAPI, 30000);

  // Self-ping every minute to keep server alive
  setInterval(pingSelf, 60000);

  console.log('API pinging started:');
  console.log('- External API: every 30 seconds');
  console.log('- Self-ping: every minute');
};

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  // Start pinging after server is ready
  setTimeout(startPinging, 2000);
});
