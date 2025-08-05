const https = require('https');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class AntomPaymentService {
  constructor() {
    // Environment configuration
    this.isProduction = process.env.NODE_ENV === 'production' && process.env.ANTOM_PRODUCTION === 'true';
    
    this.clientId = this.isProduction ? 
      process.env.ANTOM_PRODUCTION_CLIENT_ID || "SANDBOX_5YEX0L302DFU04384" :
      "SANDBOX_5YEX0L302DFU04384";
    
    this.keyVersion = "1";
    this.privateKeyPem = this.isProduction ?
      process.env.ANTOM_PRODUCTION_PRIVATE_KEY || this.getSandboxPrivateKey() :
      this.getSandboxPrivateKey();
    
    this.hostname = "open-sea-global.alipay.com";
    this.basePath = this.isProduction ? "/ams/api/v1" : "/ams/sandbox/api/v1";
    this.merchantAccountId = this.isProduction ?
      process.env.ANTOM_PRODUCTION_MERCHANT_ID || "2188120017219837" :
      "2188120017219837";
    
    console.log(`🔧 Antom Payment Service initialized in ${this.isProduction ? 'PRODUCTION' : 'SANDBOX'} mode`);
  }

  getSandboxPrivateKey() {
    return `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCRkP6x7CxfD7gq+7QiDxGnoi6VfMuuaxH6+fxbHvUE/y7f9MTh4fUZ1d1IzPZS0DYqm7x3E5uFc83vnztB4WsqDJ40Xw0CQs7mqhnZfXoTOT0k91uiokKgA2CsOQ2QNiNFSTlSAXgj0zrS+77v5t0PeyJ1QO7lGyHG+PjCyz8ApOzTClw8gvbq+S9W/6MIxSRIgnQBjSBCVAayqIIv4c3mArY+Iw9wNHaP7ON9/jcMC28+svS0tabh8XrW2MTiUInU1W0aYOY86WkcLfqhjDtj22ZjzZT98PlSREmOPwVP04TQgbuosB3HoNLJm9P10b4z97C0zzMBWlFB77Ow9185AgMBAAECggEAGJzEg77kDbqxsArY/T1BBfAFIl90bOxLoPztr1Z/pTWkbleLhonXEGQ5wxpst7nevruQVS3qiNj4xABPW6dKoFR7120O3QgAxb2TG1P89Q0jioGMa+Y1j6qiiNwor+6HbiqgV35KGvyXIJ9SPGvziq+ONvcgrXo17tef8Ae/glMfKPhI8NcCjddKcymgrno5hK5PPhyPYmDj2Wqe9kdWAogBkNGkFWNPIiCa2HDEXc7e2OYgF1pnwXQtxCtr1bLojC5JmdtY4JSHebg2H0hEumy5E4Zh40P2GG0J7PSmxSgBHj9QgHAFXFiDOBo8AfNkk+t4PNXJH+KhyvEDSFD4BQKBgQDIP+7D1BwdLAbABX2sW9eV9tp2lLi1k8qyMceyuHjbY4BgGbcT2wcUnDqCMhEirN7rIKw+g6sKx7zf7N63AZmKRm8gaVzmI+70kXH+2R9t0lCkvszLvF9MOWGsTX+fVGom+CtUjjGQJwvQ81YtCp0EW4/RoktttbpvmW4xjsj5mwKBgQC6F7TcMB/8W2bF2awy4ONMaM8au4t+Ugb627TuCJRxXom6Img4Ik1STSf5FGV4wy36wSeEgok1pUL4SWLe4mJYONTT1qC8D+O+fNVyPd6hGmQ1rudLYM6ooSQr3Y4I0E6tPi/ZrNBu/BgrtTOnDZizq3Js9iTpjQ6G/Ycpzf1RuwKBgQCImmxjtHd1QwpbxaMkiAZ6K8p96BhU7bvxcVn8RjFT3/28EO6+IcUjvyt+k27zC6CKH2DAyItOsFDdJLYNe47lMAUwxA92g37H4cw1AKKbBUS0DeCg/yC3W9GQe9GavDgp21Obu+B9qNU7tjPMSBgy1881P5RbBARpiu4L6o6ZDwKBgDsHEgNV8I9nnq3bYdexpeeyxx6/pnunITepQTbP2eYsCpvUFiLYHpagirFjWtx3bLpBUnuhvEwb46ZGAOqZ/H/nZvra9ZkxoRfnGP1nyppneKnelNdAGc07b/HKESeSi6JAO4VcX7EUncYfcAbpNSqok18kpIjAiX8gJCOKh3PJAoGAfIJUmmC2CiJ87GIbRR4TmEoNqn2KVygo9Nc5zexnx9XAEikXurW2jOThMGp6bInIuiOGpLUHpP6pdkxjZZxZh8abRniDc8Sn4+dVFze0uRz0gc4Gh5QUF1Ji1Gtc3I6Ngpmajlf5+1RCZ3KXTclEfwiDYkVdGD1B005H+lrg0fg=
-----END PRIVATE KEY-----`;
    
    // Available payment methods
    this.paymentMethods = {
      // Digital Wallets (Philippines)
      GCASH: { name: 'GCash', currency: 'PHP', type: 'wallet', country: 'PH' },
      MAYA: { name: 'Maya', currency: 'PHP', type: 'wallet', country: 'PH' },
      SHOPEEPAY: { name: 'ShopeePay', currency: 'PHP', type: 'wallet', country: 'PH' },
      
      // Credit Cards
      VISA: { name: 'Visa', currency: 'PHP', type: 'card', country: 'GLOBAL' },
      MASTERCARD: { name: 'Mastercard', currency: 'PHP', type: 'card', country: 'GLOBAL' },
      AMERICAN_EXPRESS: { name: 'American Express', currency: 'PHP', type: 'card', country: 'GLOBAL' },
      
      // Other popular methods
      GRABPAY: { name: 'GrabPay', currency: 'PHP', type: 'wallet', country: 'PH' },
      PAYMAYA: { name: 'PayMaya', currency: 'PHP', type: 'wallet', country: 'PH' }
    };
  }

  /**
   * Generate a unique payment request ID
   */
  generatePaymentRequestId() {
    return "REQUEST_" + Date.now();
  }

  /**
   * Generate a unique reference order ID
   */
  generateReferenceOrderId() {
    return "ORDER_" + Date.now();
  }

  /**
   * Get available payment methods
   */
  getPaymentMethods() {
    return this.paymentMethods;
  }

  /**
   * Get payment method details
   */
  getPaymentMethodDetails(paymentMethodType) {
    return this.paymentMethods[paymentMethodType] || null;
  }

  /**
   * Create RSA signature for the request
   */
  createSignature(method, path, body) {
    const requestTime = new Date().toISOString();
    const signatureString = `${method} ${path}\n${this.clientId}.${requestTime}.${body}`;
    
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signatureString);
    sign.end();
    
    const signature = sign.sign(this.privateKeyPem, "base64");
    const signatureHeader = `algorithm=RSA256,keyVersion=${this.keyVersion},signature=${encodeURIComponent(signature)}`;
    
    return {
      requestTime,
      signatureHeader
    };
  }

  /**
   * Make HTTPS request to Antom API
   */
  makeRequest(path, method, body) {
    return new Promise((resolve, reject) => {
      const bodyString = JSON.stringify(body);
      const { requestTime, signatureHeader } = this.createSignature(method, path, bodyString);
      
      const options = {
        hostname: this.hostname,
        path,
        method,
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Client-Id": this.clientId,
          "Request-Time": requestTime,
          "Signature": signatureHeader,
          "Content-Length": Buffer.byteLength(bodyString)
        }
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${response.message || data}`));
            }
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.write(bodyString);
      req.end();
    });
  }

  /**
   * Create a payment request
   */
  async createPayment(paymentData) {
    try {
      const {
        amount,
        currency = "PHP",
        paymentMethodType = "GCASH",
        orderDescription = "EduSmart Payment",
        userId,
        notifyUrl,
        redirectUrl
      } = paymentData;

      const paymentRequestId = this.generatePaymentRequestId();
      const referenceOrderId = this.generateReferenceOrderId();
      const path = `${this.basePath}/payments/pay`;

      const requestBody = {
        paymentRequestId,
        paymentAmount: {
          currency,
          value: Math.round(amount * 100).toString() // Convert to minor units (cents)
        },
        paymentMethod: {
          paymentMethodType
        },
        order: {
          referenceOrderId,
          orderAmount: {
            currency,
            value: Math.round(amount * 100).toString() // Convert to minor units (cents)
          },
          orderDescription,
          buyer: {
            referenceBuyerId: userId || "defaultBuyer"
          }
        },
        env: {
          terminalType: "WEB",
          clientIp: "1.2.3.4"
        },
        productCode: "CASHIER_PAYMENT",
        paymentNotifyUrl: notifyUrl || "https://www.gaga.com/notify",
        paymentRedirectUrl: redirectUrl || "https://global.alipay.com/doc/cashierpayment/intro"
      };

      // Add payment factor for card payments
      if (paymentMethodType === 'CARD') {
        requestBody.paymentFactor = {
          isAuthorization: true
        };
      }

      console.log('🚀 Creating Antom payment:', {
        paymentRequestId,
        referenceOrderId,
        amount,
        currency,
        paymentMethodType
      });

      const response = await this.makeRequest(path, "POST", requestBody);
      
      console.log('✅ Payment created successfully:', response.result);

      return {
        success: true,
        paymentRequestId,
        referenceOrderId,
        data: response
      };
    } catch (error) {
      console.error('❌ Payment creation failed:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Query payment status
   */
  async queryPayment(paymentRequestId) {
    try {
      const path = `${this.basePath}/payments/inquiryPayment`;
      
      const requestBody = {
        paymentRequestId
      };

      console.log('🔍 Querying payment status:', paymentRequestId);

      const response = await this.makeRequest(path, "POST", requestBody);
      
      console.log('✅ Payment status retrieved:', response.result);

      return {
        success: true,
        data: response
      };
    } catch (error) {
      console.error('❌ Payment query failed:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(paymentRequestId) {
    try {
      const path = `${this.basePath}/payments/cancel`;
      
      const requestBody = {
        paymentRequestId
      };

      console.log('🚫 Cancelling payment:', paymentRequestId);

      const response = await this.makeRequest(path, "POST", requestBody);
      
      console.log('✅ Payment cancelled:', response.result);

      return {
        success: true,
        data: response
      };
    } catch (error) {
      console.error('❌ Payment cancellation failed:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(signature, requestTime, body) {
    try {
      const signatureString = `POST /webhook\n${this.clientId}.${requestTime}.${body}`;
      
      const verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(signatureString);
      verifier.end();
      
      // Extract signature from header format
      const signatureMatch = signature.match(/signature=([^,]+)/);
      if (!signatureMatch) {
        return false;
      }
      
      const decodedSignature = decodeURIComponent(signatureMatch[1]);
      return verifier.verify(this.privateKeyPem, decodedSignature, "base64");
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return false;
    }
  }
}

module.exports = AntomPaymentService;