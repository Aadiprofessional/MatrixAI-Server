// This file contains the fix for the client-side code in Home.js

// Change this line in Home.js (line 141):
const response = await fetch('http://localhost:3002/api/admin/fetchUserInfoAdmin', {
  credentials: 'include'
});

// To this:
const response = await fetch('http://localhost:3002/api/admin/getAllUsers', {
  credentials: 'include'
});

// Also make sure all fetch requests include credentials: 'include'
// For example, update these lines (lines 250 and 272):
const response = await fetch('http://localhost:3002/api/admin/getAllFeedback');
// To:
const response = await fetch('http://localhost:3002/api/admin/getAllFeedback', {
  credentials: 'include'
});

const response = await fetch('http://localhost:3002/api/admin/getAllHelp');
// To:
const response = await fetch('http://localhost:3002/api/admin/getAllHelp', {
  credentials: 'include'
});