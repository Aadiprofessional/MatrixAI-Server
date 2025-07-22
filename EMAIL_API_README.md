# MatrixAI Email API

## Overview
The Email API allows sending custom emails with optional attachments using the Resend service.

## Setup

1. Install the Resend package:
   ```bash
   npm install resend
   ```

2. The API is already integrated into the MatrixAI Server. The routes are registered in both `app.js` and `src/app.js`.

## API Endpoints

### Send Email
**Endpoint:** `POST /api/email/send`

**Request Body:**
```json
{
  "to": "recipient@example.com",
  "subject": "Your Email Subject",
  "message": "<h1>HTML Email Content</h1><p>This is the email body.</p>",
  "attachmentUrl": "https://example.com/document.pdf" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email sent successfully",
  "data": {
    "id": "email_id",
    "from": "noreply@matrixaiglobal.com"
  }
}
```

### Get Email Logs
**Endpoint:** `GET /api/email/logs`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "recipient": "user@example.com",
      "subject": "Welcome to MatrixAI",
      "sent_at": "2023-01-01T12:00:00Z",
      "status": "sent",
      "message_id": "email_id"
    }
  ]
}
```

## Development Mode

In development mode (when `NODE_ENV` is not set to 'production'), the API will log the email content to the console instead of actually sending emails. This is useful for testing without consuming email quota or sending test emails.

To run the server in development mode:

```bash
export NODE_ENV=development && node server.js
```

## Production Configuration

For production use, you need to:

1. Verify your domain with Resend at https://resend.com/domains
2. Update the `from` address in `src/routes/emailRoutes.js` to use your verified domain
3. Set `NODE_ENV=production` when running the server

## Testing

A test script is provided at `test-email.js`. Run it with:

```bash
node test-email.js
```

This will send a test email to the specified recipient.