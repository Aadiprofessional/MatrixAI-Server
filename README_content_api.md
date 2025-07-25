# Content Writer API Documentation

This document provides information about the Content Writer API endpoints implemented in the MatrixAI server.

## Table of Contents

1. [Save Content](#save-content)
2. [Get User Content](#get-user-content)
3. [Get Content by ID](#get-content-by-id)
4. [Delete Content](#delete-content)
5. [Download Content](#download-content)
6. [Share Content](#share-content)
7. [Get Shared Content](#get-shared-content)

## API Endpoints

### Save Content

Saves generated content to the database.

- **URL**: `/api/content/saveContent`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "uid": "user123",
    "prompt": "Write a blog post about AI",
    "content": "AI is transforming our world...",
    "title": "The Future of AI",
    "tags": ["AI", "Technology", "Future"],
    "coinCost": 10,
    "content_type": "blog",
    "tone": "informative",
    "language": "en"
  }
  ```
- **Required Fields**: `uid`, `prompt`, `content`
- **Optional Fields**: `title` (default: "Untitled Content"), `tags` (default: []), `coinCost` (default: 10), `content_type`, `tone`, `language` (default: "en")
- **Success Response**:
  ```json
  {
    "message": "Content saved successfully",
    "content": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "The Future of AI",
      "content": "AI is transforming our world...",
      "createdAt": "2023-04-01T12:00:00.000Z",
      "prompt": "Write a blog post about AI",
      "tags": ["AI", "Technology", "Future"],
      "content_type": "blog",
      "tone": "informative",
      "language": "en"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields or insufficient coins
  - `500 Internal Server Error`: Database error

### Get User Content

Retrieves a user's content history with pagination.

- **URL**: `/api/content/getUserContent`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `uid` (required): User ID
  - `page` (optional): Page number (default: 1)
  - `itemsPerPage` (optional): Items per page (default: 10)
  - `contentType` (optional): Filter by content type
  - `searchQuery` (optional): Search in title and content
- **Success Response**:
  ```json
  {
    "content": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "The Future of AI",
        "content": "AI is transforming our world...",
        "createdAt": "2023-04-01T12:00:00.000Z",
        "prompt": "Write a blog post about AI",
        "tags": ["AI", "Technology", "Future"],
        "content_type": "blog",
        "tone": "informative",
        "language": "en"
      }
    ],
    "totalCount": 25,
    "currentPage": 1,
    "totalPages": 3,
    "itemsPerPage": 10
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields or invalid pagination parameters
  - `500 Internal Server Error`: Database error

### Get Content by ID

Retrieves a specific content item by ID.

- **URL**: `/api/content/getContent/:contentId`
- **Method**: `GET`
- **Authentication**: Required
- **URL Parameters**:
  - `contentId`: Content ID
- **Query Parameters**:
  - `uid`: User ID
- **Success Response**:
  ```json
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "The Future of AI",
    "content": "AI is transforming our world...",
    "createdAt": "2023-04-01T12:00:00.000Z",
    "prompt": "Write a blog post about AI",
    "tags": ["AI", "Technology", "Future"],
    "content_type": "blog",
    "tone": "informative",
    "language": "en"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields
  - `404 Not Found`: Content not found or not owned by user
  - `500 Internal Server Error`: Database error

### Delete Content

Deletes a content item.

- **URL**: `/api/content/deleteContent`
- **Method**: `DELETE`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "uid": "user123",
    "contentId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Success Response**:
  ```json
  {
    "message": "Content deleted successfully",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "The Future of AI"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields
  - `404 Not Found`: Content not found or not owned by user
  - `500 Internal Server Error`: Database error

### Download Content

Downloads content in different formats.

- **URL**: `/api/content/downloadContent/:contentId`
- **Method**: `GET`
- **Authentication**: Required
- **URL Parameters**:
  - `contentId`: Content ID
- **Query Parameters**:
  - `uid`: User ID
  - `format` (optional): Format (txt, pdf, docx) (default: txt)
- **Success Response**:
  - For TXT format: Content as a downloadable text file
  - For PDF/DOCX (not yet implemented):
    ```json
    {
      "message": "Download in PDF format is not yet implemented",
      "title": "The Future of AI",
      "format": "pdf"
    }
    ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields or invalid format
  - `404 Not Found`: Content not found or not owned by user
  - `500 Internal Server Error`: Server error
  - `501 Not Implemented`: Format not yet supported

### Share Content

Generates a shareable link for content.

- **URL**: `/api/content/shareContent`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "uid": "user123",
    "contentId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Success Response**:
  ```json
  {
    "message": "Content shared successfully",
    "shareId": "660f9500-f30c-52e5-b827-557766550000",
    "shareUrl": "https://matrixai.com/shared/660f9500-f30c-52e5-b827-557766550000",
    "title": "The Future of AI",
    "expiresAt": "2023-05-01T12:00:00.000Z"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing required fields
  - `404 Not Found`: Content not found or not owned by user
  - `500 Internal Server Error`: Database error

### Get Shared Content

Retrieves shared content by share ID (public endpoint).

- **URL**: `/api/content/shared/:shareId`
- **Method**: `GET`
- **Authentication**: Not required
- **URL Parameters**:
  - `shareId`: Share ID
- **Success Response**:
  ```json
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "The Future of AI",
    "content": "AI is transforming our world...",
    "createdAt": "2023-04-01T12:00:00.000Z",
    "isShared": true
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing share ID
  - `404 Not Found`: Shared content not found
  - `410 Gone`: Shared content has expired
  - `500 Internal Server Error`: Server error

## Database Schema

### user_content Table

```sql
CREATE TABLE IF NOT EXISTS user_content (
  content_id UUID PRIMARY KEY,
  uid TEXT NOT NULL,
  prompt TEXT NOT NULL,
  content TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Content',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  content_type TEXT,
  tone TEXT,
  language TEXT DEFAULT 'en',
  
  -- Add foreign key constraint to users table
  CONSTRAINT fk_user
    FOREIGN KEY (uid)
    REFERENCES users(uid)
    ON DELETE CASCADE
);
```

### shared_content Table

```sql
CREATE TABLE IF NOT EXISTS shared_content (
  share_id UUID PRIMARY KEY,
  content_id UUID NOT NULL,
  uid TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Add foreign key constraint to user_content table
  CONSTRAINT fk_content
    FOREIGN KEY (content_id)
    REFERENCES user_content(content_id)
    ON DELETE CASCADE,
    
  -- Add foreign key constraint to users table
  CONSTRAINT fk_user
    FOREIGN KEY (uid)
    REFERENCES users(uid)
    ON DELETE CASCADE
);
```

## Implementation Notes

1. The API uses Supabase as the database provider.
2. Content generation costs coins, which are deducted from the user's account.
3. Shared content links expire after 30 days.
4. PDF and DOCX download formats are placeholders for future implementation.
5. Content can be filtered by type and searched by title or content text.