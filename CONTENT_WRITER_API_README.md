# Content Writer API Documentation

This document provides information about the Content Writer API endpoints and how to use them.

## Table of Contents

1. [Setup](#setup)
2. [API Endpoints](#api-endpoints)
3. [Database Schema](#database-schema)
4. [Frontend Integration](#frontend-integration)

## Setup

### Database Setup

Before using the Content Writer API, you need to create the necessary database table in Supabase:

1. Navigate to the Supabase dashboard for your project
2. Go to the SQL Editor
3. Copy and paste the contents of the `content_writer_table.sql` file
4. Run the SQL script to create the table and set up the Row Level Security policies

### Server Setup

The Content Writer API is already integrated into the MatrixAI Server. The routes are registered in `app.js` and the implementation is in `src/routes/contentRoutes.js`.

## API Endpoints

### Generate Content

**Endpoint:** `POST /api/content/generateContent`

**Request Body:**

```json
{
  "uid": "user-uuid",
  "prompt": "Write a blog post about artificial intelligence",
  "contentType": "blog",
  "tone": "professional",
  "length": "medium"
}
```

**Parameters:**

- `uid` (required): The user's UUID
- `prompt` (required): The prompt for content generation
- `contentType`: Type of content (e.g., blog, article, social media post)
- `tone`: Tone of the content (e.g., professional, casual, friendly)
- `length`: Length of the content (short, medium, long)

**Response:**

```json
{
  "success": true,
  "content": {
    "content_id": "generated-uuid",
    "generated_content": "The generated text content...",
    "prompt": "Write a blog post about artificial intelligence",
    "content_type": "blog",
    "tone": "professional",
    "length": "medium",
    "created_at": "2023-01-01T00:00:00.000Z"
  }
}
```

### Get All Generated Content

**Endpoint:** `GET /api/content/getGeneratedContent?uid=user-uuid`

**Parameters:**

- `uid` (required): The user's UUID

**Response:**

```json
{
  "success": true,
  "content": [
    {
      "id": 1,
      "uid": "user-uuid",
      "content_id": "content-uuid-1",
      "prompt": "Write a blog post about artificial intelligence",
      "content_type": "blog",
      "tone": "professional",
      "length": "medium",
      "generated_content": "The generated text content...",
      "created_at": "2023-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "uid": "user-uuid",
      "content_id": "content-uuid-2",
      "prompt": "Write a social media post about our new product",
      "content_type": "social",
      "tone": "casual",
      "length": "short",
      "generated_content": "The generated text content...",
      "created_at": "2023-01-02T00:00:00.000Z"
    }
  ]
}
```

### Get Specific Content

**Endpoint:** `GET /api/content/getContent/:contentId`

**Parameters:**

- `contentId` (required): The UUID of the content to retrieve

**Response:**

```json
{
  "success": true,
  "content": {
    "id": 1,
    "uid": "user-uuid",
    "content_id": "content-uuid",
    "prompt": "Write a blog post about artificial intelligence",
    "content_type": "blog",
    "tone": "professional",
    "length": "medium",
    "generated_content": "The generated text content...",
    "created_at": "2023-01-01T00:00:00.000Z"
  }
}
```

### Delete Content

**Endpoint:** `DELETE /api/content/deleteContent/:contentId?uid=user-uuid`

**Parameters:**

- `contentId` (required): The UUID of the content to delete
- `uid` (required): The user's UUID

**Response:**

```json
{
  "success": true,
  "message": "Content deleted successfully"
}
```

## Database Schema

The Content Writer feature uses the `content_writer` table in Supabase with the following schema:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| uid | UUID | User ID (foreign key to users table) |
| content_id | UUID | Unique identifier for the content |
| prompt | TEXT | The prompt used to generate the content |
| content_type | VARCHAR(50) | Type of content (blog, article, etc.) |
| tone | VARCHAR(50) | Tone of the content (professional, casual, etc.) |
| length | VARCHAR(20) | Length of the content (short, medium, long) |
| generated_content | TEXT | The generated content text |
| created_at | TIMESTAMP | When the content was created |

## Frontend Integration

To integrate with the ContentWriterPage.tsx frontend, you need to make API calls to the endpoints described above. Here's an example of how to call the generate content API:

```typescript
const generateContent = async (prompt: string, contentType: string, tone: string, length: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: currentUser.uid,
        prompt,
        contentType,
        tone,
        length,
      }),
    });

    const data = await response.json();
    if (data.success) {
      return data.content;
    } else {
      throw new Error(data.error || 'Failed to generate content');
    }
  } catch (error) {
    console.error('Error generating content:', error);
    throw error;
  }
};
```

And to fetch the user's content history:

```typescript
const fetchContentHistory = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/content/getGeneratedContent?uid=${currentUser.uid}`);
    const data = await response.json();
    if (data.success) {
      return data.content;
    } else {
      throw new Error(data.error || 'Failed to fetch content history');
    }
  } catch (error) {
    console.error('Error fetching content history:', error);
    throw error;
  }
};
```