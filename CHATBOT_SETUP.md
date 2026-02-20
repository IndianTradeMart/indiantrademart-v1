# Deep Chat Integration Guide

## Overview

This project now includes a Deep Chat chatbot widget that appears as a floating button on all pages of the IndianTradeMart application. The chatbot provides customer support and engagement capabilities.

## Components Added

### 1. **Frontend Component** (`src/components/DeepChatBot.jsx`)
- A React component that renders a floating chatbot widget
- Features:
  - Minimizable/expandable chat window
  - Dismissible for the session
  - Responsive design (mobile-friendly)
  - Hindi and English language support
  - Custom styling matching IndianTradeMart branding

### 2. **Backend Route** (`server/routes/chatbot.js`)
- Express.js API endpoint at `/api/chat`
- Handles incoming chat messages from the frontend
- Includes examples for integrating with:
  - OpenAI GPT
  - Google Gemini
  - Custom rule-based responses (default)

### 3. **Integration** (`src/App.jsx`)
- DeepChatBot component added to the main App
- Widget appears on all pages across all subdomains

## Setup Instructions

### Step 1: Install Dependencies
The `deep-chat-react` package has already been installed via npm.

```bash
npm install deep-chat-react
```

### Step 2: Configure Environment Variables
Create a `.env.local` file in the project root and add:

```env
# Deep Chat Configuration
VITE_DEEPCHAT_API_KEY=your_api_key_here
VITE_DEEPCHAT_API_URL=http://localhost:3001/api/chat
```

**Note:** 
- `VITE_DEEPCHAT_API_KEY` - Required if using a paid Deep Chat service
- `VITE_DEEPCHAT_API_URL` - Points to your backend API endpoint (can be local or cloud-based)

### Step 3: Start the Server and Client

```bash
# Terminal 1: Start the Node.js backend server
npm run dev:server

# Terminal 2: Start the Vite dev server
npm run dev

# Or run both in parallel
npm run dev:all
```

## Integration with AI Services

The chatbot backend is ready to integrate with various AI services. Choose one:

### Option A: Using OpenAI GPT (Recommended for Production)

1. Install the OpenAI package:
```bash
npm install openai
```

2. Add your API key to `.env.local`:
```env
OPENAI_API_KEY=sk-...
```

3. Uncomment the OpenAI integration in `server/routes/chatbot.js`:
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Uncomment the router.post('/chat', ...) block
```

### Option B: Using Google Gemini

1. Install the Google Generative AI package:
```bash
npm install @google/generative-ai
```

2. Add your API key to `.env.local`:
```env
GOOGLE_GEMINI_API_KEY=...
```

3. Uncomment the Gemini integration in `server/routes/chatbot.js`

### Option C: Using Custom Rule-Based Responses (Current Default)

The chatbot is currently configured with simple keyword-matching responses in Hindi. This is useful for:
- Testing and development
- Static FAQs
- Routing to specific support pages

You can customize responses in `server/routes/chatbot.js` by modifying the keyword matching logic.

## API Endpoint

### Request Format
**POST** `/api/chat`

```json
{
  "messages": [
    {
      "role": "user",
      "text": "Hello, what are your business hours?"
    }
  ]
}
```

### Response Format
```json
{
  "text": "नमस्ते! IndianTradeMart में आपका स्वागत है..."
}
```

## Customization

### Change Chatbot Appearance

Edit `src/components/DeepChatBot.jsx`:

```javascript
// Change the primary color
className="bg-[#003D82]" // Change to your preferred color

// Modify initial greeting message
initialMessages: [
  {
    role: 'ai',
    text: 'Your custom greeting message',
  },
]

// Change placeholder text
textInput: {
  placeholder: 'Your custom placeholder...',
}
```

### Change Chatbot Position

Current: Bottom-right corner

```javascript
// In DeepChatBot.jsx, modify the button position
className="fixed bottom-6 right-6 ..." // Adjust bottom/right values
```

Available positions:
- Bottom-right: `bottom-6 right-6`
- Bottom-left: `bottom-6 left-6`
- Top-right: `top-6 right-6`
- Top-left: `top-6 left-6`

### Disable Chatbot for Specific Routes

Add to `DeepChatBot.jsx`:

```javascript
const { pathname } = useLocation();

// Disable on admin pages
if (pathname.startsWith('/admin') || pathname.startsWith('/management')) {
  return null;
}
```

## Testing the Chatbot

1. Open the application in your browser
2. Click the blue chat button in the bottom-right corner
3. Type a test message (try "hello", "price", "shipping", "support")
4. Verify the response appears in the chat window
5. Test on mobile to ensure responsive design works

## Production Deployment

### Before Deploying:

1. Update `.env` variables with production values
2. Configure your AI service API keys securely
3. Test the chatbot thoroughly on staging
4. Monitor API usage and costs
5. Set up error logging and monitoring

### Environment Variable Best Practices:

- Never commit `.env.local` to version control (already in .gitignore)
- Use `.env.example` for documentation
- Store secrets in secure vaults (AWS Secrets Manager, etc.)
- Rotate API keys regularly

## Troubleshooting

### Chatbot Widget Doesn't Appear
- Check browser console for errors
- Verify `VITE_DEEPCHAT_API_URL` is correctly set
- Ensure the backend server is running

### Chatbot Doesn't Respond
- Check backend logs: `npm run dev:server`
- Verify the `/api/chat` endpoint is accessible
- Check that `OPENAI_API_KEY` or other credentials are set (if using AI service)

### CORS Errors
- Verify `getSubdomainAwareCORS()` in `server/middleware/subdomainMiddleware.js` allows the frontend domain
- Check that the frontend is making requests to the correct backend URL

### Rate Limiting Issues
- The API has rate limiting enabled (30 requests/minute by default)
- Adjust limits in `server/server.js` if needed

## File Structure

```
project-root/
├── src/
│   ├── components/
│   │   └── DeepChatBot.jsx          (Main chatbot component)
│   └── App.jsx                      (Updated to include chatbot)
├── server/
│   ├── routes/
│   │   └── chatbot.js               (Backend API handler)
│   └── server.js                    (Updated with chatbot routes)
├── .env.example                     (Updated with chatbot vars)
└── CHATBOT_SETUP.md                 (This file)
```

## Additional Resources

- [Deep Chat Documentation](https://www.deepchat.dev/)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Google Gemini Documentation](https://ai.google.dev)
- [Express.js Documentation](https://expressjs.com)

## Support

For issues or questions about the chatbot implementation:
1. Check the logs in browser console and server terminal
2. Refer to the API documentation above
3. Review the code comments in `DeepChatBot.jsx` and `chatbot.js`

---

**Last Updated:** January 2026  
**Version:** 1.0.0
