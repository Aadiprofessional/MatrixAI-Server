import express from 'express';
import { Resend } from 'resend';
import { getSupabaseClient } from '../config/database.js';

const router = express.Router();

// Initialize Resend with API key
const resend = new Resend('re_WBYgEP8Y_6QbRnHRnb6hwH8fuG1UebKDB');

// For testing purposes, we'll log the email content instead of sending it
// when in development environment
const isDevelopment = process.env.ENVIRONMENT === 'development';

/**
 * @route ALL /api/email/send
 * @desc Send custom email with optional attachment
 * @access Public
 */
router.all('/send', async (req, res) => {
  console.log('Request to /send endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);
  
  // Extract parameters from either query or body
  const to = req.body.to || req.query.to;
  const email = req.body.email || req.query.email;
  const subject = req.body.subject || req.query.subject;
  const message = req.body.message || req.query.message;
  const attachmentUrl = req.body.attachmentUrl || req.query.attachmentUrl;
  try {
    // Use email field as fallback for to field
    const recipient = to || email;
    // Default subject if not provided
    const emailSubject = subject || 'Message from MatrixAI';
    
    // Validate required fields
    if (!recipient || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and message are required fields' 
      });
    }
    
    // Prepare email data
    const emailData = {
      from: 'noreply@matrixaiglobal.com', // Using verified domain
      to: recipient,
      subject: emailSubject,
      html: message,
    };
    
    // Add attachment if provided
    if (attachmentUrl) {
      emailData.attachments = [{
        filename: 'attachment',
        path: attachmentUrl,
      }];
    }
    
    let data, error;
    
    if (isDevelopment) {
      // In development, just log the email content instead of sending
      console.log('\n==== DEVELOPMENT MODE: Email would be sent with the following data ====');
      console.log('To:', emailData.to);
      console.log('Subject:', emailData.subject);
      console.log('From:', emailData.from);
      console.log('HTML Content:', emailData.html);
      if (emailData.attachments) {
        console.log('Attachments:', emailData.attachments);
      }
      console.log('================================================================\n');
      
      // Mock successful response
      data = { id: 'dev-' + Date.now(), from: emailData.from };
    } else {
      // In production, actually send the email
      try {
        const result = await resend.emails.send(emailData);
        data = result.data;
        error = result.error;
        
        if (error || !data) {
          console.error('Error sending email:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to send email', 
            error: error?.message || 'Unknown error occurred'
          });
        }
      } catch (sendError) {
        console.error('Exception when sending email:', sendError);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send email', 
          error: sendError.message 
        });
      }
    }
    
    // Log email activity to database if needed
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('email_logs')
        .insert({
          recipient: recipient,
          subject: emailSubject,
          sent_at: new Date().toISOString(),
          status: 'sent',
          message_id: data.id
        });
    } catch (dbError) {
      // Just log the error but don't fail the request
      console.error('Error logging email to database:', dbError);
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully', 
      data 
    });
  } catch (error) {
    console.error('Error in send email endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/email/logs
 * @desc Get email sending logs
 * @access Admin
 */
router.get('/logs', async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('email_logs')
      .select('*')
      .order('sent_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching email logs:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch email logs' 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      data 
    });
  } catch (error) {
    console.error('Error in get email logs endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

export default router;