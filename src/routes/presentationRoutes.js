const express = require("express");
const { getSupabaseClient } = require("../config/database.js");
const uuid = require("uuid");
const uuidv4 = uuid.v4;
const axios = require("axios");
const PptxGenJS = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const xml2js = require("xml2js");
const { JSDOM } = require("jsdom");
// d3 removed - not used in this file

const router = express.Router();

// Helper function to deduct coins
const deductCoins = async (uid, coinAmount, transactionName) => {
  console.log(`Deducting ${coinAmount} coins for user ${uid} for ${transactionName}`);
  try {
    const supabase = getSupabaseClient();
    console.log('Supabase client initialized');

    // Step 1: Fetch user details
    console.log(`Fetching user details for uid: ${uid}`);
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_coins')
      .eq('uid', uid)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return { success: false, message: 'Failed to fetch user information', details: userError.message };
    }
    
    console.log('User data retrieved:', userData);
    const { user_coins } = userData;

    // Step 2: Check if the user has enough coins
    if (user_coins < coinAmount) {
      console.log(`Insufficient coins: user has ${user_coins}, needs ${coinAmount}`);
      // Log failed transaction
      try {
        const { error: failedTransactionError } = await supabase
          .from('user_transaction')
          .insert([{
            uid,
            transaction_name: transactionName,
            coin_amount: coinAmount,
            remaining_coins: user_coins,
            status: 'failed',
            time: new Date().toISOString()
          }]);
          
        if (failedTransactionError) {
          console.error('Error logging failed transaction:', failedTransactionError);
        }
      } catch (transactionLogError) {
        console.error('Exception while logging failed transaction:', transactionLogError);
      }
      
      return { success: false, message: 'Insufficient coins' };
    }

    // Step 3: Deduct coins
    const newCoinBalance = user_coins - coinAmount;
    console.log(`Updating user coins from ${user_coins} to ${newCoinBalance}`);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ user_coins: newCoinBalance })
      .eq('uid', uid);

    if (updateError) {
      console.error('Error updating user coins:', updateError);
      return { success: false, message: 'Failed to deduct coins', details: updateError.message };
    }

    // Step 4: Log successful transaction
    const { error: transactionError } = await supabase
      .from('user_transaction')
      .insert([{
        uid,
        transaction_name: transactionName,
        coin_amount: coinAmount,
        remaining_coins: newCoinBalance,
        status: 'success',
        time: new Date().toISOString()
      }]);

    if (transactionError) {
      console.error('Error logging transaction:', transactionError);
      // Don't return error here as coins were already deducted
    }

    console.log(`Successfully deducted ${coinAmount} coins. New balance: ${newCoinBalance}`);
    return { success: true, newBalance: newCoinBalance };

  } catch (error) {
    console.error('Exception in deductCoins:', error);
    return { success: false, message: 'Internal server error', details: error.message };
  }
};

// AI Agent Communication Helper
const callAIAgent = async (prompt, systemRole = 'You are a helpful AI assistant.') => {
  try {
    const response = await axios.post('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: systemRole },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    }, {
      headers: {
        'Authorization': 'Bearer sk-256fda005a1445628fe2ceafcda9e389',
        'Content-Type': 'application/json'
      }
    });

    return {
      success: true,
      content: response.data.choices[0].message.content
    };
  } catch (error) {
    console.error('AI Agent call failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Intelligent Content Decision Agent
const decideContentStrategy = async (description, pages, purpose) => {
  const strategyPrompt = `
    As a presentation strategy expert, analyze this presentation request and decide the optimal content strategy:
    
    Description: "${description}"
    Pages: ${pages}
    Purpose: "${purpose}"
    
    Decide for each page what type of content would be most effective:
    - Text-heavy (for concepts, explanations)
    - Visual-heavy (for data, comparisons, processes)
    - Mixed (balanced text and visuals)
    
    Also decide what visual elements each page needs:
    - Charts/graphs (specify type: bar, line, pie, table)
    - Images (specify type: illustration, photo, diagram)
    - None (text only)
    
    Respond in JSON format:
    {
      "overall_strategy": "educational/business/creative",
      "pages": [
        {
          "page_number": 1,
          "content_type": "text-heavy/visual-heavy/mixed",
          "visual_elements": {
            "needs_chart": true/false,
            "chart_type": "bar/line/pie/table",
            "needs_image": true/false,
            "image_type": "illustration/photo/diagram"
          },
          "layout_priority": "text/visual/balanced"
        }
      ]
    }
  `;
  
  return await callAIAgent(strategyPrompt, 'You are an expert presentation strategist who optimizes content layout and visual design for maximum impact and clarity.');
};

// Generate Image using existing createImage API
const generateImage = async (prompt, uid) => {
  try {
    // Use local server in development, production server otherwise
    const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : process.env.BASE_URL;
    const response = await axios.post(`${baseUrl}/api/image/createImage`, {
      uid: uid,
      promptText: prompt,
      imageCount: 1
    });
    
    console.log(`Image generation request sent to: ${baseUrl}/api/createImage`);
    console.log('Image generation response status:', response.status);

    return {
      success: true,
      imageData: response.data
    };
  } catch (error) {
    console.error('Image generation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Generate SVG Chart/Graph
// Advanced Layout Manager
const calculateLayout = (contentType, hasImage, hasChart) => {
  const layouts = {
    'text-heavy': {
      text: { x: 0.5, y: 1.5, w: hasImage ? 6 : 9, h: hasChart ? 3.5 : 4.5 },
      image: hasImage ? { x: 7, y: 1.5, w: 2.5, h: 2 } : null,
      chart: hasChart ? { x: 0.5, y: 5.2, w: hasImage ? 6 : 9, h: 1.8 } : null
    },
    'visual-heavy': {
      text: { x: 0.5, y: 1.5, w: hasImage ? 4 : 5, h: 2.5 },
      image: hasImage ? { x: 5, y: 1.5, w: 4.5, h: 3 } : null,
      chart: hasChart ? { x: 0.5, y: 4.2, w: 9, h: 2.5 } : null
    },
    'mixed': {
      text: { x: 0.5, y: 1.5, w: hasImage ? 5.5 : 6, h: hasChart ? 2.8 : 4 },
      image: hasImage ? { x: 6.5, y: 1.5, w: 3, h: 2.5 } : null,
      chart: hasChart ? { x: 0.5, y: 4.5, w: hasImage ? 6 : 9, h: 2.2 } : null
    }
  };
  
  return layouts[contentType] || layouts['mixed'];
};

// Smart Text Formatter
// Simple text formatter with strict word limits
const formatTextForLayout = (text, maxWords, isTitle = false) => {
  if (!text) return '';
  
  // Split into words and enforce limits
  const words = text.trim().split(/\s+/);
  const limitedWords = words.slice(0, maxWords);
  
  if (isTitle) {
    // Title: max 5 words, capitalize first letter of each word
    return limitedWords
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } else {
    // Paragraph: max 100 words, format as clean paragraph
    const paragraph = limitedWords.join(' ');
    // Ensure it ends with proper punctuation
    if (paragraph && !paragraph.match(/[.!?]$/)) {
      return paragraph + '.';
    }
    return paragraph;
  }
};

// Format text for PowerPoint slide elements
const formatTextForSlide = (text, isTitle = false) => {
  const maxWords = isTitle ? 5 : 100;
  const formattedText = formatTextForLayout(text, maxWords, isTitle);
  
  if (isTitle) {
    return [{ text: formattedText, options: { fontSize: 24, bold: true, color: '363636' } }];
  } else {
    return [{ text: formattedText, options: { fontSize: 14, color: '363636' } }];
  }
};

// Upload PPT file to Supabase Storage
const uploadPPTToSupabase = async (filePath, presentationId, uid) => {
  try {
    const supabase = getSupabaseClient();
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = `presentation_${presentationId}.pptx`;
    const storagePath = `users/${uid}/presentations/${fileName}`;
    
    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('user-uploads')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true
      });
    
    if (uploadError) {
      console.error('PPT upload to Supabase failed:', uploadError);
      return null;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('user-uploads')
      .getPublicUrl(storagePath);
    
    console.log(`PPT uploaded to Supabase: ${urlData.publicUrl}`);
    return urlData.publicUrl;
    
  } catch (error) {
    console.error('Error uploading PPT to Supabase:', error);
    return null;
  }
};

// Simplified Layout System - Clean Structure with No Overlap
const calculateSimpleLayout = (hasImage, hasChart, imagePosition = 'right') => {
  const SLIDE_WIDTH = 10;
  const SLIDE_HEIGHT = 7.5;
  const MARGIN = 0.5;
  const HEADER_HEIGHT = 0.8;
  const FOOTER_HEIGHT = 0.4;
  const FOOTER_Y = SLIDE_HEIGHT - FOOTER_HEIGHT - 0.2;
  
  // Calculate available content area
  const contentStartY = MARGIN + HEADER_HEIGHT + 0.3;
  const contentEndY = FOOTER_Y - 0.3;
  const availableContentHeight = contentEndY - contentStartY;
  const availableContentWidth = SLIDE_WIDTH - (2 * MARGIN);
  
  // Simple two-column layout: text + visual
  const layout = {
    header: { 
      x: MARGIN, 
      y: MARGIN, 
      w: availableContentWidth, 
      h: HEADER_HEIGHT 
    },
    footer: { 
      x: MARGIN, 
      y: FOOTER_Y, 
      w: availableContentWidth, 
      h: FOOTER_HEIGHT 
    }
  };
  
  if (hasImage || hasChart) {
    // Two-column layout: text on one side, visual on the other
    const textWidth = availableContentWidth * 0.48;
    const visualWidth = availableContentWidth * 0.48;
    const gap = availableContentWidth * 0.04;
    
    if (imagePosition === 'left') {
      layout.visual_area = {
        x: MARGIN,
        y: contentStartY,
        w: visualWidth,
        h: availableContentHeight
      };
      layout.text_area = {
        x: MARGIN + visualWidth + gap,
        y: contentStartY,
        w: textWidth,
        h: availableContentHeight
      };
    } else {
      layout.text_area = {
        x: MARGIN,
        y: contentStartY,
        w: textWidth,
        h: availableContentHeight
      };
      layout.visual_area = {
        x: MARGIN + textWidth + gap,
        y: contentStartY,
        w: visualWidth,
        h: availableContentHeight
      };
    }
  } else {
    // Full-width text layout
    layout.text_area = {
      x: MARGIN,
      y: contentStartY,
      w: availableContentWidth,
      h: availableContentHeight
    };
  }
  
  return layout;
};

// Advanced Content Overlap Prevention and Boundary Management
const analyzeAndPreventOverlap = (layout, elements) => {
  const SLIDE_WIDTH = 10;
  const SLIDE_HEIGHT = 7.5;
  const MIN_SPACING = 0.1;
  
  const adjustedElements = [];
  const reservedAreas = [
    layout.header,
    layout.footer,
    layout.image_area,
    layout.chart_area
  ].filter(area => area !== null);
  
  // Check for overlaps and adjust positions
  const checkOverlap = (elem1, elem2) => {
    return !(elem1.x + elem1.w <= elem2.x || 
             elem2.x + elem2.w <= elem1.x || 
             elem1.y + elem1.h <= elem2.y || 
             elem2.y + elem2.h <= elem1.y);
  };
  
  elements.forEach((element, index) => {
    let { x, y, w, h, type } = element;
    
    // Strict boundary enforcement
    const maxX = SLIDE_WIDTH - w;
    const maxY = SLIDE_HEIGHT - h;
    
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    
    // Ensure element fits within designated area
    if (type === 'image' && layout.image_area) {
      const area = layout.image_area;
      x = area.x;
      y = area.y;
      w = Math.min(w, area.w);
      h = Math.min(h, area.h);
    } else if (type === 'chart' && layout.chart_area) {
      const area = layout.chart_area;
      x = area.x;
      y = area.y;
      w = Math.min(w, area.w);
      h = Math.min(h, area.h);
    } else if (type === 'content' || type === 'header' || type === 'footer') {
      // Content elements must stay within their designated areas
      const contentArea = type === 'header' ? layout.header : 
                         type === 'footer' ? layout.footer : 
                         layout.content.main;
      
      if (contentArea) {
        x = Math.max(contentArea.x, Math.min(x, contentArea.x + contentArea.w - w));
        y = Math.max(contentArea.y, Math.min(y, contentArea.y + contentArea.h - h));
        w = Math.min(w, contentArea.w);
        h = Math.min(h, contentArea.h);
      }
    }
    
    // Check for overlaps with previously placed elements
    for (let i = 0; i < adjustedElements.length; i++) {
      const existingElement = adjustedElements[i];
      const currentElement = { x, y, w, h, type };
      
      if (checkOverlap(currentElement, existingElement)) {
        // Adjust position to avoid overlap
        if (type === 'left_content' || type === 'right_content') {
          // For content elements, adjust vertically
          y = existingElement.y + existingElement.h + MIN_SPACING;
          // Ensure it doesn't go beyond slide boundaries
          if (y + h > SLIDE_HEIGHT - MIN_SPACING) {
            y = Math.max(0, SLIDE_HEIGHT - h - MIN_SPACING);
            h = Math.min(h, SLIDE_HEIGHT - y - MIN_SPACING);
          }
        }
      }
    }
    
    // Final boundary check
    x = Math.max(0, Math.min(x, SLIDE_WIDTH - w));
    y = Math.max(0, Math.min(y, SLIDE_HEIGHT - h));
    
    adjustedElements.push({ ...element, x, y, w, h });
  });
  
  return adjustedElements;
};

// Generate PowerPoint file with enhanced features
const generateEnhancedPPTFile = async (presentationData, presentationId, uid) => {
  try {
    // Define slide constants
    const SLIDE_WIDTH = 10;
    const SLIDE_HEIGHT = 7.5;
    const MARGIN = 0.5;
    const HEADER_HEIGHT = 0.8;
    const FOOTER_HEIGHT = 0.4;
    
    const pptx = new PptxGenJS();
    
    // Set presentation properties
    pptx.author = 'MatrixAI';
    pptx.company = 'MatrixAI';
    pptx.revision = '1';
    pptx.subject = presentationData.title || 'AI Generated Presentation';
    pptx.title = presentationData.title || 'MatrixAI Presentation';
    
    // Enhanced slide themes with local default backgrounds
    const slideThemes = {
      title: { 
        background: { 
          fill: '1f4e79',
          path: presentationData.background_image_url || path.join(__dirname, '../../assets/default-title.svg')
        },
        titleColor: 'FFFFFF',
        subtitleColor: 'E6E6E6'
      },
      content: { 
        background: { 
          fill: 'f8f9fa',
          path: presentationData.background_image_url || path.join(__dirname, '../../assets/default-content.svg')
        },
        headerColor: '1f4e79',
        textColor: '333333',
        accentColor: '0066cc'
      },
      visual: { 
        background: { 
          fill: 'ffffff',
          path: presentationData.background_image_url || path.join(__dirname, '../../assets/default-visual.svg')
        },
        headerColor: '2c3e50',
        textColor: '34495e',
        accentColor: '3498db'
      }
    };
    
    // Enhanced content generation for better quality
    const enhanceContentQuality = (content, maxLength) => {
      if (!content) return '';
      
      // Add more substantial content if too short
      if (content.length < maxLength * 0.3) {
        const additionalContent = [
          ' This topic requires comprehensive understanding and detailed analysis.',
          ' Key factors include strategic planning, implementation, and continuous evaluation.',
          ' Best practices suggest focusing on measurable outcomes and stakeholder engagement.',
          ' Research indicates that systematic approaches yield better results.',
          ' Industry standards emphasize the importance of quality assurance and documentation.'
        ];
        
        let enhanced = content;
        for (const addition of additionalContent) {
          if (enhanced.length + addition.length <= maxLength) {
            enhanced += addition;
          } else {
            break;
          }
        }
        return enhanced;
      }
      
      return content.length > maxLength ? content.substring(0, maxLength - 3) + '...' : content;
    };
    
    // Unified intelligent layout calculator (replaces duplicate function)
    const calculateIntelligentLayout = (contentType, hasImage, hasChart) => {
      return calculateEnhancedLayout(contentType, hasImage, hasChart, null);
    };
    
    // Advanced text formatter with strict length control and professional formatting
     const formatTextForLayout = (text, layout, contentType) => {
       if (!text || !layout) return [];
       
       // Calculate safe text limits based on layout dimensions
       const layoutWidth = layout.w || 5;
       const layoutHeight = layout.h || 3;
       const avgCharsPerInch = 12; // Approximate characters per inch at standard font size
       const avgLinesPerInch = 6;  // Approximate lines per inch
       
       const maxCharsPerLine = Math.floor(layoutWidth * avgCharsPerInch);
       const maxLines = Math.min(
         Math.floor(layoutHeight * avgLinesPerInch),
         contentType === 'text-heavy' ? 12 : contentType === 'visual-heavy' ? 6 : 8
       );
       const maxTotalChars = maxCharsPerLine * maxLines;
       
       // Intelligent text truncation with sentence preservation
       let processedText = text;
       if (text.length > maxTotalChars) {
         const sentences = text.split(/[.!?]+/);
         let truncatedText = '';
         
         for (const sentence of sentences) {
           const potentialText = truncatedText + sentence + '. ';
           if (potentialText.length <= maxTotalChars - 3) {
             truncatedText = potentialText;
           } else {
             break;
           }
         }
         
         processedText = truncatedText || text.substring(0, maxTotalChars - 3) + '...';
       }
       
       // Create professional bullet points
       const sentences = processedText.split(/[.!?]+/).filter(s => s.trim().length > 8);
       const points = [];
       
       for (let i = 0; i < sentences.length && points.length < maxLines; i++) {
         const sentence = sentences[i].trim();
         if (!sentence) continue;
         
         if (sentence.length <= maxCharsPerLine) {
           points.push({
             text: sentence,
             options: {
               bullet: true,
               fontSize: contentType === 'text-heavy' ? 16 : contentType === 'visual-heavy' ? 12 : 14,
               color: '2C3E50'
             }
           });
         } else {
           // Word wrap long sentences
           const words = sentence.split(' ');
           let currentLine = '';
           
           for (const word of words) {
             const testLine = currentLine ? `${currentLine} ${word}` : word;
             
             if (testLine.length <= maxCharsPerLine) {
               currentLine = testLine;
             } else {
               if (currentLine && points.length < maxLines) {
                 points.push({
                   text: currentLine,
                   options: {
                     bullet: true,
                     fontSize: contentType === 'text-heavy' ? 16 : contentType === 'visual-heavy' ? 12 : 14,
                     color: '2C3E50'
                   }
                 });
               }
               currentLine = word;
               if (points.length >= maxLines) break;
             }
           }
           
           if (currentLine && points.length < maxLines) {
             points.push({
               text: currentLine,
               options: {
                 bullet: true,
                 fontSize: contentType === 'text-heavy' ? 16 : contentType === 'visual-heavy' ? 12 : 14,
                 color: '2C3E50'
               }
             });
           }
         }
       }
       
       return points.slice(0, maxLines);
     };
    
    // Helper function to prevent text overflow
    const safeText = (text, maxLength) => {
      if (!text) return '';
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    };
    
    // Create enhanced title slide with default background
    const titleSlide = pptx.addSlide();
    
    // Add professional background to title slide
    try {
      const titleBgPath = slideThemes.title.background.path;
      if (titleBgPath && fs.existsSync(titleBgPath)) {
        titleSlide.addImage({
          path: titleBgPath,
          x: 0, y: 0, w: 10, h: 7.5,
          sizing: { type: 'cover', w: 10, h: 7.5 }
        });
      } else {
        titleSlide.background = { fill: slideThemes.title.background.fill };
      }
    } catch (bgError) {
      console.log('Using solid background for title slide');
      titleSlide.background = { fill: slideThemes.title.background.fill };
    }
    
    // Professional header accent bar
    titleSlide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 0.3,
      fill: { color: '2E86AB' }
    });
    
    // Main title with precise positioning
    titleSlide.addText(safeText(presentationData.presentation_title || 'AI Generated Presentation', 80), {
      x: 0.5, y: 1.8, w: 9, h: 1.5,
      fontSize: 42, bold: true, color: slideThemes.title.titleColor,
      align: 'center', valign: 'middle'
    });
    
    // Professional subtitle
    titleSlide.addText('AI-Generated Presentation', {
      x: 0.5, y: 3.5, w: 9, h: 0.8,
      fontSize: 20, color: slideThemes.title.subtitleColor,
      align: 'center', valign: 'middle'
    });
    
    // Description text
    titleSlide.addText(safeText(presentationData.description || 'Generated by MatrixAI', 120), {
      x: 0.5, y: 4.5, w: 9, h: 0.8,
      fontSize: 16, color: slideThemes.title.subtitleColor,
      align: 'center', valign: 'middle'
    });
    
    // MatrixAI branding footer
    titleSlide.addText('Powered by MatrixAI', {
      x: 0.5, y: 6, w: 9, h: 0.4,
      fontSize: 14, color: 'CCCCCC',
      align: 'center', valign: 'middle'
    });
    
    titleSlide.addText(`Generated on ${new Date().toLocaleDateString()}`, {
      x: 0.5, y: 6.5, w: 9, h: 0.4,
      fontSize: 12, color: 'CCCCCC',
      align: 'center'
    });
    
    // Add bottom decorative line
    titleSlide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 7.3, w: 10, h: 0.2,
      fill: { color: '2E86AB' }
    });
    
    // Create enhanced content slides with advanced features
    for (let i = 0; i < presentationData.pages.length; i++) {
      const pageData = presentationData.pages[i];
      const slide = pptx.addSlide();
      
      // Determine content strategy
      const hasImage = pageData.image_url || pageData.needs_image;
      const hasChart = pageData.chart_data && Object.keys(pageData.chart_data).length > 0;
      const contentType = pageData.content_type || (hasImage && hasChart ? 'visual-heavy' : hasImage || hasChart ? 'mixed' : 'text-heavy');
      
      // Set theme based on content type
      const theme = contentType === 'visual-heavy' ? slideThemes.visual : slideThemes.content;
      
      // Add professional background to content slide
      try {
        const contentBgPath = theme.background.path;
        if (contentBgPath && fs.existsSync(contentBgPath)) {
          slide.addImage({
            path: contentBgPath,
            x: 0, y: 0, w: 10, h: 7.5,
            sizing: { type: 'cover', w: 10, h: 7.5 }
          });
        } else {
          slide.background = { fill: theme.background.fill };
        }
      } catch (bgError) {
        console.log(`Using solid background for slide ${i + 1}`);
        slide.background = { fill: theme.background.fill };
      }
      
      // Use simplified layout with clean structure
      const imagePosition = Math.random() > 0.5 ? 'left' : 'right'; // Random positioning
      const layout = calculateSimpleLayout(hasImage, hasChart, imagePosition);
      
      // Add title (max 5 words)
      const titleText = pageData.content?.header_content || pageData.header || `Page ${i + 1} Title`;
      const formattedTitle = formatTextForSlide(titleText, true);
      
      slide.addText(formattedTitle, {
        x: layout.header.x, y: layout.header.y, 
        w: layout.header.w, h: layout.header.h,
        align: 'center', valign: 'middle'
      });
      
      // Add paragraph content (max 100 words) to text area
      const paragraphText = pageData.content?.body_center_content || 
                           pageData.content?.body_left_content || 
                           pageData.content?.body_right_content || 
                           pageData.body_center || 
                           pageData.body_left || 
                           pageData.body_right || 
                           'This is sample content for the presentation slide.';
      
      const formattedParagraph = formatTextForSlide(paragraphText, false);
      
      if (layout.text_area) {
        slide.addText(formattedParagraph, {
          x: layout.text_area.x, y: layout.text_area.y,
          w: layout.text_area.w, h: layout.text_area.h,
          valign: 'top'
        });
      }
      
      // Add image/chart to visual area if available
      if (layout.visual_area && (hasImage || hasChart)) {
        try {
          const imagePath = path.join(process.cwd(), 'generated_images', `${presentationId}_page_${i + 1}.png`);
          
          // Try to add image first
          if (hasImage && (pageData.image_url || fs.existsSync(imagePath))) {
            const imageSource = pageData.image_url || imagePath;
            slide.addImage({
              path: imageSource,
              x: layout.visual_area.x, y: layout.visual_area.y, 
              w: layout.visual_area.w, h: layout.visual_area.h,
              sizing: { type: 'cover', w: layout.visual_area.w, h: layout.visual_area.h }
            });
            console.log(`✅ Added image to page ${i + 1}`);
          } else if (hasChart && pageData.chart_data) {
            // Add simple chart placeholder
            slide.addShape(pptx.ShapeType.rect, {
              x: layout.visual_area.x, y: layout.visual_area.y, 
              w: layout.visual_area.w, h: layout.visual_area.h,
              fill: { color: 'F0F8FF' },
              line: { color: theme.accentColor, width: 2, dashType: 'dash' }
            });
            
            slide.addText('📊\nChart/Graph\nPlaceholder', {
              x: layout.visual_area.x, y: layout.visual_area.y + layout.visual_area.h/2 - 0.3, 
              w: layout.visual_area.w, h: 0.6,
              fontSize: 14, color: theme.accentColor, bold: true,
              align: 'center', valign: 'middle'
            });
            
            console.log(`📋 Added chart placeholder to page ${i + 1}`);
          } else {
            // Add simple placeholder
            slide.addShape(pptx.ShapeType.rect, {
              x: layout.visual_area.x, y: layout.visual_area.y, 
              w: layout.visual_area.w, h: layout.visual_area.h,
              fill: { color: 'F0F8FF' },
              line: { color: '0066cc', width: 2, dashType: 'dash' }
            });
            
            slide.addText('📊\nVisual\nContent', {
              x: layout.visual_area.x, y: layout.visual_area.y + layout.visual_area.h/2 - 0.3, 
              w: layout.visual_area.w, h: 0.6,
              fontSize: 14, color: '0066cc',
              align: 'center', valign: 'middle', bold: true
            });
            console.log(`📋 Added visual placeholder to page ${i + 1}`);
          }
        } catch (error) {
          console.log(`⚠️ Visual content failed for page ${i + 1}:`, error.message);
        }
      }
      
      // Add simple footer
      slide.addText(`Page ${i + 1} | Generated by MatrixAI`, {
        x: layout.footer.x, y: layout.footer.y,
        w: layout.footer.w, h: layout.footer.h,
        fontSize: 10, color: '999999',
        align: 'center', valign: 'middle'
      });
      
      // Add simple chart/graph if available
      if (layout.visual_area && hasChart) {
        slide.addShape(pptx.ShapeType.rect, {
          x: layout.visual_area.x, y: layout.visual_area.y, 
          w: layout.visual_area.w, h: layout.visual_area.h,
          fill: { color: 'F0F8FF' },
          line: { color: theme.accentColor, width: 2, dashType: 'dash' }
        });
        
        slide.addText('📊\nChart/Graph\nPlaceholder', {
          x: layout.visual_area.x, y: layout.visual_area.y + layout.visual_area.h/2 - 0.3, 
          w: layout.visual_area.w, h: 0.6,
          fontSize: 14, color: theme.accentColor, bold: true,
          align: 'center', valign: 'middle'
        });
        
        console.log(`📋 Added simple chart placeholder to page ${i + 1}`);
      }
      
      // Add simple footer
      slide.addText(`Page ${i + 1} • Generated by MatrixAI`, {
        x: 0.5, y: SLIDE_HEIGHT - 0.5, w: SLIDE_WIDTH - 1, h: 0.3,
        fontSize: 10, color: '999999', align: 'center'
      });
    }
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'generated_presentations');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate file path
    const fileName = `presentation_${presentationId}.pptx`;
    const filePath = path.join(outputDir, fileName);
    
    // Write the file
    await pptx.writeFile({ fileName: filePath });
    
    console.log(`Enhanced PPT file generated with advanced layout: ${filePath}`);
    console.log(`- Content strategy applied for ${presentationData.pages.length} pages`);
    console.log(`- Enhanced layout with fixed positioning completed`);
    console.log(`- Overlap prevention analysis applied`);
    console.log(`- Default backgrounds and advanced charts integrated`);
    
    // Upload to Supabase and get download URL
    try {
      const downloadUrl = await uploadPPTToSupabase(filePath, presentationId, uid);
      console.log(`✅ PPT uploaded to Supabase: ${downloadUrl}`);
      
      // Clean up local file after successful upload
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Local PPT file cleaned up');
      }
      
      return {
        success: true,
        filePath: downloadUrl, // Return Supabase URL instead of local path
        fileName: fileName,
        downloadUrl: downloadUrl,
        supabaseUrl: downloadUrl
      };
    } catch (uploadError) {
      console.error('Failed to upload PPT to Supabase:', uploadError);
      // Return local path as fallback
      return {
        success: true,
        filePath: filePath,
        fileName: fileName,
        downloadUrl: `/api/presentation/download/${presentationId}`,
        error: 'Upload to cloud storage failed, using local storage'
      };
    }
    
  } catch (error) {
    console.error('PPT generation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Simple chart placeholder - no complex generation needed

// Enhance content quality with strict word limit (50-100 words)
const enhanceContentQuality = (originalContent, targetLength = 100) => {
  if (!originalContent || originalContent.trim().length === 0) {
    return 'Content will be generated based on the presentation topic and context.';
  }
  
  const content = originalContent.trim();
  const words = content.split(/\s+/);
  
  // Limit to 50-100 words maximum
  const maxWords = Math.min(100, Math.max(50, targetLength));
  
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(' ') + '...';
  }
  
  // If content is too short (less than 50 words), add minimal context
  if (words.length < 50) {
    const additionalWords = [
      'This topic requires understanding and analysis.',
      'Key factors include planning and implementation.',
      'Best practices focus on effective outcomes.'
    ];
    
    let enhancedContent = content;
    for (const addition of additionalWords) {
      const newWords = enhancedContent.split(/\s+/).concat(addition.split(/\s+/));
      if (newWords.length <= maxWords) {
        enhancedContent += ' ' + addition;
      } else {
        break;
      }
    }
    return enhancedContent.trim();
  }
  
  return content;
};

// Main Presentation Creation API
router.all('/createPresentation', async (req, res) => {
  console.log('Request to /createPresentation endpoint:', req.method);
  console.log('Request body:', req.body);
  console.log('Request query:', req.query);

  try {
    const { uid, description, pages, purpose } = req.body;

    // Validate required parameters
    if (!uid || !description || !pages || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: uid, description, pages, purpose'
      });
    }

    // Validate pages number
    const numPages = parseInt(pages);
    if (isNaN(numPages) || numPages < 1 || numPages > 20) {
      return res.status(400).json({
        success: false,
        message: 'Pages must be a number between 1 and 20'
      });
    }

    // Calculate coin cost (10 coins per page)
    const coinCost = numPages * 10;
    
    // Deduct coins first
    const coinResult = await deductCoins(uid, coinCost, 'Presentation Creation');
    if (!coinResult.success) {
      return res.status(400).json({
        success: false,
        message: coinResult.message
      });
    }

    const presentationId = uuidv4();
    const supabase = getSupabaseClient();

    // Create initial presentation record
    const { error: insertError } = await supabase
      .from('presentations')
      .insert([{
        id: presentationId,
        uid: uid,
        description: description,
        pages: numPages,
        purpose: purpose,
        status: 'processing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    if (insertError) {
      console.error('Error creating presentation record:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create presentation record'
      });
    }

    // Start async processing
    processPresentation(presentationId, uid, description, numPages, purpose);

    res.json({
      success: true,
      message: 'Presentation creation started',
      presentationId: presentationId,
      estimatedTime: `${numPages * 2} minutes`,
      coinsCost: coinCost
    });

  } catch (error) {
    console.error('Error in createPresentation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Async Presentation Processing Function
const processPresentation = async (presentationId, uid, description, pages, purpose) => {
  try {
    const supabase = getSupabaseClient();
    
    // STEP 0: Intelligent Content Strategy Decision
    console.log(`Step 0: Analyzing content strategy for ${presentationId}`);
    
    const strategyResult = await decideContentStrategy(description, pages, purpose);
    let contentStrategy = null;
    
    if (strategyResult.success) {
      try {
        let strategyContent = strategyResult.content;
        if (strategyContent.includes('```json')) {
          const jsonMatch = strategyContent.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            strategyContent = jsonMatch[1];
          }
        }
        contentStrategy = JSON.parse(strategyContent.trim());
        console.log(`Content strategy decided: ${contentStrategy.overall_strategy}`);
      } catch (parseError) {
        console.log('Failed to parse strategy, using default approach');
      }
    }
    
    // STEP 1: Master AI Agent - Create Intelligent Presentation Structure
    console.log(`Step 1: Creating intelligent presentation structure for ${presentationId}`);
    
    const structurePrompt = `
      Create a detailed structure for a ${pages}-page presentation about "${description}" for the purpose of "${purpose}".
      
      ${contentStrategy ? `CONTENT STRATEGY: ${contentStrategy.overall_strategy}
      Apply the following content decisions for each page:
      ${contentStrategy.pages.map(p => `Page ${p.page_number}: ${p.content_type} layout, ${p.visual_elements.needs_image ? p.visual_elements.image_type + ' image' : 'no image'}, ${p.visual_elements.needs_chart ? p.visual_elements.chart_type + ' chart' : 'no chart'}`).join('\n      ')}
      ` : ''}
      
      CRITICAL LAYOUT REQUIREMENTS:
      - NO content overlap - each element has dedicated space
      - Text must fit within designated areas
      - Images and charts have fixed, non-overlapping positions
      - Content length MUST respect layout constraints
      
      CONTENT LIMITS (STRICTLY ENFORCED):
      - Header: max 60 characters
      - Footer: max 40 characters  
      - Main content: max 50-100 words (will be formatted as bullet points)
      - Chart labels: max 15 characters each
      - Image descriptions: max 100 characters
      
      Respond in JSON format with this structure:
      {
        "presentation_title": "Main title (max 60 characters)",
        "background_theme": "Professional background description",
        "pages": [
          {
            "page_number": 1,
            "content_type": "text-heavy/visual-heavy/mixed",
            "header": "Page title (max 60 chars)",
            "footer": "Footer text (max 40 chars)",
            "body_center": "Main content (50-100 words)",
            "needs_image": true/false,
            "image_prompt": "Specific image description (max 100 chars)",
            "needs_chart": true/false,
            "chart_data": {
              "type": "bar/line/pie/table",
              "title": "Chart title (max 30 chars)",
              "labels": ["Label1", "Label2", "Label3"],
              "data": [25, 45, 67]
            }
          }
        ]
      }
      
      ENSURE:
      - Each page has a clear purpose and distinct content
      - Visual elements support the content, don't compete
      - Layout is optimized for readability
      - No text overflow or element overlap
    `;

    const structureResult = await callAIAgent(
      structurePrompt,
      'You are an expert presentation designer who creates concise, structured, professional presentation content. Focus on clarity, brevity, and educational value. Always provide realistic data for charts and specific descriptions for images.'
    );

    if (!structureResult.success) {
      throw new Error('Failed to generate presentation structure');
    }

    let presentationStructure;
    try {
      // Extract JSON from markdown code blocks if present
      let jsonContent = structureResult.content;
      if (jsonContent.includes('```json')) {
        const jsonMatch = jsonContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonContent = jsonMatch[1];
        }
      } else if (jsonContent.includes('```')) {
        const jsonMatch = jsonContent.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonContent = jsonMatch[1];
        }
      }
      
      presentationStructure = JSON.parse(jsonContent.trim());
      
      // Validate and clean the structure
      if (presentationStructure.pages) {
        presentationStructure.pages.forEach(page => {
          // Ensure text limits are respected
          if (page.header && page.header.length > 50) {
            page.header = page.header.substring(0, 47) + '...';
          }
          if (page.body_left && page.body_left.length > 200) {
            page.body_left = page.body_left.substring(0, 197) + '...';
          }
          if (page.body_center && page.body_center.length > 300) {
            page.body_center = page.body_center.substring(0, 297) + '...';
          }
          if (page.body_right && page.body_right.length > 150) {
            page.body_right = page.body_right.substring(0, 147) + '...';
          }
          if (page.footer && page.footer.length > 40) {
            page.footer = page.footer.substring(0, 37) + '...';
          }
          
          // Ensure chart data has proper structure
          if (page.needs_chart && page.chart_data) {
            if (!page.chart_data.labels || !Array.isArray(page.chart_data.labels)) {
              page.chart_data.labels = ['Item 1', 'Item 2', 'Item 3'];
            }
            if (!page.chart_data.data || !Array.isArray(page.chart_data.data)) {
              page.chart_data.data = [10, 20, 30];
            }
            if (!page.chart_data.title) {
              page.chart_data.title = 'Data Chart';
            }
            if (!page.chart_data.type) {
              page.chart_data.type = 'bar';
            }
          }
        });
      }
      
    } catch (parseError) {
      console.error('Failed to parse structure JSON:', parseError);
      console.error('Raw content:', structureResult.content);
      throw new Error('Invalid structure format from AI');
    }

    // Update presentation with structure
    await supabase
      .from('presentations')
      .update({
        structure: presentationStructure,
        status: 'generating_content',
        updated_at: new Date().toISOString()
      })
      .eq('id', presentationId);

    // STEP 2: Generate Background Image (with error bypass)
    console.log(`Step 2: Generating background image for ${presentationId}`);
    
    let backgroundImageUrl = null;
    let backgroundImageGenerated = false;
    const defaultBackgroundUrl = 'https://ddtgdhehxhgarkonvpfq.supabase.co/storage/v1/object/public/user-uploads/appFiles/White%20and%20Orange%20Simple%20Portfolio%20Presentation.png';
    
    try {
      const bgImageResult = await generateImage(presentationStructure.background_theme, uid);
      if (bgImageResult.success) {
        backgroundImageUrl = bgImageResult.imageData.image_url;
        backgroundImageGenerated = true;
        console.log('Background image generated successfully');
      } else {
        backgroundImageUrl = defaultBackgroundUrl;
        console.log('Background image generation failed, using default background image');
      }
    } catch (error) {
      console.log('Background image generation failed, using default background image:', error.message);
      backgroundImageUrl = defaultBackgroundUrl;
    }

    // STEP 3: Process Each Page
    console.log(`Step 3: Processing ${pages} pages for ${presentationId}`);
    
    const processedPages = [];
    
    for (let i = 0; i < presentationStructure.pages.length; i++) {
      const pageData = presentationStructure.pages[i];
      console.log(`Processing page ${pageData.page_number}`);
      
      // Generate detailed content for each section
      const contentPrompt = `
        Generate detailed content for page ${pageData.page_number} of the presentation.
        
        Page structure:
        - Header: ${pageData.header}
        - Body Left: ${pageData.body_left}
        - Body Center: ${pageData.body_center}
        - Body Right: ${pageData.body_right}
        - Footer: ${pageData.footer}
        
        IMPORTANT WORD LIMITS:
        - header_content: Maximum 50 words
        - body_left_content: Maximum 60-80 words
        - body_center_content: Maximum 50-100 words (main content)
        - body_right_content: Maximum 60-80 words
        - footer_content: Maximum 20 words
        
        Respond in JSON format:
        {
          "header_content": "Actual header text (max 50 words)",
          "body_left_content": "Detailed left content (max 60-80 words)",
          "body_center_content": "Detailed main content (max 50-100 words)",
          "body_right_content": "Detailed right content (max 60-80 words)",
          "footer_content": "Footer text (max 20 words)"
        }
      `;
      
      const contentResult = await callAIAgent(
        contentPrompt,
        'You are a content writer expert. Create engaging, informative content for presentations. STRICTLY follow word limits: header (max 50 words), body sections (50-100 words each), footer (max 20 words). Ensure each section has unique, non-overlapping content. Be concise and impactful.'
      );
      
      let pageContent = {};
      if (contentResult.success) {
        try {
          // Extract JSON from markdown code blocks if present
          let jsonContent = contentResult.content;
          if (jsonContent.includes('```json')) {
            const jsonMatch = jsonContent.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              jsonContent = jsonMatch[1];
            }
          } else if (jsonContent.includes('```')) {
            const jsonMatch = jsonContent.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              jsonContent = jsonMatch[1];
            }
          }
          
          pageContent = JSON.parse(jsonContent.trim());
          
          // Apply word limits to generated content (50-100 words per section)
          if (pageContent.body_center_content) {
            pageContent.body_center_content = enhanceContentQuality(pageContent.body_center_content, 100);
          }
          if (pageContent.body_left_content) {
            pageContent.body_left_content = enhanceContentQuality(pageContent.body_left_content, 80);
          }
          if (pageContent.body_right_content) {
            pageContent.body_right_content = enhanceContentQuality(pageContent.body_right_content, 80);
          }
          if (pageContent.header_content) {
            pageContent.header_content = enhanceContentQuality(pageContent.header_content, 60);
          }
          
        } catch (parseError) {
          console.error('Failed to parse content JSON:', parseError);
          console.error('Raw content:', contentResult.content);
          pageContent = {
            header_content: enhanceContentQuality(pageData.header, 60),
            body_left_content: enhanceContentQuality(pageData.body_left, 80),
            body_center_content: enhanceContentQuality(pageData.body_center, 100),
            body_right_content: enhanceContentQuality(pageData.body_right, 80),
            footer_content: pageData.footer
          };
        }
      }
      
      // Generate image if needed (with error bypass)
      let pageImageUrl = null;
      let pageImageGenerated = false;
      const defaultImageUrl = 'https://ddtgdhehxhgarkonvpfq.supabase.co/storage/v1/object/public/user-uploads/appFiles/Screenshot%202025-08-02%20at%207.03.19%20AM.png';
      
      if (pageData.needs_image && pageData.image_prompt) {
        try {
          const imageResult = await generateImage(pageData.image_prompt, uid);
          if (imageResult.success) {
            pageImageUrl = imageResult.imageData.image_url;
            pageImageGenerated = true;
            console.log(`Page ${pageData.page_number} image generated successfully`);
          } else {
            pageImageUrl = defaultImageUrl;
            console.log(`Page ${pageData.page_number} image generation failed, using default image`);
          }
        } catch (error) {
          console.log(`Page ${pageData.page_number} image generation failed, using default image:`, error.message);
          pageImageUrl = defaultImageUrl;
        }
      }
      
      // Chart generation is now handled as placeholders in the slide generation
      let chartSvg = null;
      
      processedPages.push({
        ...pageData,
        content: pageContent,
        image_url: pageImageUrl,
        image_generated: pageImageGenerated,
        chart_svg: chartSvg
      });
      
      // Small delay between pages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // STEP 4: Finalize Presentation
    console.log(`Step 4: Finalizing presentation ${presentationId}`);
    
    const finalPresentation = {
      ...presentationStructure,
      background_image_url: backgroundImageUrl,
      pages: processedPages,
      generated_at: new Date().toISOString()
    };

    // STEP 5: Generate Enhanced PPT File with Supabase Upload
    console.log(`Step 5: Generating enhanced PPT file for presentation ${presentationId}`);
    const pptResult = await generateEnhancedPPTFile(finalPresentation, presentationId, uid);
    
    let pptDownloadUrl = null;
    if (pptResult.success) {
      pptDownloadUrl = pptResult.downloadUrl; // This is now the Supabase URL
      console.log(`Enhanced PPT file generated and uploaded successfully: ${pptResult.fileName}`);
      console.log(`Supabase download URL: ${pptDownloadUrl}`);
    } else {
      console.error(`Enhanced PPT generation failed: ${pptResult.error}`);
    }

    // Update presentation with final data
    await supabase
      .from('presentations')
      .update({
        structure: finalPresentation,
        background_image_url: backgroundImageUrl,
        ppt_download_url: pptDownloadUrl,
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', presentationId);

    console.log(`Presentation ${presentationId} completed successfully with PPT file`);

  } catch (error) {
    console.error(`Error processing presentation ${presentationId}:`, error);
    
    // Update presentation status to failed
    const supabase = getSupabaseClient();
    await supabase
      .from('presentations')
      .update({
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', presentationId);
  }
};

// Get Presentation Status API
router.all('/getPresentationStatus', async (req, res) => {
  try {
    const { presentationId } = req.body;
    
    if (!presentationId) {
      return res.status(400).json({
        success: false,
        message: 'Missing presentationId parameter'
      });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('presentations')
      .select('*')
      .eq('id', presentationId)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: 'Presentation not found'
      });
    }

    res.json({
      success: true,
      presentation: {
        id: data.id,
        title: data.title,
        description: data.description,
        status: data.status,
        created_at: data.created_at,
        completed_at: data.completed_at,
        structure: data.structure,
        background_image_url: data.background_image_url,
        ppt_download_url: data.ppt_download_url
      }
    });

  } catch (error) {
    console.error('Error getting presentation status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get User Presentations API
router.all('/getUserPresentations', async (req, res) => {
  try {
    const { uid } = req.body;
    
    if (!uid) {
      return res.status(400).json({
        success: false,
        message: 'Missing uid parameter'
      });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('presentations')
      .select('*')
      .eq('uid', uid)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch presentations'
      });
    }

    res.json({
      success: true,
      presentations: data
    });

  } catch (error) {
    console.error('Error getting user presentations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete Presentation API
router.all('/deletePresentation', async (req, res) => {
  try {
    const { presentationId, uid } = req.body;
    
    if (!presentationId || !uid) {
      return res.status(400).json({
        success: false,
        message: 'Missing presentationId or uid parameter'
      });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('presentations')
      .delete()
      .eq('id', presentationId)
      .eq('uid', uid);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete presentation'
      });
    }

    res.json({
      success: true,
      message: 'Presentation deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting presentation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Download PPT file endpoint
router.get('/download/:presentationId', async (req, res) => {
  try {
    const { presentationId } = req.params;
    
    if (!presentationId) {
      return res.status(400).json({
        success: false,
        message: 'Presentation ID is required'
      });
    }

    // Check if file exists
    const fileName = `presentation_${presentationId}.pptx`;
    const filePath = path.join(process.cwd(), 'generated_presentations', fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'PPT file not found'
      });
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error downloading PPT file:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;